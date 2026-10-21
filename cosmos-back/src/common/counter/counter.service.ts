import { Injectable } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { Counter } from './counter.entity'

/** Series de correlativos que reparte la plataforma. */
export const SEQUENCES = {
  /** N.o de permiso de trabajo seguro (PTS) del formato. */
  workPermit: 'workPermit',
} as const

@Injectable()
export class CounterService {
  constructor(
    @InjectModel(Counter.name) private readonly model: Model<Counter>
  ) { }

  /**
   * Entrega el siguiente numero de la serie. La primera llamada devuelve 1.
   *
   * Cada numero se entrega una sola vez: si quien lo pide no llega a usarlo, se
   * pierde. Es preferible a reutilizarlo, porque el correlativo va impreso en un
   * documento que ya pudo salir del sistema.
   */
  async next(sequence: string): Promise<number> {
    const doc = await this.model
      .findOneAndUpdate(
        { _id: sequence },
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      )
      .lean()
      .exec()
    return (doc as any).seq
  }

  /** Ultimo numero entregado, sin consumir uno nuevo. */
  async current(sequence: string): Promise<number> {
    const doc = await this.model.findById(sequence).lean().exec()
    return (doc as any)?.seq ?? 0
  }
}
