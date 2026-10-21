// src/webauthn/webauthn.service.ts
import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { Fingerprint } from './entities/fingerprint.entity'
import { EmployeeService } from '../employee/employee.service'
import { EmployeeDocument } from '../employee/entities/employee.entity'
import { SaveFingerprintDto } from './dto/save-fingerprint.dto'

@Injectable()
export class FingerprintService {
  private readonly logger = new Logger(FingerprintService.name)

  constructor(
    private employeeService: EmployeeService,
    @InjectModel(Fingerprint.name) private fingerprintModel: Model<Fingerprint>
  ) {}

  findAll() {
    return this.fingerprintModel.find().exec()
  }

  /**
   * Guarda una huella dactilar en la base de datos
   * @param saveFingerprintDto Datos de la huella a guardar
   * @returns Objeto con status y fingerprintId
   */
  async saveFingerprint(
    saveFingerprintDto: SaveFingerprintDto
  ): Promise<{ status: string; fingerprintId: string }> {
    try {
      // Verificar que el empleado existe
      const employee = await this.employeeService.findOne(
        saveFingerprintDto.employeeId
      )
      if (!employee) {
        throw new NotFoundException('Empleado no encontrado')
      }

      // Crear el documento de huella
      const fingerprint = new this.fingerprintModel({
        employeeId: new Types.ObjectId(saveFingerprintDto.employeeId),
        template: saveFingerprintDto.template,
        quality: saveFingerprintDto.quality,
        templateLen: saveFingerprintDto.templateLen,
        createdAt: new Date(),
      })

      const savedFingerprint = await fingerprint.save()
      const fingerprintId = (savedFingerprint._id as Types.ObjectId).toString()

      await this.employeeService.updateFingerprintStatus(
        saveFingerprintDto.employeeId,
        true,
        fingerprintId
      )

      return {
        status: 'success',
        fingerprintId,
      }
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error
      }
      // El detalle va al log y no a la respuesta: el mensaje de Mongo describe
      // la base de datos a quien la ataca.
      this.logger.error(`Error al guardar la huella: ${error.message}`)
      throw new InternalServerErrorException('Error al guardar la huella')
    }
  }

  /**
   * Identifica un empleado por su huella dactilar
   * @param template Template de la huella en Base64
   * @returns Empleado identificado o null si no se encuentra
   */
  async identifyFingerprint(
    template: string
  ): Promise<{ employee: EmployeeDocument | null }> {
    try {
      // Buscar coincidencia exacta primero
      const fingerprint = await this.fingerprintModel
        .findOne({ template })
        .populate('employeeId')
        .exec()

      if (fingerprint) {
        return {
          employee: fingerprint.employeeId as unknown as EmployeeDocument,
        }
      }

      // Si no hay coincidencia exacta, buscar por similitud
      // Aquí podrías implementar un algoritmo de comparación más sofisticado
      // Por ahora, retornamos null si no hay coincidencia exacta

      return { employee: null }
    } catch (error) {
      this.logger.error(`Error al identificar la huella: ${error.message}`)
      throw new InternalServerErrorException('Error al identificar la huella')
    }
  }

  async deleteFingerprintByEmployeeId(employeeId: string) {
    await this.fingerprintModel
      .deleteMany({ employeeId: new Types.ObjectId(employeeId) })
      .exec()
    return this.employeeService.updateFingerprintStatus(employeeId, false)
  }
}
