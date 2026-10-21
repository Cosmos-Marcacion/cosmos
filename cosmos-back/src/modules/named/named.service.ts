import {
  forwardRef,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common'
import { HttpService } from '@nestjs/axios'
import { ConfigService } from '@nestjs/config'
import { GetNamedsDto } from './dto/get-nameds.dto'
import { lastValueFrom } from 'rxjs'
import { EmployeeService } from '../employee/employee.service'
import { EmployeeDocument } from '../employee/entities/employee.entity'
import { EntryService } from '../entry/entry.service'
import { Entry, EntryDocument } from '../entry/entities/entry.entity'
import { PointService } from '../point/point.service'
import { PointDocument } from '../point/entities/point.entity'
import { routeEnds } from '../point/point-route'
import { GetNamesByDateAndTurnDto } from './dto/name-and-turn.dto'
import { AssistantService } from '../assistant/assistant.service'
import { TalkService } from '../talk/talk.service'
import { TtlCache } from '../../common/cache/ttl-cache'
import { NamedStoreService } from './named-store.service'
import { NamedRecordService } from './named-record.service'
import { GetNamedBoardDto } from './dto/named-record.dto'
import namedData from './mocks/nameds.mock.json'
import { composeLastName } from '../../common/names/compose-last-name'
import { resolveVesselType } from '../format/vessel-type'

export interface IListStaff {
  staff_transmission_id: number
  staff_vessel_id: number
  vessel_description: string
  voyage_number: string
  location_id: string
  worker_date: string
  shift_description: string
  pier_description: string
  berth_description: string
  staff_vessel_number: string
  /**
   * Codigo del tipo de nave: `ET`, `GR`, `ME`, `CO`, `BB`, `VA` o vacio.
   * Decide el formato; ver `format/vessel-type.ts`. Opcional porque las copias
   * locales anteriores al campo no lo tienen.
   */
  code_type_vessel?: string
  /** `ETANOL`, `GRANEL`, `MERCADERIA`, `CONTAINER`... */
  description_type_vessel?: string
  listStaffDetail: IListStaffDetail[]
}

export interface IListStaffDetail {
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

@Injectable()
export class NamedService {
  private readonly employeeService: EmployeeService
  private readonly entryService: EntryService
  private readonly pointService: PointService
  private readonly assistantService: AssistantService
  private readonly talkService: TalkService

  /**
   * Token del servicio externo reutilizado hasta poco antes de su expiración.
   * Antes se pedía uno nuevo en cada método público, de modo que la mitad del
   * tráfico saliente eran logins.
   */
  private tokenCache: { token: string; expiresAt: number } | null = null
  private tokenInFlight: Promise<any> | null = null

  /** Caché de nombradas por rango de fechas, con coalescing de peticiones. */
  private readonly namedsCache: TtlCache<any>

  constructor(
    private readonly httpService: HttpService,
    private configService: ConfigService,
    private readonly namedStore: NamedStoreService,
    private readonly namedRecordService: NamedRecordService,
    @Inject(forwardRef(() => EmployeeService)) employeeService: any,
    @Inject(forwardRef(() => EntryService)) entryService: any,
    @Inject(forwardRef(() => PointService)) pointService: any,
    @Inject(forwardRef(() => AssistantService)) assistantService: any,
    @Inject(forwardRef(() => TalkService)) talkService: any
  ) {
    this.employeeService = employeeService
    this.entryService = entryService
    this.pointService = pointService
    this.assistantService = assistantService
    this.talkService = talkService
    this.namedsCache = new TtlCache<any>({
      ttlMs: Number(this.configService.get('NAMEDS_CACHE_TTL_MS', 60 * 1000)),
      maxEntries: 100,
    })
  }

  /** Milisegundos de expiración leídos del propio JWT, o `null` si no se puede. */
  private decodeTokenExpiry(token: string): number | null {
    if (typeof token !== 'string') {
      return null
    }
    const parts = token.split('.')
    if (parts.length !== 3) {
      return null
    }
    try {
      const payload = JSON.parse(
        Buffer.from(parts[1], 'base64url').toString('utf8')
      )
      return typeof payload?.exp === 'number' ? payload.exp * 1000 : null
    } catch {
      return null
    }
  }

  private async requestToken(): Promise<any> {
    const user = this.configService.get('USER_COSMOS')
    const password = this.configService.get('PASSWORD_COSMOS')
    const url = `${this.configService.get('URL_COSMOS')}api/Login/Autenticacion`

    try {
      const response = await lastValueFrom(
        this.httpService.post(url, { user, password })
      )
      return response.data
    } catch (error) {
      throw new HttpException(
        'Error de autenticación con el servicio externo',
        HttpStatus.UNAUTHORIZED
      )
    }
  }

  async getToken(): Promise<any> {
    const safetyMarginMs = 60 * 1000
    if (
      this.tokenCache &&
      Date.now() < this.tokenCache.expiresAt - safetyMarginMs
    ) {
      return { token: this.tokenCache.token }
    }
    if (this.tokenInFlight) {
      return this.tokenInFlight
    }

    const fallbackTtlMs = Number(
      this.configService.get('COSMOS_TOKEN_TTL_MS', 20 * 60 * 1000)
    )
    this.tokenInFlight = this.requestToken()
      .then(data => {
        if (data?.token) {
          const expiresAt =
            this.decodeTokenExpiry(data.token) ?? Date.now() + fallbackTtlMs
          this.tokenCache = { token: data.token, expiresAt }
        }
        return data
      })
      .finally(() => {
        this.tokenInFlight = null
      })

    return this.tokenInFlight
  }

  /** Descarta el token cacheado; el siguiente uso vuelve a autenticarse. */
  private invalidateToken(): void {
    this.tokenCache = null
  }

  private isUnauthorized(error: any): boolean {
    const status = error?.response?.status ?? error?.status
    return status === 401 || status === 403
  }

  /**
   * POST autenticado contra el servicio externo. Si el token cacheado fue
   * rechazado se descarta y se reintenta una sola vez con uno nuevo, de modo
   * que cachear el token no puede dejar la integración en un estado inválido.
   */
  private async postWithAuth(url: string, body: any): Promise<any> {
    const send = async () => {
      const tokenData = await this.getToken()
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenData.token}`,
      }
      return lastValueFrom(this.httpService.post(url, body, { headers }))
    }

    try {
      return await send()
    } catch (error) {
      if (this.isUnauthorized(error) && this.tokenCache) {
        this.invalidateToken()
        return send()
      }
      throw error
    }
  }

  async getAllUsers() {
    try {
      const url = `${this.configService.get('URL_COSMOS')}api/Users/ListarUsuarios`

      const response = await this.postWithAuth(url, {})
      const data = response.data
      data.listUsers.filter(user => user.status_description === 'ACTIVO')
      return data
    } catch (error) {
      if (error instanceof HttpException) {
        throw error
      }
      if (error.response) {
        throw new HttpException(error.response.data, error.response.status)
      } else if (error.request) {
        throw new HttpException(
          'Servicio externo no disponible',
          HttpStatus.SERVICE_UNAVAILABLE
        )
      } else {
        throw new HttpException(
          'Error interno en la solicitud',
          HttpStatus.INTERNAL_SERVER_ERROR
        )
      }
    }
  }

  async getUsers() {
    // El buscador de personal de la app móvil sólo usa nombres y documento.
    // Con la proyección se evita enviar el descriptor facial (128 flotantes,
    // el 85% del peso de cada documento) por red celular.
    const employees = await this.employeeService.findAllLean()
    return employees
  }

  async getUserByDoc(prDocumentNumber: string) {
    try {
      const url = `${this.configService.get('URL_COSMOS')}api/Users/ListarUsuarios/`

      const response = await this.postWithAuth(url, { prDocumentNumber })
      return response.data
    } catch (error) {
      throw new HttpException(
        'Error al obtener usuario',
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  /**
   * Nombradas de un rango con todo lo que necesita la vista de marcaciones:
   * los datos del sistema externo, la ficha que guarda la plataforma y el
   * recuento de asistencias y de capacitación.
   *
   * Es la consulta que sustituye al listado plano de trabajadores: la unidad de
   * trabajo real es la nombrada, no la persona.
   */
  async getNamedBoard(dto: GetNamedBoardDto) {
    const nameds = await this.getNameds({
      sInitialDate: dto.sInitialDate,
      sFinalDate: dto.sFinalDate,
    })

    let listStaff: IListStaff[] = nameds?.listStaff ?? []
    if (dto.turn) {
      listStaff = listStaff.filter(n => n.shift_description === dto.turn)
    }
    if (dto.vessel) {
      listStaff = listStaff.filter(n => n.vessel_description === dto.vessel)
    }
    if (listStaff.length === 0) {
      return []
    }

    const ids = listStaff.map(n => n.staff_transmission_id)
    const [records, talks, points] = await Promise.all([
      this.namedRecordService.findManyByIds(ids),
      this.talkService.getByStaffTransmissionIds(ids.map(String)),
      this.pointService.findAllGlobal(),
    ])
    const recordById = new Map(records.map(r => [r.staffTransmissionId, r]))
    const talksByNamed = new Map<string, number>()
    for (const t of talks) {
      const key = String((t as any).staffTransmissionId)
      talksByNamed.set(key, (talksByNamed.get(key) ?? 0) + 1)
    }

    // Asistencias: se cuentan las personas con marcación en el punto inicial.
    const startPointId = routeEnds(points).start?._id?.toString()
    const employees = await this.getEmployees(listStaff)
    const employeeByStaffId = new Map<number, any>()
    for (const e of employees) {
      if (!employeeByStaffId.has(e.id)) employeeByStaffId.set(e.id, e)
    }
    const entries = await this.entryService.getEntriesByEmployeeIds(
      employees.map(e => e._id.toString()),
      this.formatDateToApi(dto.sInitialDate),
      this.formatDateToApi(dto.sFinalDate)
    )
    const presentByNamed = new Map<number, Set<string>>()
    for (const entry of entries) {
      const pointId =
        (entry.pointId as any)?._id?.toString() ?? entry.pointId?.toString()
      if (pointId !== startPointId || entry.isAbsence) continue
      if (!presentByNamed.has(entry.namedId))
        presentByNamed.set(entry.namedId, new Set())
      presentByNamed.get(entry.namedId)!.add(entry.employeeId.toString())
    }

    return listStaff.map(named => {
      const record = recordById.get(named.staff_transmission_id)
      const vesselType = resolveVesselType(
        named.code_type_vessel,
        named.description_type_vessel,
        record?.formatType
      )
      const staffCount = named.listStaffDetail?.length ?? 0
      const assistCount =
        presentByNamed.get(named.staff_transmission_id)?.size ?? 0
      return {
        staffTransmissionId: named.staff_transmission_id,
        /** Número de la nombrada; es de donde sale el N.º de ATS del formato. */
        staffVesselId: named.staff_vessel_id,
        staffVesselNumber: named.staff_vessel_number,
        vesselDescription: named.vessel_description,
        voyageNumber: named.voyage_number,
        locationId: named.location_id,
        pierDescription: named.pier_description,
        workerDate: named.worker_date,
        workerDateIso: named.worker_date.split('/').reverse().join('-'),
        shiftDescription: named.shift_description,
        staffCount,
        assistCount,
        /** Formato que toca por el tipo de nave; `''` si el tipo no se acepta. */
        formatType: vesselType.formatType,
        vesselType,
        jefeCubierta: record?.jefeCubierta ?? null,
        supervisorOperaciones: record?.supervisorOperaciones ?? null,
        supervisorSsoma: record?.supervisorSsoma ?? null,
        talkType: record?.talkType ?? '',
        talkTopicsCount: (record?.talkTopics ?? []).filter(t => t?.topic)
          .length,
        talksCount: talksByNamed.get(String(named.staff_transmission_id)) ?? 0,
        lastFormat: record?.generatedFormats?.length
          ? record.generatedFormats[record.generatedFormats.length - 1]
          : null,
        /** La ficha está lista para emitir formato cuando tiene lo mínimo. */
        ready: Boolean(vesselType.accepted && record?.jefeCubierta?.fullName),
      }
    })
  }

  /**
   * Todo lo que se sabe de una nombrada, en una sola respuesta.
   *
   * La pantalla de detalle necesita la cabecera del sistema externo, la ficha de
   * la plataforma, el personal con sus marcaciones punto por punto, las charlas
   * y el historial de formatos. Servirlo junto evita cinco peticiones desde el
   * navegador y, sobre todo, que cada una vuelva a resolver la misma nombrada.
   */
  async getNamedDetail(staffTransmissionId: number, workerDate: string) {
    const nameds = await this.getNameds({
      sInitialDate: workerDate,
      sFinalDate: workerDate,
    })

    const listStaff: IListStaff[] = nameds?.listStaff ?? []
    const named = listStaff.find(
      n => n.staff_transmission_id === staffTransmissionId
    )
    if (!named) {
      throw new HttpException(
        `No se encontró la nombrada ${staffTransmissionId} en la fecha ${workerDate}`,
        HttpStatus.NOT_FOUND
      )
    }

    const workerDateIso = named.worker_date.split('/').reverse().join('-')
    const details = [...(named.listStaffDetail ?? [])].sort(
      (a, b) => (a.order_number ?? 0) - (b.order_number ?? 0)
    )

    const [record, points, talks, employees] = await Promise.all([
      this.namedRecordService.findOne(staffTransmissionId),
      this.pointService.findAllGlobal(),
      this.talkService.getByStaffTransmissionId(String(staffTransmissionId)),
      this.employeeService.getEmployeesByIds(details.map(d => d.staff_id)),
    ])
    const vesselType = resolveVesselType(
      named.code_type_vessel,
      named.description_type_vessel,
      record?.formatType
    )

    // El mismo documento puede llegar con varios `staff_id` históricos; la
    // ficha que se muestra es la primera, que es la que la sincronización deja
    // vigente. Las marcaciones, en cambio, se suman de todas las fichas del
    // `staff_id`, igual que en la tarjeta del tablero: si no, una marcación
    // hecha con la ficha no vigente contaba en la tarjeta y aquí no.
    const employeeByStaffId = new Map<number, any>()
    const employeeIdsByStaffId = new Map<number, string[]>()
    for (const employee of employees) {
      if (!employeeByStaffId.has(employee.id)) {
        employeeByStaffId.set(employee.id, employee)
      }
      const ids = employeeIdsByStaffId.get(employee.id) ?? []
      ids.push(employee._id.toString())
      employeeIdsByStaffId.set(employee.id, ids)
    }

    // `workerDate` se guarda como `yyyy-mm-dd` y se compara como texto. Con la
    // fecha de la nombrada (`dd/mm/yyyy`) no coincidía nunca: el detalle salía
    // con todo el personal "Sin marcar" aunque la tarjeta contara asistencias.
    const entries = await this.entryService.getEntriesByEmployeeIds(
      employees.map(e => e._id.toString()),
      workerDateIso,
      workerDateIso
    )

    // Marcaciones de esta nombrada, agrupadas por empleado.
    const marksByEmployee = new Map<string, any[]>()
    for (const entry of entries) {
      if (entry.namedId !== staffTransmissionId) {
        continue
      }
      const key = entry.employeeId.toString()
      if (!marksByEmployee.has(key)) {
        marksByEmployee.set(key, [])
      }
      marksByEmployee.get(key)!.push(entry)
    }

    const pointList = points
      .map(p => ({
        id: p._id.toString(),
        name: p.name,
        order: p.order,
      }))
      .sort((a, b) => a.order - b.order)
    const maxOrder = pointList.reduce((max, p) => Math.max(max, p.order), 0)

    const staff = details.map(detail => {
      const employee = employeeByStaffId.get(detail.staff_id)
      const employeeId = employee?._id?.toString() ?? null
      const raw = (employeeIdsByStaffId.get(detail.staff_id) ?? []).flatMap(
        id => marksByEmployee.get(id) ?? []
      )

      // Una marcacion de un punto ya borrado llega con `pointId` nulo tras el
      // populate: contaba en `markCount` (6/2) sin poder pintarse en la ruta.
      const marks = raw
        .filter(
          (entry: { pointId?: unknown; isAbsence?: boolean }) =>
            entry.pointId || entry.isAbsence
        )
        .map(entry => {
          const point = entry.pointId
          const pointId = point?._id?.toString() ?? entry.pointId?.toString()
          return {
            id: entry._id.toString(),
            pointId,
            pointName: point?.name ?? '',
            pointOrder: point?.order ?? 0,
            date: entry.date,
            isAbsence: Boolean(entry.isAbsence),
            isRemate: Boolean(entry.isRemate),
            observation: entry.observation ?? '',
          }
        })
        .sort((a, b) => a.pointOrder - b.pointOrder)

      const present = marks.filter(m => !m.isAbsence)
      const apellidos = composeLastName(
        detail.last_name,
        detail.mother_last_name
      )

      return {
        staffId: detail.staff_id,
        staffTransmissionDetailId: detail.staff_transmission_detail_id,
        orderNumber: detail.order_number,
        teamNumber: detail.team_number,
        firstName: detail.first_name ?? '',
        lastName: apellidos,
        fullName: `${apellidos} ${detail.first_name ?? ''}`
          .trim()
          .replace(/\s+/g, ' '),
        document: detail.personal_id ?? '',
        roleDescription: detail.staff_role_type_description ?? '',
        employeeId,
        /** Sin ficha de empleado no puede marcar: no está registrado todavía. */
        registered: Boolean(employeeId),
        hasSignature: Boolean(employee?.signature),
        hasFingerprint: Boolean(employee?.issetFinger),
        marks,
        markCount: present.length,
        firstMark: present[0]?.date ?? null,
        lastMark: present[present.length - 1]?.date ?? null,
        completed: present.some(m => m.pointOrder === maxOrder),
        absent: marks.length > 0 && marks.every(m => m.isAbsence),
        remate: marks.some(m => m.isRemate),
      }
    })

    const presentCount = staff.filter(s => s.markCount > 0).length
    const completedCount = staff.filter(s => s.completed).length

    return {
      named: {
        staffTransmissionId: named.staff_transmission_id,
        staffVesselId: named.staff_vessel_id,
        staffVesselNumber: named.staff_vessel_number,
        vesselDescription: named.vessel_description,
        voyageNumber: named.voyage_number,
        locationId: named.location_id,
        pierDescription: named.pier_description,
        berthDescription: named.berth_description,
        workerDate: named.worker_date,
        workerDateIso,
        shiftDescription: named.shift_description,
      },
      vesselType,
      record: record
        ? {
            formatType: vesselType.formatType,
            /** Correlativo del permiso de trabajo; `null` mientras no se asigne. */
            workPermitNumber: record.workPermitNumber ?? null,
            jefeCubierta: record.jefeCubierta ?? null,
            supervisorOperaciones: record.supervisorOperaciones ?? null,
            supervisorSsoma: record.supervisorSsoma ?? null,
            jefeCubiertaVsi: record.jefeCubiertaVsi ?? null,
            ssomaVsi: record.ssomaVsi ?? null,
            trainer: record.trainer ?? null,
            registerResponsible: record.registerResponsible ?? null,
            talkType: record.talkType ?? '',
            talkPlace: record.talkPlace ?? '',
            talkIsAnnual: record.talkIsAnnual ?? false,
            talkStartTime: record.talkStartTime ?? '',
            talkEndTime: record.talkEndTime ?? '',
            talkHours: record.talkHours ?? 0,
            talkTopics: record.talkTopics ?? [],
            generatedFormats: record.generatedFormats ?? [],
            notes: record.notes ?? '',
          }
        : null,
      points: pointList,
      staff,
      talks: talks.map((talk: any) => ({
        id: talk._id.toString(),
        type: talk.type,
        topic: talk.topic,
        summary: talk.summary,
        startTime: talk.startTime,
        endTime: talk.endTime,
        hours: talk.hours,
        place: talk.place,
        area: talk.area,
        trainer: talk.trainerId
          ? `${talk.trainerId.firstName ?? ''} ${talk.trainerId.lastName ?? ''}`.trim()
          : '',
        register: talk.registerId
          ? `${talk.registerId.firstName ?? ''} ${talk.registerId.lastName ?? ''}`.trim()
          : '',
      })),
      summary: {
        staffCount: staff.length,
        presentCount,
        completedCount,
        pendingCount: staff.length - presentCount,
        unregisteredCount: staff.filter(s => !s.registered).length,
        talksCount: talks.length,
        talkTopicsCount: (record?.talkTopics ?? []).filter((t: any) => t?.topic)
          .length,
      },
    }
  }

  /**
   * Catálogos de naves, nombradas y posiciones tomados de la copia local, que
   * conserva todo el histórico ya sincronizado. Devuelve `null` mientras esté
   * vacía, para que quien llama recurra al servicio externo.
   */
  async getCatalogs() {
    return this.namedStore.getCatalogs()
  }

  /**
   * Fuerza la relectura de un rango desde el servicio externo y actualiza la
   * copia local, ignorando ambas cachés. Lo usa el refresco periódico de la
   * ventana móvil de días recientes.
   */
  async refreshNamedsRange(getNamedsDto: GetNamedsDto) {
    const startIso = this.namedStore.toIsoDate(getNamedsDto.sInitialDate)
    const endIso = this.namedStore.toIsoDate(getNamedsDto.sFinalDate)
    const days =
      startIso && endIso
        ? this.namedStore.enumerateDays(startIso, endIso)
        : null

    const data = await this.fetchNamedsFromApi(getNamedsDto)

    if (days && Array.isArray(data?.listStaff)) {
      await this.namedStore.save(data.listStaff, days)
    }
    this.namedsCache.delete(
      `${getNamedsDto.sInitialDate}|${getNamedsDto.sFinalDate}`
    )
    return data
  }

  /** Llamada real al servicio externo, sin caché ni copia local de por medio. */
  private async fetchNamedsFromApi(getNamedsDto: GetNamedsDto) {
    const url = `${this.configService.get('URL_COSMOS')}api/Users/ListarNombradas`

    const query: any = {
      sInitialDate: getNamedsDto.sInitialDate,
      sFinalDate: getNamedsDto.sFinalDate,
    }

    const response = await this.postWithAuth(url, query)
    return response.data
  }

  /**
   * Nombradas de un rango, resueltas en tres niveles:
   *   1. caché en memoria del proceso (TTL corto, comparte peticiones en vuelo)
   *   2. copia local en MongoDB, si cubre todo el rango y está vigente
   *   3. servicio externo, cuyo resultado se guarda para las siguientes veces
   *
   * La forma de la respuesta es idéntica en los tres casos.
   */
  async getNameds(getNamedsDto: GetNamedsDto) {
    const cacheKey = `${getNamedsDto.sInitialDate}|${getNamedsDto.sFinalDate}`

    try {
      return await this.namedsCache.wrap(cacheKey, async () => {
        const startIso = this.namedStore.toIsoDate(getNamedsDto.sInitialDate)
        const endIso = this.namedStore.toIsoDate(getNamedsDto.sFinalDate)
        const days =
          startIso && endIso
            ? this.namedStore.enumerateDays(startIso, endIso)
            : null

        if (days) {
          const stored = await this.namedStore.getRange(
            getNamedsDto.sInitialDate,
            getNamedsDto.sFinalDate
          )
          if (stored) {
            return stored.length > 0
              ? {
                  codigoRespuesta: '0',
                  descripcionResp: 'OK',
                  listStaff: stored,
                }
              : {
                  codigoRespuesta: '1',
                  descripcionResp: 'Sin datos',
                  listStaff: [],
                }
          }
        }

        const data = await this.fetchNamedsFromApi(getNamedsDto)

        if (days && Array.isArray(data?.listStaff)) {
          await this.namedStore.save(data.listStaff, days)
        }

        return data
      })
    } catch (error) {
      throw new HttpException(
        'Error al obtener nombradas',
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }

    // const sInitialDateFormated = getNamedsDto.sInitialDate.split('/').reverse().join('-')
    // const sFinalDateFormated = getNamedsDto.sFinalDate.split('/').reverse().join('-')

    // const listStaffFormated = namedData.listStaff.map(named => {
    //   return {
    //     ...named,
    //     worker_date: named.worker_date.split('/').reverse().join('-')
    //   }
    // })

    // const data = [...listStaffFormated.filter(named => named.worker_date >= sInitialDateFormated && named.worker_date <= sFinalDateFormated)]

    // const dataFormated = data.map(named => {
    //   return {
    //     ...named,
    //     worker_date: named.worker_date.split('-').reverse().join('/')
    //   }
    // })

    // return { ...namedData, listStaff: dataFormated } as any
  }

  formatNames(
    names: IListStaff[],
    employees: EmployeeDocument[],
    entries: EntryDocument[],
    points: PointDocument[]
  ) {
    const workerDates = [...new Set(names.map(name => name.worker_date))]
    const endPointId = routeEnds(points).end?._id?.toString()
    const shiftDescriptions = [
      '07:00 - 15:00',
      '15:00 - 23:00',
      '23:00 - 07:00',
    ]

    const namesFormated = workerDates.map(workerDate => {
      return {
        workerDate: workerDate,
        turns: shiftDescriptions.map(shiftDescription => {
          const namedsByTurn = names.filter(
            name => name.shift_description === shiftDescription
          )
          return {
            turn: shiftDescription,
            entries: namedsByTurn.map(named => {
              return {
                named: named,
                detail: named?.listStaffDetail.map(detail => {
                  const employeeInfo = employees.find(
                    employee =>
                      employee.id.toString() === detail.staff_id.toString()
                  )
                  // Sin `pointId` es una marcacion de un punto ya borrado: no
                  // cuenta en el `x/total` del recorrido actual.
                  const entriesInfo = entries.filter(
                    entry =>
                      entry.employeeId.toString() ===
                        employeeInfo?._id.toString() &&
                      entry.namedId === named.staff_transmission_id &&
                      (entry.pointId || entry.isAbsence)
                  )
                  const isAbsence = entriesInfo.some(entry => entry.isAbsence)
                  const record = isAbsence
                    ? `Falta`
                    : `${entriesInfo.length}/${points.length}`
                  // Recorrido terminado: marco el punto de salida, sea cual sea
                  // su `order`. La app lo leia como `order === 8`.
                  const isComplete =
                    !isAbsence &&
                    !!endPointId &&
                    entriesInfo.some(entry => {
                      // Llega poblado (`{ _id, name, ... }`); sin poblar es el id.
                      const ref = entry.pointId as unknown as {
                        _id?: { toString(): string }
                      } | null
                      const id = ref?._id?.toString() ?? entry.pointId?.toString()
                      return id === endPointId
                    })
                  return {
                    ...detail,
                    employeeInfo,
                    entriesInfo,
                    record,
                    isComplete,
                  }
                }),
              }
            }),
          }
        }),
      }
    })

    return namesFormated
  }

  async getEmployees(names: IListStaff[]) {
    const employees = await this.employeeService.getEmployeesByIds(
      names.flatMap(name => name.listStaffDetail.map(detail => detail.staff_id))
    )
    return employees
  }

  async getEntries(
    employees: EmployeeDocument[],
    sInitialDate: string,
    sFinalDate: string
  ) {
    const entries = await this.entryService.getEntriesByEmployeeIds(
      employees.map(employee => employee._id.toString()),
      sInitialDate,
      sFinalDate
    )
    return entries
  }

  async getPoints() {
    const points = await this.pointService.findAllGlobal()
    return points
  }

  async getNamesGrouped(getNamedsDto: GetNamedsDto) {
    const names = await this.getNameds(getNamedsDto)
    const employees = await this.getEmployees(names.listStaff)
    const entries = await this.getEntries(
      employees,
      this.formatDateToApi(getNamedsDto.sInitialDate),
      this.formatDateToApi(getNamedsDto.sFinalDate)
    )
    const points = await this.getPoints()
    if (names.codigoRespuesta === '1') {
      return []
    }
    const namesFormated = this.formatNames(
      names.listStaff,
      employees,
      entries,
      points
    )
    return namesFormated
  }

  formatDate(date: string) {
    const [year, month, day] = date.split('-')
    return `${day}/${month}/${year}`
  }

  formatDateToApi(date: string) {
    const [day, month, year] = date.split('/')
    return `${year}-${month}-${day}`
  }

  async getNamesByDateAndTurn(
    getNamesByDateAndTurnDto: GetNamesByDateAndTurnDto
  ) {
    const workerDate = this.formatDate(getNamesByDateAndTurnDto.workerDate)
    const currentAssistants = await this.assistantService.getByTalkId(
      getNamesByDateAndTurnDto.talkId
    )
    const nameds = await this.getNameds({
      sInitialDate: workerDate,
      sFinalDate: workerDate,
    })

    if (!nameds.listStaff || nameds.listStaff.length === 0) {
      throw new HttpException(
        'No se encontraron datos para la fecha de la charla',
        HttpStatus.NOT_FOUND
      )
    }

    const employees = await this.getEmployees(nameds.listStaff)
    const filteredNamed = nameds.listStaff.find(
      named => named.shift_description === getNamesByDateAndTurnDto.turn
    )

    if (!filteredNamed) {
      throw new HttpException(
        `No se encontraron datos para la fecha ${getNamesByDateAndTurnDto.workerDate} y turno ${getNamesByDateAndTurnDto.turn}. Turnos disponibles: ${nameds.listStaff.map(n => n.shift_description).join(', ')}`,
        HttpStatus.NOT_FOUND
      )
    }

    const listStaffDetail = filteredNamed.listStaffDetail
    const filteredEmployees = employees.filter(employee =>
      listStaffDetail.some(named => named.staff_id === employee.id)
    )

    const employeeIds = filteredEmployees.map(employee =>
      employee._id.toString()
    )
    const entries = await this.entryService.getEntriesByEmployeeIds(
      employeeIds,
      getNamesByDateAndTurnDto.workerDate,
      getNamesByDateAndTurnDto.workerDate
    )

    return filteredEmployees.map(employee => {
      const namedDetail = filteredNamed.listStaffDetail.find(
        detail => detail.staff_id === employee.id
      )
      return {
        _id: employee._id,
        name: employee.firstName + ' ' + employee.lastName,
        document: employee.document,
        signature: employee.signature || '',
        position: namedDetail?.staff_role_type_description,
        isAbsence: entries.some(
          entry =>
            entry.employeeId.toString() === employee._id.toString() &&
            entry.namedId === filteredNamed.staff_transmission_id &&
            entry.isAbsence
        ),
        isEntry: entries.some(
          entry =>
            entry.employeeId.toString() === employee._id.toString() &&
            entry.namedId === filteredNamed.staff_transmission_id &&
            !entry.isAbsence
        ),
        isAssistant: currentAssistants.some(
          assistant =>
            assistant.employee._id.toString() === employee._id.toString()
        ),
      }
    })
  }

  async generateRandomEntries() {
    try {
      const nameds = await this.getNameds({
        sInitialDate: '01/08/2025',
        sFinalDate: '24/08/2025',
      })

      if (!nameds.listStaff || nameds.listStaff.length === 0) {
        throw new HttpException(
          'No se encontraron nombradas para el rango de fechas especificado',
          HttpStatus.NOT_FOUND
        )
      }

      // 2. Obtener todos los puntos de marcación
      const points = await this.pointService.findAllGlobal()
      if (!points || points.length === 0) {
        throw new HttpException(
          'No se encontraron puntos de marcación',
          HttpStatus.NOT_FOUND
        )
      }

      // 3. Obtener todos los empleados
      const employees = await this.employeeService.findAll()
      if (!employees || employees.length === 0) {
        throw new HttpException(
          'No se encontraron empleados',
          HttpStatus.NOT_FOUND
        )
      }
      // Punto obligatorio: el inicial (menor `order`)
      const { start: mandatoryPoint, end: lastPoint } = routeEnds(points)
      if (!mandatoryPoint) {
        throw new HttpException(
          'No se encontró el punto obligatorio (punto inicial)',
          HttpStatus.NOT_FOUND
        )
      }

      const entriesToCreate: any[] = []

      nameds.listStaff.forEach(named => {
        named.listStaffDetail.forEach(detail => {
          const employee = employees.find(
            employee => employee.id === detail.staff_id
          )
          if (employee) {
            points.forEach(point => {
              const entry = new Entry()
              entry.pointId = point._id
              entry.employeeId = employee._id
              entry.namedId = named.staff_transmission_id
              entry.workerDate = named.worker_date
                .split('/')
                .reverse()
                .join('-')
              entry.date = this.generateRandomDateTime(
                named.worker_date,
                named.shift_description,
                point === mandatoryPoint
                  ? 'start'
                  : point === lastPoint
                    ? 'end'
                    : 'middle'
              )
              entry.isAbsence = Math.random() < 0.2 && point === mandatoryPoint
              entry.isRemate = false
              if (
                entriesToCreate.find(
                  e =>
                    e.employeeId.toString() === employee._id.toString() &&
                    e.workerDate === named.worker_date &&
                    e.isAbsence === true
                )
              ) {
                return
              }
              if (
                entriesToCreate.find(
                  e =>
                    e.employeeId.toString() === employee._id.toString() &&
                    e.workerDate === named.worker_date &&
                    point._id.toString() === e.pointId.toString()
                )
              ) {
                return
              }
              entriesToCreate.push(entry)
            })
          }
        })
      })

      // return entriesToCreate

      await this.entryService.createMany(entriesToCreate)
    } catch (error) {
      console.error('Error completo en generateRandomEntries:', error)
      if (error instanceof HttpException) {
        throw error
      }
      throw new HttpException(
        `Error al generar datos aleatorios: ${error.message}`,
        HttpStatus.INTERNAL_SERVER_ERROR
      )
    }
  }

  private generateRandomDateTime(
    workerDateRes: string,
    shiftDescription: string,
    position: 'start' | 'middle' | 'end'
  ): Date {
    const workerDate = workerDateRes.split('/').reverse().join('-')

    const date = new Date(workerDate)
    const startHour =
      shiftDescription === '07:00 - 15:00'
        ? 7
        : shiftDescription === '15:00 - 23:00'
          ? 15
          : 23
    const endHour =
      shiftDescription === '07:00 - 15:00'
        ? 15
        : shiftDescription === '15:00 - 23:00'
          ? 23
          : 7
    const minute = 0
    date.setHours(startHour, minute, 0, 0)

    if (position === 'start') {
      //obtener un numero aleatorio entre 15 y 30
      const randomMinutes = Math.floor(Math.random() * 16) + 14
      date.setMinutes(date.getMinutes() + randomMinutes)
    } else if (position === 'end') {
      date.setHours(endHour, minute, 0, 0)
    } else {
      //obtener un numero aleatorio entre 35 y 120
      const randomMinutes = Math.floor(Math.random() * 86) + 35
      date.setMinutes(date.getMinutes() + randomMinutes)
    }

    return date
  }
}
