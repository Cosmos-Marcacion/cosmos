import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { Named, NamedSyncDay } from './entities/named.entity'
import type { IListStaff } from './named.service'

/**
 * Copia local de las nombradas del servicio externo.
 *
 * `getRange()` sólo devuelve datos cuando **todos** los días del rango están
 * marcados como sincronizados y vigentes. Ante cualquier duda (rango sin
 * cobertura, fecha ilegible, error de base de datos) devuelve `null`, y quien
 * llama vuelve a pedirle los datos al servicio externo. Es decir: la copia
 * local nunca puede provocar una respuesta incompleta, en el peor caso no
 * ahorra la llamada.
 */
@Injectable()
export class NamedStoreService {
  private readonly logger = new Logger(NamedStoreService.name)

  /** Interruptor general: `NAMED_STORE_ENABLED=false` vuelve al comportamiento anterior. */
  private readonly enabled: boolean
  /** Días recientes que se consideran mutables y por tanto tienen TTL corto. */
  private readonly volatileDays: number
  /** TTL de los días dentro de la ventana volátil. */
  private readonly volatileTtlMs: number
  /** TTL de los días anteriores a la ventana volátil. `0` = no expiran. */
  private readonly pastTtlMs: number
  /** Tope de días por consulta; por encima se delega en el servicio externo. */
  private readonly maxRangeDays: number

  constructor(
    @InjectModel(Named.name) private readonly namedModel: Model<Named>,
    @InjectModel(NamedSyncDay.name)
    private readonly syncDayModel: Model<NamedSyncDay>,
    private readonly configService: ConfigService
  ) {
    this.enabled =
      this.configService.get('NAMED_STORE_ENABLED', 'true') !== 'false'
    this.volatileDays = Number(
      this.configService.get('NAMED_STORE_VOLATILE_DAYS', 2)
    )
    this.volatileTtlMs = Number(
      this.configService.get('NAMED_STORE_VOLATILE_TTL_MS', 5 * 60 * 1000)
    )
    this.pastTtlMs = Number(
      this.configService.get('NAMED_STORE_PAST_TTL_MS', 0)
    )
    this.maxRangeDays = Number(
      this.configService.get('NAMED_STORE_MAX_RANGE_DAYS', 800)
    )
  }

  isEnabled(): boolean {
    return this.enabled
  }

  /** `dd/mm/yyyy` -> `yyyy-mm-dd`. Devuelve `null` si el formato no es reconocible. */
  toIsoDate(date: string): string | null {
    if (typeof date !== 'string') {
      return null
    }
    const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(date.trim())
    if (!match) {
      return null
    }
    const [, day, month, year] = match
    const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
    return Number.isNaN(Date.parse(`${iso}T00:00:00.000Z`)) ? null : iso
  }

