import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

/**
 * Copia local de una nombrada del servicio externo Cosmos.
 *
 * Se guarda con la misma forma que devuelve `api/Users/ListarNombradas` para
 * poder reconstruir la respuesta original sin transformaciones, salvo
 * `workerDate`, que además se normaliza a `YYYY-MM-DD` en `workerDateIso`
 * para poder consultar rangos con comparación de strings.
 */
export interface NamedStaffDetail {
  staff_transmission_id: number
  staff_vessel_id: number
  staff_transmission_detail_id: number
  staff_id: number
  personal_id: string
  last_name: string
  mother_last_name: string
  first_name: string
  staff_role_type_id: number
  staff_role_type_description: string
  order_number: number
  team_number: number
}

export interface NamedDocument extends Document {
  _id: Types.ObjectId
  staffTransmissionId: number
  staffVesselId: number
  vesselDescription: string
  voyageNumber: string
  locationId: string
  workerDate: string
  workerDateIso: string
  shiftDescription: string
  pierDescription: string
  berthDescription: string
  staffVesselNumber: string
  /** `code_type_vessel`. Ausente en las copias guardadas antes de que la API lo trajera. */
  codeTypeVessel?: string
  /** `description_type_vessel`. */
  descriptionTypeVessel?: string
  listStaffDetail: NamedStaffDetail[]
  syncedAt: Date
}

@Schema({ timestamps: true, collection: 'nameds' })
export class Named {
  @Prop({ required: true, unique: true })
  staffTransmissionId: number

  @Prop({ default: 0 })
  staffVesselId: number

  @Prop({ default: '' })
  vesselDescription: string

  @Prop({ default: '' })
  voyageNumber: string

  @Prop({ default: '' })
  locationId: string

  /** Fecha tal cual la entrega el servicio externo: `dd/mm/yyyy`. */
  @Prop({ required: true })
  workerDate: string

  /** Misma fecha normalizada a `yyyy-mm-dd`, para consultas por rango. */
  @Prop({ required: true })
  workerDateIso: string

  @Prop({ default: '' })
  shiftDescription: string

  @Prop({ default: '' })
  pierDescription: string

  @Prop({ default: '' })
  berthDescription: string

  @Prop({ default: '' })
  staffVesselNumber: string

  /**
   * Tipo de nave (`ET`, `GR`, `ME`, `CO`...). Sin valor por defecto a
   * proposito: su ausencia distingue una copia anterior al campo de una
   * nombrada que llega con el tipo vacio. Ver `format/vessel-type.ts`.
   */
  @Prop()
  codeTypeVessel?: string

  @Prop()
  descriptionTypeVessel?: string

  @Prop({ type: [Object], default: [] })
  listStaffDetail: NamedStaffDetail[]

  @Prop({ required: true })
  syncedAt: Date
}

export const NamedSchema = SchemaFactory.createForClass(Named)

NamedSchema.index({ workerDateIso: 1 })
NamedSchema.index({ workerDateIso: 1, shiftDescription: 1 })

/**
 * Marca de cobertura: registra qué días ya fueron traídos del servicio externo,
 * incluidos los días sin nombradas. Sin esto no se puede distinguir "día sin
 * nombradas" de "día no sincronizado todavía".
 */
export interface NamedSyncDayDocument extends Document {
  _id: Types.ObjectId
  workerDateIso: string
  syncedAt: Date
  namedCount: number
}

@Schema({ timestamps: true, collection: 'named_sync_days' })
export class NamedSyncDay {
  @Prop({ required: true, unique: true })
  workerDateIso: string

  @Prop({ required: true })
  syncedAt: Date

  @Prop({ default: 0 })
  namedCount: number
}

export const NamedSyncDaySchema = SchemaFactory.createForClass(NamedSyncDay)
