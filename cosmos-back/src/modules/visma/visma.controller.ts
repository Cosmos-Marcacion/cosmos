import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common'
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger'
import { VismaService } from './visma.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { Roles } from '../auth/decorators/roles.decorador'
import { ROLES } from '../auth/enums/roles.enum'
import { ModuleGuard } from '../../common/access/module.guard'
import { RequireModule } from '../../common/access/require-module.decorator'

@ApiTags('Visma')
@RequireModule('sincronizar-empleados')
@Controller('visma')
@UseGuards(JwtAuthGuard, RolesGuard, ModuleGuard)
export class VismaController {
  constructor(private readonly vismaService: VismaService) {}

  // Lo consultan tambien marcaciones (jefe de cubierta, supervisores) y la app
  // movil (registro de trabajadores y charlas). Con solo el modulo de la clase,
  // todo perfil sin `sincronizar-empleados` recibia un 403 al elegir personal.
  @Get('personal')
  @RequireModule('sincronizar-empleados', 'marcaciones')
  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.USER)
  @ApiOperation({
    summary: 'Maestro de personal propio (VISMA TuRecibo)',
    description:
      'Unica fuente de personas para todos los cargos que se asignan a una nombrada: ' +
      'jefe de cubierta, supervisores, entrenador, responsable del registro y aprobadores. ' +
      'Busca por nombre o documento. TuRecibo exige al menos 3 caracteres y no tiene ' +
      'listado completo, asi que con menos se devuelve vacio (`minLength` lo indica). ' +
      'Se sirve simulado mientras no se configure VISMA_URL.',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Nombre o documento',
  })
  @ApiQuery({
    name: 'position',
    required: false,
    description: 'Filtra por cargo',
  })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'includeInactive', required: false })
  async getPersonal(
    @Query('search') search?: string,
    @Query('position') position?: string,
    @Query('limit') limit?: string,
    @Query('includeInactive') includeInactive?: string
  ) {
    const parsedLimit = Number(limit)
    const data = await this.vismaService.search({
      search: search ?? '',
      position: position || undefined,
      limit:
        Number.isFinite(parsedLimit) && parsedLimit > 0
          ? Math.min(parsedLimit, 100)
          : 20,
      includeInactive: includeInactive === 'true',
    })
    return {
      source: this.vismaService.isLive() ? 'visma' : 'mock',
      minLength: this.vismaService.minSearchLength(),
      data,
    }
  }

  /**
   * Ficha completa. El buscador devuelve el nombre en una sola cadena; solo
   * aqui llegan nombres y apellidos separados, el legajo y el estado, que es lo
   * que necesita el registro de empleados para dar de alta a alguien.
   */
  @Get('personal/:id')
  @RequireModule('sincronizar-empleados', 'marcaciones')
  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.USER)
  @ApiOperation({ summary: 'Ficha completa de una persona del maestro' })
  async getPerson(@Param('id') id: string) {
    const person = await this.vismaService.findById(id)
    if (!person) {
      throw new NotFoundException(
        'No se encontro a la persona en el maestro de Visma'
      )
    }
    return {
      source: this.vismaService.isLive() ? 'visma' : 'mock',
      data: person,
    }
  }

  /**
   * Descarta lo cacheado. Las busquedas se guardan 15 minutos para no llamar a
   * Visma en cada tecla del selector; tras un alta o una baja hay que poder
   * verla sin esperar a que expire.
   */
  @Post('refresh')
  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN)
  @ApiOperation({
    summary: 'Descarta las busquedas cacheadas y el token de Visma',
  })
  refresh() {
    this.vismaService.invalidate()
    return {
      source: this.vismaService.isLive() ? 'visma' : 'mock',
      refreshed: true,
    }
  }
}
