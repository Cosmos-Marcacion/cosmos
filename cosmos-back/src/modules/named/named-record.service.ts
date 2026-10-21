import { Injectable, Logger } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import {
  NamedRecord,
  NamedRecordDocument,
  GeneratedFormat,
} from './entities/named-record.entity'
import { CounterService, SEQUENCES } from '../../common/counter/counter.service'

/** Reintentos antes de dar por imposible el reparto de un correlativo. */
const MAX_PERMIT_ATTEMPTS = 5

/**
 * Datos de la nombrada que aporta la plataforma.
 *
 * Vive separado de la coleccion `nameds`, que es espejo del sistema externo y
 * la reescribe el job de sincronizacion. Aqui nada se pierde al resincronizar.
 */
@Injectable()
export class NamedRecordService {
  private readonly logger = new Logger(NamedRecordService.name)

  constructor(
    @InjectModel(NamedRecord.name) private readonly model: Model<NamedRecord>,
    private readonly counterService: CounterService
  ) {}

  async findOne(
    staffTransmissionId: number
  ): Promise<NamedRecordDocument | null> {
    return this.model.findOne({ staffTransmissionId }).lean().exec() as any
  }

  async findByDateRange(
    startIso: string,
    endIso: string
  ): Promise<NamedRecordDocument[]> {
    return this.model
      .find({ workerDateIso: { $gte: startIso, $lte: endIso } })
      .lean()
      .exec() as any
  }

  async findManyByIds(ids: number[]): Promise<NamedRecordDocument[]> {
    if (ids.length === 0) {
      return []
    }
    return this.model
      .find({ staffTransmissionId: { $in: ids } })
      .lean()
      .exec() as any
  }

  /**
   * Crea o actualiza la ficha. Solo se tocan los campos recibidos, para que
   * guardar el jefe de cubierta no borre los datos de la charla.
   *
   * `formatType` se descarta: el formato lo decide el tipo de nave que trae
   * Cosmos (`format/vessel-type.ts`), no quien edita la ficha. Lo que ya hay
   * guardado solo se usa para nombradas copiadas antes de que la API lo trajera.
   */
  async upsert(
    staffTransmissionId: number,
    workerDateIso: string,
    changes: Partial<NamedRecord>
  ): Promise<NamedRecordDocument> {
    const { generatedFormats, formatType, ...rest } = changes as any
    return this.model
      .findOneAndUpdate(
        { staffTransmissionId },
        { $set: { ...rest, staffTransmissionId, workerDateIso } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      )
      .lean()
      .exec() as any
  }

  /**
   * Numero de permiso de trabajo de la nombrada, asignandolo si aun no lo tiene.
   *
   * El correlativo arranca en 1 y no se repite nunca. Lo garantizan tres cosas
   * a la vez: la serie se reparte con un `$inc` atomico, la ficha solo acepta el
   * numero mientras esta vacia, y el indice unico disperso de
   * `workPermitNumber` rechaza cualquier colision que se escapara de las dos
   * anteriores. Si eso ocurre, se pide otro numero y se reintenta.
   *
   * Una vez asignado no cambia: reemitir el formato de la misma nombrada
   * reimprime el mismo permiso, que es lo que espera quien lo firmo.
   */
  async ensureWorkPermitNumber(
    staffTransmissionId: number,
    workerDateIso: string
  ): Promise<number> {
    const current = (await this.model
      .findOne({ staffTransmissionId }, { workPermitNumber: 1 })
      .lean()
      .exec()) as any
    if (current?.workPermitNumber) {
      return current.workPermitNumber
    }

    for (let attempt = 0; attempt < MAX_PERMIT_ATTEMPTS; attempt++) {
      const next = await this.counterService.next(SEQUENCES.workPermit)
      try {
        const updated = (await this.model
          .findOneAndUpdate(
            { staffTransmissionId, workPermitNumber: { $in: [null, 0] } },
            {
              $set: {
                workPermitNumber: next,
                staffTransmissionId,
                workerDateIso,
              },
            },
            { new: true, upsert: true }
          )
          .lean()
          .exec()) as any
        return updated.workPermitNumber
      } catch (error) {
        // Clave duplicada: o el correlativo ya estaba tomado, o otra peticion
        // creo la ficha entre medias. Si esa ficha ya tiene numero, ese vale.
        const existing = (await this.model
          .findOne({ staffTransmissionId }, { workPermitNumber: 1 })
          .lean()
          .exec()) as any
        if (existing?.workPermitNumber) {
          return existing.workPermitNumber
        }
        this.logger.warn(
          `Colision al asignar el permiso de trabajo ${next} a la nombrada ${staffTransmissionId}; se reintenta.`
        )
      }
    }

    throw new Error(
      `No se pudo asignar un numero de permiso de trabajo a la nombrada ${staffTransmissionId}`
    )
  }

  /** Anota un formato emitido, para tener trazabilidad de lo que se entrego. */
  async addGeneratedFormat(
    staffTransmissionId: number,
    workerDateIso: string,
    entry: GeneratedFormat
  ): Promise<void> {
    await this.model
      .updateOne(
        { staffTransmissionId },
        {
          $set: { staffTransmissionId, workerDateIso },
          $push: { generatedFormats: { $each: [entry], $slice: -50 } },
        },
        { upsert: true }
      )
      .exec()
  }
}
