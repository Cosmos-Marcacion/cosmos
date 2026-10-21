import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  Res,
  UseGuards,
  Req,
} from '@nestjs/common'
import type { Response, Request } from 'express'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { FormatOutput } from './format.service'
import { FormatEngineResolver } from './format-engine.resolver'
import { PdfService } from './pdf.service'
import { FormatV2Engine } from './v2/format-v2.engine'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../auth/guards/roles.guard'
import { Roles } from '../auth/decorators/roles.decorador'
import { ROLES } from '../auth/enums/roles.enum'
import { ModuleGuard } from '../../common/access/module.guard'
import { RequireModule } from '../../common/access/require-module.decorator'

@ApiTags('Format')
@RequireModule('marcaciones')
@Controller('format')
@UseGuards(JwtAuthGuard, RolesGuard, ModuleGuard)
export class FormatController {
  constructor(
    private readonly engines: FormatEngineResolver,
    private readonly pdfService: PdfService,
    private readonly v2: FormatV2Engine
  ) {}

  @Get('types')
  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.USER)
  @ApiOperation({
    summary: 'Tipos de formato disponibles y su capacidad de personal',
  })
  listTypes(@Query('engine') engine?: string) {
    return this.engines.resolve(engine).listFormatTypes()
  }

  @Get('engine')
  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN)
  @ApiOperation({
    summary: 'Motor de formatos activo',
    description:
      'Que motor esta emitiendo los formatos: `legacy` rellena la plantilla del ' +
      'cliente, `v2` genera el documento. Se decide con la variable FORMAT_ENGINE.',
  })
  currentEngine() {
    return { engine: this.engines.configured() }
  }

  // Abierto a quien pueda descargar formatos: el panel lo consulta para decidir
  // si ofrece el PDF.
  @Get('pdf/status')
  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.USER)
  @ApiOperation({
    summary: 'Si el servidor puede convertir formatos a PDF',
    description:
      'Comprueba que LibreOffice esta instalado y responde. Sirve para verificar un despliegue ' +
      'sin tener que descargar un formato entero.',
  })
  pdfStatus() {
    return this.pdfService.available()
  }

  @Get(':staffTransmissionId/document')
  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.USER)
  @ApiOperation({
    summary: 'El formato como documento, para verlo e imprimirlo en pantalla',
    description:
      'Devuelve el mismo modelo del que salen el Excel y el PDF: mismas secciones, mismos ' +
      'cortes de pagina y mismos correlativos. La vista de impresion lo pinta con CSS, sin ' +
      'generar ni descargar nada. Solo existe con el motor v2.',
  })
  document(
    @Param('staffTransmissionId') staffTransmissionId: string,
    @Query('workerDate') workerDate: string,
    @Query('formatType') formatType?: string
  ) {
    return this.v2
      .buildDocument(
        this.parseNamedId(staffTransmissionId),
        workerDate,
        formatType
      )
      .then(built => built.format)
  }

  /**
   * El identificador de la nombrada, comprobado.
   *
   * `Number('definitions')` es `NaN`, y con el la emision se iba hasta el fondo
   * para acabar respondiendo "no se encontro la nombrada NaN", que no dice nada
   * de lo que pasa de verdad: que la peticion no era para este controlador. La
   * ruta comodin de aqui debajo casa con cualquier segmento bajo `/format`, asi
   * que conviene que rechace pronto y con un mensaje util lo que no es un
   * numero.
   */
  private parseNamedId(value: string): number {
    const id = Number(value)
    if (!Number.isInteger(id) || id <= 0) {
      throw new BadRequestException(
        `"${value}" no es el identificador de una nombrada.`
      )
    }
    return id
  }

  @Get(':staffTransmissionId')
  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.USER)
  @ApiOperation({
    summary: 'Formato unico de una nombrada, en Excel',
    description:
      'Devuelve un solo Excel con todos los libros (asistencia, charla, ATS, permiso de trabajo, ' +
      'inspeccion de nave e ingles), generado sobre la plantilla del tipo que corresponda.',
  })
  async download(
    @Param('staffTransmissionId') staffTransmissionId: string,
    @Query('workerDate') workerDate: string,
    @Query('engine') engine: string,
    @Req() req: Request,
    @Res() res: Response
  ) {
    await this.emit(staffTransmissionId, workerDate, engine, req, res, 'xlsx')
  }

  @Get(':staffTransmissionId/pdf')
  @Roles(ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.USER)
  @ApiOperation({
    summary: 'El mismo formato, en PDF',
    description:
      'Convierte a PDF el libro que devuelve la descarga en Excel, sin volver a componerlo, ' +
      'asi que ambos llevan exactamente los mismos datos y la misma maquetacion. ' +
      'Es tambien lo que se manda a imprimir.',
  })
  async downloadPdf(
    @Param('staffTransmissionId') staffTransmissionId: string,
    @Query('workerDate') workerDate: string,
    @Query('engine') engine: string,
    @Req() req: Request,
    @Res() res: Response
  ) {
    await this.emit(staffTransmissionId, workerDate, engine, req, res, 'pdf')
  }

  /** Genera y responde. Lo unico que cambia entre Excel y PDF es `output`. */
  private async emit(
    staffTransmissionId: string,
    workerDate: string,
    engine: string | undefined,
    req: Request,
    res: Response,
    output: FormatOutput
  ) {
    const user = (req as any).user
    const selected = this.engines.resolve(engine)
    const result = await selected.generate(
      this.parseNamedId(staffTransmissionId),
      workerDate,
      user?.email,
      output
    )

    res.setHeader('Content-Type', result.contentType)
    // El PDF se sirve `inline` porque ademas de descargarse se abre para
    // imprimir; el nombre de guardado lo pone igualmente el navegador.
    const disposition = output === 'pdf' ? 'inline' : 'attachment'
    res.setHeader(
      'Content-Disposition',
      `${disposition}; filename="${result.fileName}"`
    )
    // El frontend los lee para decir cuanta gente entro y en cuantas paginas.
    res.setHeader('X-Format-Type', result.formatType)
    res.setHeader('X-Format-Staff-Count', String(result.staffCount))
    res.setHeader('X-Format-Pages', String(result.pages))
    res.setHeader('X-Format-Truncated', String(result.truncated))
    res.setHeader('X-Format-Work-Permit', String(result.workPermitNumber))
    res.setHeader('X-Format-Output', result.output)
    // Con que motor se genero. Sin esto, ante un formato raro no hay forma de
    // saber si salio de la plantilla del cliente o del modelo propio.
    res.setHeader('X-Format-Engine', selected.engineId)
    res.setHeader(
      'Access-Control-Expose-Headers',
      'Content-Disposition, X-Format-Type, X-Format-Staff-Count, X-Format-Pages, ' +
        'X-Format-Truncated, X-Format-Work-Permit, X-Format-Output, X-Format-Engine'
    )
    res.send(result.buffer)
  }
}
