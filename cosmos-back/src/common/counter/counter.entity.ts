import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose'

/**
 * Contador de correlativos.
 *
 * Un documento por serie, con el ultimo numero entregado. El reparto se hace
 * con un unico `$inc`, que Mongo aplica de forma atomica sobre el documento:
 * dos peticiones simultaneas nunca reciben el mismo numero, y no hace falta
 * bloquear nada desde la aplicacion.
 *
 * `seq` no lleva `default` a proposito. Un `setDefaultsOnInsert` sobre el mismo
 * campo que se incrementa choca con el `$inc` y Mongo rechaza la operacion; sin
 * default, el alta arranca en 1, que es justo lo que se quiere.
 */
@Schema({ collection: 'counters', versionKey: false })
export class Counter {
  /** Nombre de la serie, por ejemplo `workPermit`. */
  @Prop({ type: String, required: true })
  _id: string

  @Prop({ type: Number })
  seq: number
}

export const CounterSchema = SchemaFactory.createForClass(Counter)
