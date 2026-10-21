import {
  Controller,
  Post,
  Body,
  HttpException,
  HttpStatus,
  UsePipes,
  ValidationPipe,
  Get,
  Delete,
  Param,
  UseGuards,
} from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { FingerprintService } from './fingerprint.service'
import { SaveFingerprintDto } from './dto/save-fingerprint.dto'
import { IdentityFingerprintDto } from './dto/identity-fingerprint.dto'
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger'
import { ParseObjectIdPipe } from '../../common/mongo/params'

/**
 * Exige sesion: no la exigia, y `GET /fingerprint` entregaba a cualquiera las
 * plantillas biometricas de toda la plantilla. Quien lo llama es la app movil,
 * desde pantallas que ya piden haber entrado y con el token en cada peticion.
 */
@Controller('fingerprint')
@UseGuards(AuthGuard('jwt'))
@UsePipes(new ValidationPipe({ transform: true }))
@ApiTags('Fingerprint')
export class FingerprintController {
  constructor(private readonly fingerprintService: FingerprintService) {}

  @Post('save')
  @ApiOperation({ summary: 'Guardar huella dactilar de un empleado' })
  @ApiResponse({ status: 201, description: 'Huella guardada exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  async saveFingerprint(@Body() saveFingerprintDto: SaveFingerprintDto) {
    try {
      return await this.fingerprintService.saveFingerprint(saveFingerprintDto)
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST)
    }
  }

  @Post('identity')
  @ApiOperation({ summary: 'Identificar empleado por huella dactilar' })
  @ApiResponse({
    status: 200,
    description: 'Empleado identificado o null si no se encuentra',
  })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  async identifyFingerprint(
    @Body() identityFingerprintDto: IdentityFingerprintDto
  ) {
    try {
      return await this.fingerprintService.identifyFingerprint(
        identityFingerprintDto.template
      )
    } catch (e) {
      throw new HttpException(e.message, HttpStatus.BAD_REQUEST)
    }
  }

  @Get()
  findAll() {
    return this.fingerprintService.findAll()
  }

  @Delete('by-employee-id/:id')
  deleteFingerprintByEmployeeId(@Param('id', ParseObjectIdPipe) id: string) {
    return this.fingerprintService.deleteFingerprintByEmployeeId(id)
  }
}
