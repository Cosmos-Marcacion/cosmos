import { Controller, Post, Body, Param, Get, Put, Query } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { NamedService } from './named.service'
import { NamedRecordService } from './named-record.service'
import { GetNamedsDto } from './dto/get-nameds.dto'
import { GetNamesByDateAndTurnDto } from './dto/name-and-turn.dto'
import { GetNamedBoardDto, UpsertNamedRecordDto } from './dto/named-record.dto'
import { GetUserByDocDto } from './dto/get-user-by-doc.dto'

import { UseGuards } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { RolesGuard } from '../auth/guards/roles.guard'
import { ModuleGuard } from '../../common/access/module.guard'
import { RequireModule } from '../../common/access/require-module.decorator'
import { parseNamedIdParam } from '../../common/mongo/params'
import { Roles } from '../auth/decorators/roles.decorador'
import { ROLES } from '../auth/enums/roles.enum'
@ApiTags('Named')
@UseGuards(AuthGuard('jwt'), RolesGuard, ModuleGuard)
@RequireModule('marcaciones')
@Controller('named')
export class NamedController {
  constructor(
    private readonly namedService: NamedService,
    private readonly namedRecordService: NamedRecordService
  ) {}

  @Post('board')
  @ApiOperation({
    summary: 'Nombradas de un rango con su ficha, asistencias y capacitaciones',
    description:
      'Alimenta la vista de marcaciones, cuya unidad es la nombrada y no el trabajador.',
  })
  getNamedBoard(@Body() dto: GetNamedBoardDto) {
    return this.namedService.getNamedBoard(dto)
  }

  @Get('detail/:staffTransmissionId')
  @ApiOperation({
    summary: 'Todo lo que se sabe de una nombrada',
    description:
      'Cabecera del sistema externo, ficha de la plataforma, personal con sus marcaciones ' +
      'punto por punto, charlas y formatos emitidos. Alimenta la vista de detalle.',
  })
  getDetail(
    @Param('staffTransmissionId', parseNamedIdParam())
    staffTransmissionId: number,
    @Query('workerDate') workerDate: string
  ) {
    return this.namedService.getNamedDetail(staffTransmissionId, workerDate)
  }

  @Get('records/:staffTransmissionId')
  @ApiOperation({ summary: 'Ficha que la plataforma guarda de una nombrada' })
  async getRecord(
    @Param('staffTransmissionId', parseNamedIdParam())
    staffTransmissionId: number
  ) {
    const record = await this.namedRecordService.findOne(staffTransmissionId)
    return record ?? null
  }

  @Put('records/:staffTransmissionId')
  @ApiOperation({
    summary: 'Guarda la ficha de una nombrada',
    description:
      'Tipo de formato, jefe de cubierta, supervisores, entrenador y la capacitación del ' +
      'turno: tipo, lugar, horario, programa anual y hasta tres temas con su resumen.',
  })
  upsertRecord(
    // Con un id no numerico, `Number(...)` daba NaN y Mongo respondia 500 al
    // no poder convertirlo; el pipe lo rechaza antes con un 400.
    @Param('staffTransmissionId', parseNamedIdParam())
    staffTransmissionId: number,
    @Body() dto: UpsertNamedRecordDto
  ) {
    const { workerDate, ...changes } = dto
    const workerDateIso = workerDate.split('/').reverse().join('-')
    return this.namedRecordService.upsert(
      staffTransmissionId,
      workerDateIso,
      changes as any
    )
  }

  // Devuelve el token del sistema externo de nombradas. Ningun cliente lo
  // pide; abierto a todo el modulo, cualquier operador podia llevarse una
  // credencial de un tercero. Queda solo para diagnostico del super usuario.
  @Post()
  @Roles(ROLES.SUPER_ADMIN)
  getToken() {
    return this.namedService.getToken()
  }

  @Post('users')
  getAllUsers() {
    return this.namedService.getUsers()
  }

  @Post('users/doc')
  getUserByDoc(@Body() dto: GetUserByDocDto) {
    // El cuerpo se tipaba como `string`: el ValidationPipe no valida primitivos
    // y al servicio llegaba el objeto entero, que reenviaba anidado al externo.
    return this.namedService.getUserByDoc(dto.prDocumentNumber)
  }

  @Post('nameds')
  getNameds(@Body() getNamedsDto: GetNamedsDto) {
    return this.namedService.getNameds(getNamedsDto)
  }

  @Post('nameds/grouped')
  getNamedsGrouped(@Body() getNamedsDto: GetNamedsDto) {
    return this.namedService.getNamesGrouped(getNamedsDto)
  }

  @Post('date-turn')
  getNamesByDateAndTurn(
    @Body() getNamesByDateAndTurnDto: GetNamesByDateAndTurnDto
  ) {
    return this.namedService.getNamesByDateAndTurn(getNamesByDateAndTurnDto)
  }

  // `POST /named/generate-random-entries` se ha retirado: rellenaba la base
  // con marcaciones inventadas de agosto de 2025 y lo podia llamar cualquier
  // perfil con marcaciones. Ningun cliente lo usaba.
}