  /** Lista de días `yyyy-mm-dd` entre dos fechas inclusive. `null` si el rango no es utilizable. */
  enumerateDays(startIso: string, endIso: string): string[] | null {
    const start = Date.parse(`${startIso}T00:00:00.000Z`)
    const end = Date.parse(`${endIso}T00:00:00.000Z`)
    if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
      return null
    }
    const totalDays = Math.round((end - start) / 86400000) + 1
    if (totalDays > this.maxRangeDays) {
      return null
    }
    const days: string[] = []
    for (let i = 0; i < totalDays; i++) {
      days.push(new Date(start + i * 86400000).toISOString().slice(0, 10))
    }
    return days
  }

  private todayIso(): string {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  private volatileFromIso(): string {
    const now = new Date()
    const from = new Date(
      Date.UTC(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - this.volatileDays
      )
    )
    return from.toISOString().slice(0, 10)
  }

  /** Reconstruye la forma exacta que devuelve `api/Users/ListarNombradas`. */
  private toApiShape(doc: any): IListStaff {
    return {
      staff_transmission_id: doc.staffTransmissionId,
      staff_vessel_id: doc.staffVesselId,
      vessel_description: doc.vesselDescription,
      voyage_number: doc.voyageNumber,
      location_id: doc.locationId,
      worker_date: doc.workerDate,
      shift_description: doc.shiftDescription,
      pier_description: doc.pierDescription,
      berth_description: doc.berthDescription,
      staff_vessel_number: doc.staffVesselNumber,
      ...(doc.codeTypeVessel !== undefined && {
        code_type_vessel: doc.codeTypeVessel,
        description_type_vessel: doc.descriptionTypeVessel ?? '',
      }),
      listStaffDetail: doc.listStaffDetail ?? [],
    }
  }

  /**
   * Devuelve las nombradas del rango si la copia local lo cubre por completo,
   * o `null` para que quien llama consulte el servicio externo.
   */
  async getRange(
    sInitialDate: string,
    sFinalDate: string
  ): Promise<IListStaff[] | null> {
    if (!this.enabled) {
      return null
    }

    try {
      const startIso = this.toIsoDate(sInitialDate)
      const endIso = this.toIsoDate(sFinalDate)
      if (!startIso || !endIso) {
        return null
      }

      const days = this.enumerateDays(startIso, endIso)
      if (!days) {
        return null
      }

      const marks = await this.syncDayModel
        .find({ workerDateIso: { $in: days } })
        .select('workerDateIso syncedAt')
        .lean()
        .exec()

      if (marks.length !== days.length) {
        return null
      }

      const now = Date.now()
      const volatileFrom = this.volatileFromIso()
      for (const mark of marks) {
        const syncedAt = new Date(mark.syncedAt).getTime()
        const age = now - syncedAt
        const isVolatile = mark.workerDateIso >= volatileFrom
        if (isVolatile && age > this.volatileTtlMs) {
          return null
        }
        if (!isVolatile && this.pastTtlMs > 0 && age > this.pastTtlMs) {
          return null
        }
      }

      const docs = await this.namedModel
        .find({ workerDateIso: { $in: days } })
        .sort({ staffTransmissionId: 1 })
        .lean()
        .exec()

      return docs.map(doc => this.toApiShape(doc))
    } catch (error) {
      this.logger.warn(
        `No se pudo leer la copia local de nombradas: ${error.message}`
      )
      return null
    }
  }

  /**
   * Guarda la respuesta del servicio externo y marca los días del rango como
   * cubiertos, incluidos los días sin nombradas.
   */
  async save(listStaff: IListStaff[], days: string[]): Promise<void> {
    if (!this.enabled || days.length === 0) {
      return
    }

    try {
      const now = new Date()
      const dayCounts = new Map<string, number>(days.map(day => [day, 0]))
      const namedOps: any[] = []
      const seenIds: number[] = []

      for (const named of listStaff ?? []) {
        const workerDateIso = this.toIsoDate(named.worker_date)
        if (!workerDateIso) {
          continue
        }
        dayCounts.set(workerDateIso, (dayCounts.get(workerDateIso) ?? 0) + 1)
        seenIds.push(named.staff_transmission_id)
        namedOps.push({
          updateOne: {
            filter: { staffTransmissionId: named.staff_transmission_id },
            update: {
              $set: {
                staffTransmissionId: named.staff_transmission_id,
                staffVesselId: named.staff_vessel_id,
                vesselDescription: named.vessel_description,
                voyageNumber: named.voyage_number,
                locationId: named.location_id,
                workerDate: named.worker_date,
                workerDateIso,
                shiftDescription: named.shift_description,
                pierDescription: named.pier_description,
                berthDescription: named.berth_description,
                staffVesselNumber: named.staff_vessel_number,
                ...(named.code_type_vessel !== undefined && {
                  codeTypeVessel: named.code_type_vessel ?? '',
                  descriptionTypeVessel: named.description_type_vessel ?? '',
                }),
                listStaffDetail: named.listStaffDetail ?? [],
                syncedAt: now,
              },
            },
            upsert: true,
          },
        })
      }

      if (namedOps.length > 0) {
        await this.namedModel.bulkWrite(namedOps, { ordered: false })
        // Sólo se purga cuando la respuesta trae datos: si el servicio externo
        // contestara vacío por una incidencia puntual, no se borra nada.
        await this.namedModel
          .deleteMany({
            workerDateIso: { $in: days },
            staffTransmissionId: { $nin: seenIds },
          })
          .exec()
      }

      const dayOps = days.map(day => ({
        updateOne: {
          filter: { workerDateIso: day },
          update: {
            $set: {
              workerDateIso: day,
              syncedAt: now,
              namedCount: dayCounts.get(day) ?? 0,
            },
          },
          upsert: true,
        },
      }))
      await this.syncDayModel.bulkWrite(dayOps, { ordered: false })
    } catch (error) {
      this.logger.warn(
        `No se pudo guardar la copia local de nombradas: ${error.message}`
      )
    }
  }

  /**
   * Catálogos para los desplegables del dashboard, calculados sobre todo lo que
   * la copia local haya acumulado.
   *
   * Devuelve `null` mientras la copia esté vacía, para que quien llama recurra
   * al servicio externo. Es lo que evita tener que descargar más de un año de
   * nombradas en cada carga del panel sólo para listar naves y posiciones.
   */
  async getCatalogs(): Promise<{
    ships: string[]
    nameds: string[]
    positions: string[]
  } | null> {
    if (!this.enabled) {
      return null
    }

    try {
      const total = await this.namedModel.estimatedDocumentCount().exec()
      if (!total) {
        return null
      }

      const [ships, nameds, positions] = await Promise.all([
        this.namedModel.distinct('vesselDescription').exec(),
        this.namedModel.distinct('staffVesselNumber').exec(),
        this.namedModel
          .distinct('listStaffDetail.staff_role_type_description')
          .exec(),
      ])

      return {
        ships: (ships as string[]).filter(Boolean),
        nameds: (nameds as string[]).filter(Boolean),
        positions: (positions as string[]).filter(Boolean),
      }
    } catch (error) {
      this.logger.warn(
        `No se pudieron calcular los catálogos locales: ${error.message}`
      )
      return null
    }
  }

  /** Invalida la cobertura de unos días para forzar su relectura del servicio externo. */
  async invalidateDays(days: string[]): Promise<void> {
    if (!this.enabled || days.length === 0) {
      return
    }
    try {
      await this.syncDayModel
        .deleteMany({ workerDateIso: { $in: days } })
        .exec()
    } catch (error) {
      this.logger.warn(`No se pudo invalidar la copia local: ${error.message}`)
    }
  }
}
