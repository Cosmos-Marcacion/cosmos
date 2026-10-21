import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

/**
 * Datos de una nombrada que pertenecen a la plataforma, no al sistema externo.
 *
 * Se guardan aparte de la coleccion `nameds` a proposito: aquella es un espejo
 * de `ListarNombradas` y el job de sincronizacion la sobrescribe y poda. Aqui
 * vive lo que aporta Cosmos Checkin (tipo de formato, jefe de cubierta,
 * supervisores, datos de la charla y el historial de formatos emitidos), que no
 * debe perderse en ninguna resincronizacion.
 *
 * La clave es `staffTransmissionId`, el identificador de la nombrada en el
 * sistema externo.
 */

export interface PersonRef {
  /** Nombre completo tal como debe figurar en el formato. */
  fullName: string
  document: string
  /** Origen del dato: `visma`, `trainer` (maestro local) o `manual`. */
  source?: string
  /** Identificador en el sistema de origen, cuando lo hay. */
  externalId?: string
  position?: string
}

export interface TalkTopic {
  topic: string
  summary: string
}

export interface GeneratedFormat {
  formatType: string
  fileName: string
  generatedAt: Date
  /** Usuario que lo genero. */
  generatedBy?: string
  /** Nº de personas incluidas. */
  staffCount: number
  /** Se conserva por compatibilidad; hoy nunca se trunca. */
  truncated: boolean
  /** Paginas que ocupo la lista de personal. */
  pages?: number
  /** Correlativo del permiso de trabajo impreso en ese formato. */
  workPermitNumber?: number
  /** Si se entrego en Excel o en PDF. Ambos salen del mismo libro. */
  output?: string
}

export interface NamedRecordDocument extends Document {
  _id: Types.ObjectId
  staffTransmissionId: number
  workerDateIso: string
  formatType: string
  /** Correlativo del permiso de trabajo (PTS) de esta nombrada. */
  workPermitNumber?: number
  jefeCubierta?: PersonRef
  supervisorOperaciones?: PersonRef
  supervisorSsoma?: PersonRef
  jefeCubiertaVsi?: PersonRef
  ssomaVsi?: PersonRef
  trainer?: PersonRef
  registerResponsible?: PersonRef
  talkType?: string
  talkPlace?: string
  talkIsAnnual?: boolean
  talkStartTime?: string
  talkEndTime?: string
  talkHours?: number
  talkTopics: TalkTopic[]
  generatedFormats: GeneratedFormat[]
  notes?: string
}

@Schema({ _id: false })
class PersonRefSchemaClass {
  @Prop({ default: '' }) fullName: string
  @Prop({ default: '' }) document: string
  @Prop({ default: 'manual' }) source: string
  @Prop({ default: '' }) externalId: string
  @Prop({ default: '' }) position: string
}
const PersonRefSchema = SchemaFactory.createForClass(PersonRefSchemaClass)

@Schema({ _id: false })
class TalkTopicSchemaClass {
  @Prop({ default: '' }) topic: string
  @Prop({ default: '' }) summary: string
}
const TalkTopicSchema = SchemaFactory.createForClass(TalkTopicSchemaClass)

@Schema({ _id: false })
class GeneratedFormatSchemaClass {
  @Prop({ required: true }) formatType: string
  @Prop({ required: true }) fileName: string
  @Prop({ required: true }) generatedAt: Date
  @Prop({ default: '' }) generatedBy: string
  @Prop({ default: 0 }) staffCount: number
  @Prop({ default: false }) truncated: boolean
  @Prop({ default: 1 }) pages: number
  @Prop({ default: 0 }) workPermitNumber: number
  @Prop({ default: 'xlsx' }) output: string
}
const GeneratedFormatSchema = SchemaFactory.createForClass(GeneratedFormatSchemaClass)

@Schema({ timestamps: true, collection: 'named_records' })
export class NamedRecord {
  @Prop({ required: true, unique: true, index: true })
  staffTransmissionId: number

  /** Copia de la fecha de la nombrada, para poder listar por rango sin cruzar. */
  @Prop({ required: true, index: true })
  workerDateIso: string

  /** `ETHANOL`, `GRANEL`, `MERCADERIA_GENERAL`, `CONTAINERO` o `BIG_BAG`. */
  @Prop({ default: '' })
  formatType: string

  /**
   * Correlativo del permiso de trabajo seguro (PTS) que va impreso en el
   * formato, junto al N.o de ATS.
   *
   * Se reparte una sola vez por nombrada desde la serie `workPermit` y no se
   * reutiliza. El indice unico disperso lo garantiza a nivel de base de datos:
   * las fichas anteriores a este campo no lo llevan y el indice las ignora.
   */
  @Prop({ type: Number, index: { unique: true, sparse: true } })
  workPermitNumber?: number

  /** Se obtiene del maestro Visma, no de las nombradas. */
  @Prop({ type: PersonRefSchema })
  jefeCubierta?: PersonRefSchemaClass

  /** Figura como capacitador en la hoja de charla. */
  @Prop({ type: PersonRefSchema })
  supervisorOperaciones?: PersonRefSchemaClass

  @Prop({ type: PersonRefSchema })
  supervisorSsoma?: PersonRefSchemaClass

  @Prop({ type: PersonRefSchema })
  jefeCubiertaVsi?: PersonRefSchemaClass

  @Prop({ type: PersonRefSchema })
  ssomaVsi?: PersonRefSchemaClass

  /** Entrenador de la capacitacion. */
  @Prop({ type: PersonRefSchema })
  trainer?: PersonRefSchemaClass

  /** Responsable del registro de la capacitacion. */
  @Prop({ type: PersonRefSchema })
  registerResponsible?: PersonRefSchemaClass

  /**
   * Tipo de actividad de la hoja de charla: `INDUCCION`, `CAPACITACION`,
   * `ENTRENAMIENTO`, `SIMULACRO`, `TOOLBOX` u `OTROS`. Se marca con una X sobre
   * la lista preimpresa al generar el formato.
   */
  @Prop({ default: '' })
  talkType: string

  /** Donde se dio: `EMBARCACION`, `TERMINAL`, `OFICINA` u `OTROS`. */
  @Prop({ default: '' })
  talkPlace: string

  /** "¿Pertenece a Programa Anual de Capacitacion?" de la hoja de charla. */
  @Prop({ default: false })
  talkIsAnnual: boolean

  /** `HH:mm`. Vacio mientras no se registre; la hoja sale con el hueco. */
  @Prop({ default: '' })
  talkStartTime: string

  @Prop({ default: '' })
  talkEndTime: string

  /** N.o de horas de la charla. */
  @Prop({ default: 0 })
  talkHours: number

  /** La hoja de charla admite hasta tres temas con su resumen. */
  @Prop({ type: [TalkTopicSchema], default: [] })
  talkTopics: TalkTopicSchemaClass[]

  @Prop({ type: [GeneratedFormatSchema], default: [] })
  generatedFormats: GeneratedFormatSchemaClass[]

  @Prop({ default: '' })
  notes: string
}

export const NamedRecordSchema = SchemaFactory.createForClass(NamedRecord)
NamedRecordSchema.index({ workerDateIso: 1, staffTransmissionId: 1 })
