import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common'
import type { Request } from 'express'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../../auth/guards/roles.guard'
import { Roles } from '../../auth/decorators/roles.decorador'
import { ROLES } from '../../auth/enums/roles.enum'
import {
  FIELD_SOURCES,
  FIELD_TRANSFORMS,
  FormatDefinition,
  PERSON_COLUMNS,
} from '../v2/document-model'
import { NUMBERING_KINDS } from '../v2/numbering'
import { FormatDefinitionService } from './format-definition.service'
import {
  SECTION_KINDS,
  validateDefinition,
} from './format-definition.validator'
import { ModuleGuard } from '../../../common/access/module.guard'
import { RequireModule } from '../../../common/access/require-module.decorator'
import { parseIntParam } from '../../../common/mongo/params'

/**
 * El maestro de formatos.
 *
 * Solo administradores: una definicion mal publicada afecta a todos los
 * documentos que se emitan despues, y esos documentos se firman y se auditan.
 */
@ApiTags('Format definitions')
@RequireModule('formatos')
@Controller('format/definitions')
@UseGuards(JwtAuthGuard, RolesGuard, ModuleGuard)
export class FormatDefinitionController {
  constructor(private readonly service: FormatDefinitionService) {}

  /**
   * Catalogos con los que la pantalla se construye sola.
   *
   * La alternativa seria repetir estas listas en el frontend, y entonces
   * añadir un origen nuevo obligaria a tocar los dos lados y a acordarse de
   * hacerlo. Aqui la pantalla ofrece exactamente lo que el motor sabe resolver.
   */
  @Get('catalog')
  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN)
  @ApiOperation({
    summary: 'Origenes, transformaciones y tipos que admite el modelo',
  })
  catalog() {
    return {
      sources: FIELD_SOURCES,
      transforms: FIELD_TRANSFORMS,
      personColumns: PERSON_COLUMNS,
      sectionKinds: SECTION_KINDS,
      numberingKinds: NUMBERING_KINDS,
      numberingScopes: ['year', 'global'],
      orientations: ['portrait', 'landscape'],
    }
  }

  @Get()
  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN)
  @ApiOperation({ summary: 'Tipos de formato con definicion' })
  list() {
    return this.service.listTypes()
  }

  @Get(':formatType')
  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN)
  @ApiOperation({
    summary: 'Definicion publicada y borrador en curso',
    description:
      'La publicada es la que emite los formatos. El borrador es lo que se esta editando y ' +
      'todavia no afecta a nada.',
  })
  async get(@Param('formatType') formatType: string) {
    // En serie y no en paralelo: `getDraftState` compara el borrador con lo
    // publicado, y para eso lo publicado tiene que estar ya resuelto.
    const published = await this.service.getPublished(formatType)
    const { definition: draft, staleDraft } = await this.service
      .getDraftState(formatType)
      .then(state => ({
        definition: state.definition,
        staleDraft: state.stale,
      }))

    return { published, draft, issues: validateDefinition(draft), staleDraft }
  }

  @Post(':formatType/draft/recover')
  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN)
  @ApiOperation({
    summary: 'Carga un borrador que se habia quedado atras',
    description:
      'Lo devuelve tal como se guardo, aunque la definicion publicada haya ' +
      'avanzado desde entonces. Es una accion explicita: por defecto se sirve ' +
      'lo publicado, que es lo que emite los formatos.',
  })
  async recoverDraft(@Param('formatType') formatType: string) {
    const draft = await this.service.getDraftAnyway(formatType)
    return { draft, issues: validateDefinition(draft) }
  }

  @Put(':formatType/draft')
  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN)
  @ApiOperation({
    summary: 'Guarda el borrador',
    description:
      'No valida: configurar es un proceso y una seccion a medias tiene que poder guardarse. ' +
      'Devuelve los avisos para pintarlos mientras se edita.',
  })
  saveDraft(
    @Param('formatType') formatType: string,
    @Body() definition: FormatDefinition,
    @Req() req: Request
  ) {
    return this.service.saveDraft(
      formatType,
      definition,
      (req as any).user?.email
    )
  }

  @Delete(':formatType/draft')
  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN)
  @ApiOperation({ summary: 'Descarta el borrador y vuelve a lo publicado' })
  discard(@Param('formatType') formatType: string) {
    return this.service.discardDraft(formatType)
  }

  @Post(':formatType/publish')
  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN)
  @ApiOperation({
    summary: 'Publica el borrador',
    description:
      'Valida contra los catalogos cerrados y comprueba las dependencias entre numeraciones. ' +
      'Sube la version y guarda el historial. A partir de aqui emite documentos de verdad.',
  })
  publish(@Param('formatType') formatType: string, @Req() req: Request) {
    return this.service.publish(formatType, (req as any).user?.email)
  }

  @Post(':formatType/restore')
  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN)
  @ApiOperation({
    summary: 'Devuelve el tipo a las definiciones de fabrica',
    description:
      'Rehace la definicion desde las plantillas del cliente y descarta el borrador. Un ' +
      'despliegue actualiza por su cuenta las definiciones de fabrica que nadie ha tocado; ' +
      'esto hace falta cuando alguien ya publico una propia. Sube version y queda en el ' +
      'historial, asi que lo anterior se puede recuperar.',
  })
  restore(@Param('formatType') formatType: string, @Req() req: Request) {
    return this.service.restoreFactory(formatType, (req as any).user?.email)
  }

  @Get(':formatType/versions')
  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN)
  @ApiOperation({ summary: 'Historial de publicaciones' })
  versions(@Param('formatType') formatType: string) {
    return this.service.listVersions(formatType)
  }

  @Get(':formatType/draft/changes')
  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN)
  @ApiOperation({
    summary: 'Que cambiaria al publicar el borrador',
    description:
      'La parte del historial que todavia no ha ocurrido. Sin borrador devuelve una lista ' +
      'vacia, que es la respuesta correcta: no hay nada pendiente.',
  })
  draftChanges(@Param('formatType') formatType: string) {
    return this.service.getDraftChanges(formatType)
  }

  @Get(':formatType/versions/:version')
  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN)
  @ApiOperation({
    summary: 'La definicion completa de una publicacion',
    description:
      'Lo que decia el formato cuando salio esa version. Es lo que hace reproducible un ' +
      'documento emitido hace meses.',
  })
  version(
    @Param('formatType') formatType: string,
    @Param('version', parseIntParam('La versión')) version: number
  ) {
    return this.service.getVersion(formatType, version)
  }

  @Get(':formatType/versions/:version/changes')
  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN)
  @ApiOperation({
    summary: 'Que cambio en una publicacion',
    description:
      'Compara con la publicacion anterior, o con la que indique `against`. La comparacion ' +
      'se hace aqui porque una definicion pasa de 110 KB y mandar dos al navegador para que ' +
      'las recorra gasta medio megabyte por cada version que alguien despliega.',
  })
  versionChanges(
    @Param('formatType') formatType: string,
    @Param('version', parseIntParam('La versión')) version: number,
    @Query('against') against?: string
  ) {
    // Con un numero de version que no es numero, Mongo no sabia convertir
    // `NaN` y la consulta acababa en 500.
    const base =
      against === undefined || against === '' ? undefined : Number(against)
    if (base !== undefined && !Number.isInteger(base)) {
      throw new BadRequestException(
        'La versión de comparación debe ser un número entero.'
      )
    }
    return this.service.getVersionChanges(formatType, version, base)
  }

  @Post(':formatType/revert/:version')
  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN)
  @ApiOperation({
    summary: 'Trae una version del historial al borrador',
    description:
      'No republica sola: deja el borrador cargado para poder revisarlo antes. Revertir a ' +
      'ciegas un documento que se audita es justo lo que no conviene.',
  })
  revert(
    @Param('formatType') formatType: string,
    @Param('version', parseIntParam('La versión')) version: number,
    @Req() req: Request
  ) {
    return this.service.revertTo(formatType, version, (req as any).user?.email)
  }
}
