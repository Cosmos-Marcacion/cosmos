import { Injectable, Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { EmployeeSyncRun } from './entities/employee-sync-run.entity'

export interface SyncResult {
  totalProcessed: number
  newEmployees: number
  existingEmployees: number
  errors: string[]
}

const MAX_STORED_ERRORS = 50

/**
 * Registro de las ejecuciones de la sincronizacion de empleados.
 *
 * Envuelve la sincronizacion en vez de meterse dentro: la logica de negocio no
 * cambia y el registro no puede tumbarla. Si guardar el registro falla, la
 * sincronizacion responde igual y el fallo queda en el log.
 */
@Injectable()
export class EmployeeSyncRunService {
  private readonly logger = new Logger(EmployeeSyncRunService.name)

  constructor(
    @InjectModel(EmployeeSyncRun.name)
    private readonly runModel: Model<EmployeeSyncRun>
  ) {}

  async record(
    triggeredBy: string,
    sync: () => Promise<SyncResult>
  ): Promise<SyncResult> {
    const startedAt = new Date()
    const run = await this.safe(() =>
      this.runModel.create({ startedAt, status: 'running', triggeredBy })
    )
    try {
      const result = await sync()
      await this.safe(() =>
        this.runModel
          .updateOne(
            { _id: run?._id },
            {
              $set: {
                finishedAt: new Date(),
                status: result.errors.length ? 'partial' : 'success',
                totalProcessed: result.totalProcessed,
                newEmployees: result.newEmployees,
                existingEmployees: result.existingEmployees,
                errors: result.errors.slice(0, MAX_STORED_ERRORS),
                errorCount: result.errors.length,
              },
            }
          )
          .exec()
      )
      return result
    } catch (error) {
      await this.safe(() =>
        this.runModel
          .updateOne(
            { _id: run?._id },
            {
              $set: {
                finishedAt: new Date(),
                status: 'failed',
                failureMessage:
                  (error as Error)?.message ?? 'Error desconocido',
              },
            }
          )
          .exec()
      )
      throw error
    }
  }

  /** Ultimas ejecuciones, la mas reciente primero. */
  async list(limit = 20) {
    const safeLimit = Math.min(Math.max(Number(limit) || 20, 1), 100)
    return this.runModel
      .find()
      .sort({ startedAt: -1 })
      .limit(safeLimit)
      .lean()
      .exec()
  }

  private async safe<T>(fn: () => Promise<T>): Promise<T | null> {
    try {
      return await fn()
    } catch (error) {
      this.logger.error(
        `No se pudo guardar el registro de sincronizacion: ${(error as Error)?.message}`
      )
      return null
    }
  }
}
