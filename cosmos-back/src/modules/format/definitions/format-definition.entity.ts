import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

/**
 * Una definicion de formato, guardada y versionada.
 *
 * El cuerpo (`documents`) se guarda como objeto libre a proposito: su forma es
 * el modelo de documento de `v2/document-model.ts`, que es un arbol de uniones
 * discriminadas, y traducirlo a esquemas de Mongoose no anadiria ninguna
 * garantia. La validacion real la hace `format-definition.validator.ts` contra
 * los catalogos cerrados, y ocurre **antes de publicar**, que es donde importa:
 * un borrador a medias tiene que poder guardarse aunque aun no sea valido.
 *
 * Dos filas por tipo de formato como mucho: el borrador (`status: 'draft'`) y
 * la publicada (`status: 'published'`). El historial va en `format_definition_versions`.
 */
export interface FormatDefinitionDocument extends Document {
  _id: Types.ObjectId
  formatType: string
  status: 'draft' | 'published'
  label: string
  version: number
  documents: any[]
  updatedBy?: string
  publishedAt?: Date
  origin?: 'seed' | 'user'
  seedHash?: string
  baseVersion?: number
  createdAt: Date
  updatedAt: Date
}

@Schema({ timestamps: true, collection: 'format_definitions' })
export class FormatDefinitionEntity {
  /** `GRANEL`, `ETHANOL`, `MERCADERIA_GENERAL`, `CONTAINERO`, `BIG_BAG`. */
  @Prop({ type: String, required: true })
  formatType: string

  @Prop({ type: String, required: true, enum: ['draft', 'published'] })
  status: 'draft' | 'published'

  @Prop({ type: String, default: '' })
  label: string

  /** Sube de uno en uno al publicar. Cada formato emitido anota con cual salio. */
  @Prop({ type: Number, default: 1 })
  version: number

  @Prop({ type: Array, default: [] })
  documents: any[]

  @Prop({ type: String })
  updatedBy?: string

  @Prop({ type: Date })
  publishedAt?: Date

  /**
   * Quien puso esta definicion aqui.
   *
   * `seed` es de fabrica y nadie la ha tocado; `user` la publico alguien desde
   * el maestro. La diferencia decide si un despliegue puede actualizarla: las
   * de fabrica si, las configuradas a mano nunca.
   */
  @Prop({ type: String, enum: ['seed', 'user'], default: 'user' })
  origin?: 'seed' | 'user'

  /**
   * Huella de la definicion de fabrica con la que se sembro.
   *
   * Sin esto, una version nueva de las plantillas no llegaba nunca a una
   * instalacion que ya tenia definiciones publicadas: la siembra solo escribia
   * cuando no habia ninguna, y el panel seguia mostrando los documentos
   * antiguos despues de desplegar.
   */
  @Prop({ type: String })
  seedHash?: string

  /**
   * Solo en el borrador: la version publicada de la que salio.
   *
   * Es lo que permite saber si un borrador se ha quedado atras. Un despliegue
   * puede actualizar la definicion publicada —cuando cambian las plantillas de
   * fabrica—, y el borrador guardado antes seguia sirviendose tal cual por
   * encima de ella: el maestro ensenaba los documentos antiguos y nada decia
   * que hubiera algo mas nuevo debajo.
   *
   * Los borradores guardados antes de que existiera este campo no lo traen, y
   * se tratan como anteriores a cualquier version.
   */
  @Prop({ type: Number })
  baseVersion?: number
}

export const FormatDefinitionSchema = SchemaFactory.createForClass(FormatDefinitionEntity)
FormatDefinitionSchema.index({ formatType: 1, status: 1 }, { unique: true })

/**
 * Historial. Una fila por publicacion.
 *
 * Sin esto, un formato emitido hace tres meses deja de ser reproducible en
 * cuanto alguien edita la definicion: se sabe con que version salio, pero no
 * que decia esa version.
 */
export interface FormatDefinitionVersionDocument extends Document {
  _id: Types.ObjectId
  formatType: string
  version: number
  label: string
  documents: any[]
  publishedBy?: string
  publishedAt: Date
}

@Schema({ timestamps: true, collection: 'format_definition_versions' })
export class FormatDefinitionVersionEntity {
  @Prop({ type: String, required: true })
  formatType: string

  @Prop({ type: Number, required: true })
  version: number

  @Prop({ type: String, default: '' })
  label: string

  @Prop({ type: Array, default: [] })
  documents: any[]

  @Prop({ type: String })
  publishedBy?: string

  @Prop({ type: Date, default: Date.now })
  publishedAt: Date
}

export const FormatDefinitionVersionSchema = SchemaFactory.createForClass(
  FormatDefinitionVersionEntity
)
FormatDefinitionVersionSchema.index({ formatType: 1, version: 1 }, { unique: true })
