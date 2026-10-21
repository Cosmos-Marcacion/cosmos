import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

/**
 * Numero asignado a un documento de una nombrada.
 *
 * Una fila por `(nombrada, serie)`. Es lo que hace que reemitir un formato
 * reimprima el mismo numero: la asignacion se consulta antes de repartir, y un
 * permiso ya firmado no puede cambiar de correlativo porque alguien vuelva a
 * pulsar "descargar".
 *
 * Dos indices unicos, y los dos hacen falta:
 *
 * - `(seriesId, staffTransmissionId)` impide que una nombrada reciba dos
 *   numeros de la misma serie si dos peticiones simultaneas piden a la vez.
 * - `(seriesId, period, seq)` impide que dos nombradas reciban el mismo. El
 *   contador atomico ya lo evita; este indice es la red por si alguien
 *   manipula la coleccion de contadores a mano, que es justo el tipo de cosa
 *   que pasa cuando hay que "arreglar" una numeracion en produccion.
 */
export interface DocumentNumberDocument extends Document {
  _id: Types.ObjectId
  seriesId: string
  staffTransmissionId: number
  period: string
  seq: number
  formatted: string
  createdAt: Date
}

@Schema({ timestamps: true, collection: 'document_numbers' })
export class DocumentNumber {
  /** Serie a la que pertenece: `ats`, `pts`, `charla`... */
  @Prop({ type: String, required: true })
  seriesId: string

  @Prop({ type: Number, required: true })
  staffTransmissionId: number

  /**
   * Ambito del contador. `2026` para las series anuales, `global` para las que
   * no se reinician. Va guardado y no se recalcula al leer: si una nombrada de
   * diciembre se reemite en enero, tiene que seguir imprimiendo su numero.
   */
  @Prop({ type: String, required: true })
  period: string

  /** Correlativo dentro de la serie y el periodo. */
  @Prop({ type: Number, required: true })
  seq: number

  /** El numero ya compuesto, tal como se imprime: `ATS-2026-0042`. */
  @Prop({ type: String, required: true })
  formatted: string
}

export const DocumentNumberSchema = SchemaFactory.createForClass(DocumentNumber)

DocumentNumberSchema.index({ seriesId: 1, staffTransmissionId: 1 }, { unique: true })
DocumentNumberSchema.index({ seriesId: 1, period: 1, seq: 1 }, { unique: true })
