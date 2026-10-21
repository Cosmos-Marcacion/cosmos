import { Injectable, Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { CounterService } from '../counter/counter.service'
import { DocumentNumber, DocumentNumberDocument } from './document-number.entity'

/** Reintentos antes de dar por imposible el reparto de un correlativo. */
const MAX_ATTEMPTS = 5

/** Codigo de error de Mongo para clave duplicada. */
const DUPLICATE_KEY = 11000

/**
 * Definicion de una serie de numeracion.
 *
 * Vive en la definicion del formato, no en el codigo, para que el maestro pueda
 * cambiar el prefijo o el numero de digitos sin desplegar.
 */
export interface NumberSeries {
  /** Identificador estable de la serie. Es la clave del contador. */
  id: string
  /** Va delante del numero: `ATS` produce `ATS-2026-0042`. */
  prefix: string
  /**
   * `year` reinicia el contador cada 1 de enero; `global` no lo reinicia nunca.
   *
   * El permiso de trabajo actual es `global` sin saberlo: su serie lleva
   * corriendo desde que se instalo y el correlativo 42 es el 42 para siempre.
   * Una serie anual necesita el año en el numero impreso, o el 42 de 2026 y el
   * de 2027 son indistinguibles.
   */
  scope: 'year' | 'global'
  /** Digitos del correlativo. `4` produce `0042`. */
  pad: number
}

/** Numero ya asignado y compuesto. */
export interface AssignedNumber {
  seriesId: string
  seq: number
  period: string
  formatted: string
}

export function isValidSeries(series: NumberSeries): boolean {
  return (
    !!series?.id?.trim() &&
    typeof series.prefix === 'string' &&
    (series.scope === 'year' || series.scope === 'global') &&
    Number.isInteger(series.pad) &&
    series.pad >= 1 &&
    series.pad <= 10
  )
}

/**
 * Reparte los correlativos de los documentos.
 *
 * Generaliza lo que hacia `ensureWorkPermitNumber` para una sola serie. Las
 * garantias son las mismas y se sostienen sobre las mismas tres piezas:
 *
 * 1. El reparto es un `$inc` atomico sobre `counters`. Dos peticiones
 *    simultaneas nunca leen el mismo valor.
 * 2. La asignacion se guarda en `document_numbers` con indice unico por
 *    `(serie, nombrada)`. Si dos peticiones llegan a la vez, la segunda choca
 *    con el indice, relee y devuelve el numero de la primera.
 * 3. Un segundo indice unico por `(serie, periodo, correlativo)` impide que dos
 *    nombradas acaben con el mismo numero aunque el contador se haya tocado a
 *    mano.
 *
 * Un numero pedido y no usado se pierde. Es preferible a reutilizarlo: el
 * correlativo va impreso en un documento que ya pudo salir del sistema.
 */
@Injectable()
export class DocumentNumberService {
  private readonly logger = new Logger(DocumentNumberService.name)

  constructor(
    @InjectModel(DocumentNumber.name)
    private readonly model: Model<DocumentNumber>,
    private readonly counterService: CounterService
  ) { }

  /** `2026` para las series anuales, `global` para las que no se reinician. */
  periodFor(series: NumberSeries, when: Date = new Date()): string {
    return series.scope === 'year' ? String(when.getFullYear()) : 'global'
  }

  /** Clave del contador. Una serie anual lleva un contador por año. */
  private counterKey(series: NumberSeries, period: string): string {
    return `docnum:${series.id}:${period}`
  }

  /** `ATS` + `2026` + `42` produce `ATS-2026-0042`. */
  format(series: NumberSeries, period: string, seq: number): string {
    const digits = String(seq).padStart(series.pad, '0')
    const parts = [series.prefix, period === 'global' ? '' : period, digits]
    return parts.filter(part => part !== '').join('-')
  }

  /** Numero ya asignado a esta nombrada en esta serie, o `null`. */
  async find(seriesId: string, staffTransmissionId: number): Promise<AssignedNumber | null> {
    const found = await this.model
      .findOne({ seriesId, staffTransmissionId })
      .lean<DocumentNumberDocument>()
      .exec()
    if (!found) {
      return null
    }
    return {
      seriesId: found.seriesId,
      seq: found.seq,
      period: found.period,
      formatted: found.formatted,
    }
  }

  /**
   * Numero de la nombrada en esta serie, asignandolo si aun no lo tiene.
   *
   * Idempotente: llamarlo mil veces devuelve el mismo numero. Es la propiedad
   * que hace que reemitir un formato no cambie lo que ya se firmo.
   *
   * `seedSeq` adopta un correlativo que ya existia en otro sitio en lugar de
   * consumir uno nuevo. Lo usa la serie del permiso de trabajo para conservar
   * el `workPermitNumber` de las nombradas anteriores a esta numeracion.
   */
  async ensure(
    series: NumberSeries,
    staffTransmissionId: number,
    options: { when?: Date; seedSeq?: number } = {}
  ): Promise<AssignedNumber> {
    if (!isValidSeries(series)) {
      throw new Error(`Serie de numeracion invalida: ${JSON.stringify(series)}`)
    }

    const existing = await this.find(series.id, staffTransmissionId)
    if (existing) {
      // El numero se guarda ya compuesto, pero el prefijo y los digitos viven
      // en la definicion y el maestro puede haberlos cambiado desde entonces.
      // Se recompone para que un cambio de prefijo alcance a los formatos que
      // se reemitan, sin tocar el correlativo, que es lo que no puede moverse.
      const formatted = this.format(series, existing.period, existing.seq)
      return { ...existing, formatted }
    }

    const period = this.periodFor(series, options.when)

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const seq = attempt === 0 && options.seedSeq
        ? options.seedSeq
        : await this.counterService.next(this.counterKey(series, period))
      const formatted = this.format(series, period, seq)

      try {
        await this.model.create({ seriesId: series.id, staffTransmissionId, period, seq, formatted })
        return { seriesId: series.id, seq, period, formatted }
      } catch (error: any) {
        if (error?.code !== DUPLICATE_KEY) {
          throw error
        }
        // O bien otra peticion asigno el numero de esta nombrada entre medias
        // (y ese vale), o bien el correlativo ya estaba tomado por otra (y hay
        // que pedir el siguiente).
        const now = await this.find(series.id, staffTransmissionId)
        if (now) {
          return { ...now, formatted: this.format(series, now.period, now.seq) }
        }
        this.logger.warn(
          `Colision al asignar ${formatted} a la nombrada ${staffTransmissionId}; se reintenta.`
        )
      }
    }

    throw new Error(
      `No se pudo asignar un numero de la serie ${series.id} a la nombrada ${staffTransmissionId}`
    )
  }

  /** Ultimo correlativo entregado en la serie, sin consumir uno nuevo. */
  async current(series: NumberSeries, when?: Date): Promise<number> {
    return this.counterService.current(this.counterKey(series, this.periodFor(series, when)))
  }
}
