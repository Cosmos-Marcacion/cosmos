import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { HydratedDocument } from 'mongoose'

/**
 * Una ejecucion de "Sincronizar empleados".
 *
 * Antes el resultado solo vivia en la pantalla que la lanzo: al recargar o
 * volver otro dia no habia forma de saber cuando se sincronizo por ultima vez,
 * si termino bien ni cuantos empleados se crearon (CKI11).
 */
@Schema({ collection: 'employee_sync_runs', timestamps: true })
export class EmployeeSyncRun {
  @Prop({ required: true })
  startedAt: Date

  @Prop()
  finishedAt?: Date

  /** `success`: sin errores; `partial`: con errores por usuario; `failed`: abortada. */
  @Prop({ required: true, enum: ['running', 'success', 'partial', 'failed'] })
  status: 'running' | 'success' | 'partial' | 'failed'

  @Prop({ default: 0 })
  totalProcessed: number

  @Prop({ default: 0 })
  newEmployees: number

  /** Empleados que ya existian y se actualizaron con los datos del origen. */
  @Prop({ default: 0 })
  existingEmployees: number

  /** Errores por usuario, recortados a los primeros 50 para no inflar el registro. */
  @Prop({ type: [String], default: [] })
  errors: string[]

  @Prop({ default: 0 })
  errorCount: number

  /** Motivo cuando la ejecucion entera falla. */
  @Prop({ default: '' })
  failureMessage: string

  /** Correo de quien la lanzo. */
  @Prop({ default: '' })
  triggeredBy: string
}

export type EmployeeSyncRunDocument = HydratedDocument<EmployeeSyncRun>
export const EmployeeSyncRunSchema =
  SchemaFactory.createForClass(EmployeeSyncRun)
EmployeeSyncRunSchema.index({ startedAt: -1 })
