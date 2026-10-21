import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'
import { Document, Types } from 'mongoose'

/** Vigencia del codigo de recuperacion. */
export const RESET_CODE_TTL_SECONDS = 600

@Schema({ collection: 'password_resets', timestamps: true })
export class PasswordReset extends Document {
  @Prop({ type: Types.ObjectId, required: true, ref: 'User' })
  userId: Types.ObjectId

  @Prop({ required: true })
  email: string

  @Prop({ required: true })
  code: string // 6 dígitos

  // TTL index vía expires después de 10 minutos. El monitor de TTL de Mongo
  // borra con hasta un minuto de retraso, asi que la vigencia tambien se
  // comprueba en la consulta.
  @Prop({
    type: Date,
    default: () => new Date(),
    expires: RESET_CODE_TTL_SECONDS,
  })
  expireAt: Date

  /** Codigos equivocados contra este registro; al quinto se invalida. */
  @Prop({ default: 0 })
  attempts: number

  createdAt?: Date
}

export const PasswordResetSchema = SchemaFactory.createForClass(PasswordReset)
