import {
  BadRequestException,
  forwardRef,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { CreateEntryDto } from './dto/create-entry.dto'
import { UpdateEntryDto } from './dto/update-entry.dto'
import { InjectModel } from '@nestjs/mongoose'
import { Model, Types } from 'mongoose'
import { Entry, EntryDocument } from './entities/entry.entity'
import {
  IListStaff,
  IListStaffDetail,
  NamedService,
} from '../named/named.service'
import { NamedRecordService } from '../named/named-record.service'
import { EmployeeService } from '../employee/employee.service'
import { SearchEntryDto } from './dto/search-entry.dto'
import { PointService } from '../point/point.service'
import { CreateManualDto } from './dto/create-manual.dto'
import { EmployeeDocument } from '../employee/entities/employee.entity'
import { PointDocument } from '../point/entities/point.entity'
import { routeEnds } from '../point/point-route'
import { DashboardDto } from './dto/dashboard.dto'
import { TalkService } from '../talk/talk.service'
import { CancelAbsenceDto } from './dto/cancel-absence.dtp'
import { formatInTimeZone } from 'date-fns-tz'
import { subMinutes, isWithinInterval, addMinutes, addDays } from 'date-fns'
import { LIMA_TZ, limaDateTime } from '../../common/time/lima'
import { ConfigService } from '@nestjs/config'
import { TtlCache } from '../../common/cache/ttl-cache'

export interface GroupedEntries {
  employee: EmployeeDocument
  named: IListStaff
  entries: EntryDocumentResponse[]
  listStaffDetail: IListStaffDetail
  totalPoints: number
  /** Punto de salida (mayor `order`): el panel marca `-S` si esta marcado. */
  endPointId?: string
}

export interface EntryDocumentResponse {
  _id: Types.ObjectId
  pointId: Types.ObjectId
  employeeId: Types.ObjectId
  employee: EmployeeDocument
  point: PointDocument
  workerDate: string
  namedId: number
  isRemate: boolean
}

@Injectable()
export class EntryService {
  private readonly pointService: PointService
  private readonly talkService: TalkService

  /**
   * Catálogos de los desplegables del dashboard. Cambian poco y se pedían en
   * cada carga del panel, así que se sirven de caché.
   */
  private readonly dashboardFiltersCache: TtlCache<any>

  constructor(
    @InjectModel(Entry.name) private entryModel: Model<Entry>,
    private readonly namedService: NamedService,
    private readonly namedRecordService: NamedRecordService,
    private readonly employeeService: EmployeeService,
    private readonly configService: ConfigService,
    @Inject(forwardRef(() => PointService)) pointService: any,
    @Inject(forwardRef(() => TalkService)) talkService: any
  ) {
    this.pointService = pointService
    this.talkService = talkService
    this.dashboardFiltersCache = new TtlCache<any>({
      ttlMs: Number(
        this.configService.get('DASHBOARD_FILTERS_CACHE_TTL_MS', 10 * 60 * 1000)
      ),
      maxEntries: 4,
    })
  }
  async create(createEntryDto: CreateEntryDto) {
    const pointId = new Types.ObjectId(createEntryDto.pointId)
    const employeeId = new Types.ObjectId(createEntryDto.employeeId)
    return this.entryModel.create({
      pointId,
      employeeId,
      isAbsence: createEntryDto.isAbsence,
      isRemate: createEntryDto.isRemate,
      workerDate: createEntryDto.workerDate,
      namedId: createEntryDto.namedId,
      observation: createEntryDto.observation,
    })
  }

  async createMany(entries: Entry[]) {
    return this.entryModel.insertMany(entries)
  }

  async createManual(createManualDto: CreateManualDto) {
    const namedId = createManualDto.namedId
    const pointId = new Types.ObjectId(createManualDto.pointId)
    const document = createManualDto.employeeId
    const employee = await this.employeeService.findByDocument(document)
    if (!employee) {
      throw new NotFoundException(
        'El empleado no está registrado en el sistema'
      )
    }
    const employeeId = new Types.ObjectId(employee._id.toString())
    // `toZonedTime` hace la conversion contraria: con el proceso en UTC guardaba
    // la marcacion manual cinco horas antes de la hora que se escribio.
    // `markDate` es el dia real de la marcacion: en el turno de noche la salida
    // cae al dia siguiente de la jornada (`date`).
    const date = limaDateTime(
      createManualDto.markDate || createManualDto.date,
      createManualDto.time
    )
    return this.entryModel.create({
      pointId,
      employeeId,
      date,
      workerDate: createManualDto.date,
      namedId,
      observation: createManualDto.observation,
    })
  }

  async findAll() {
    return await this.entryModel.find().exec()
  }

  async findOne(id: string) {
    return await this.entryModel.findById(id).exec()
  }

  async update(id: string, updateEntryDto: UpdateEntryDto) {
    const updated = await this.entryModel
      .findByIdAndUpdate(new Types.ObjectId(id), updateEntryDto, { new: true })
      .exec()
    if (!updated) {
      throw new NotFoundException('Marcación no encontrada')
    }
    return updated
  }

  getDateRange(startDate: string, endDate: string) {
    const startDateRes = new Date(`${startDate.split('T')[0]} 00:00:00`)
    const endDateRes = new Date(`${endDate.split('T')[0]} 23:59:59`)
    return {
      startDate: startDateRes,
      endDate: endDateRes,
    }
  }

  groupByEmployee(entries: any[], nameds: IListStaff[], totalPoints: number) {
    const newEntries: GroupedEntries[] = []
    // El grupo ya creado se buscaba recorriendo `newEntries` en cada entrada, y
    // la nombrada recorriendo `nameds`. Ambos pasan a ser búsquedas por clave.
    const groupByEmployeeAndNamed = new Map<string, GroupedEntries>()
    const namedById = this.indexNamedsById(nameds)
    const positionByNamed = this.indexPositionsByNamed(nameds)

    entries.forEach(entry => {
      const employeeId = entry?.employeeId?._id?.toString()
      if (employeeId) {
        const groupKey = `${employeeId}|${entry.namedId}`
        const employee = groupByEmployeeAndNamed.get(groupKey)
        const named = namedById.get(entry.namedId)
        if (employee) {
          employee.entries.push(entry)
        } else {
          if (named) {
            const listStaffDetail = positionByNamed
              .get(named.staff_transmission_id)
              ?.get(entry.employeeId.id)
            if (listStaffDetail) {
              const group = {
                employee: entry.employeeId,
                named,
                entries: [entry],
                listStaffDetail,
                totalPoints,
              }
              newEntries.push(group)
              groupByEmployeeAndNamed.set(groupKey, group)
            }
          }
        }
      }
    })
    return newEntries
  }

  async search(searchEntryDto: SearchEntryDto) {
    const workerDate = this.formatDate(searchEntryDto.workerDate)
    const nameds = await this.namedService.getNameds({
      sInitialDate: workerDate,
      sFinalDate: workerDate,
    })

    const entries = await this.entryModel
      .find({
        workerDate: {
          $gte: searchEntryDto.workerDate,
          $lte: searchEntryDto.workerDate,
        },
      })
      .populate('pointId')
      .populate('employeeId')
      .exec()

    const totalPoints = await this.pointService.findAll(0, 1)
    const endPointId = routeEnds(totalPoints.data).end?._id?.toString()

    // Las marcaciones de puntos ya borrados llegan con `pointId` nulo tras el
    // populate: inflaban el contador (6/2) y rompian el panel al leer su orden.
    let groupedEntries = this.groupByEmployee(
      entries.filter(entry => entry.pointId || entry.isAbsence),
      nameds.listStaff,
      totalPoints.data.length
    )
    for (const group of groupedEntries) {
      group.endPointId = endPointId
    }

    if (searchEntryDto.turn) {
      groupedEntries = groupedEntries.filter(
        e => e.named.shift_description === searchEntryDto.turn
      )
    }

    // Opciones de los desplegables del panel: salen de la jornada entera, no
    // de la pagina que se esta viendo.
    const ships = uniqueSorted(groupedEntries.map(e => e.named?.vessel_description))
    const positions = uniqueSorted(
      groupedEntries.map(e => e.listStaffDetail?.staff_role_type_description)
    )

    const texto = normalizar(searchEntryDto.search)
    if (texto) {
      groupedEntries = groupedEntries.filter(e =>
        normalizar(`${e.employee?.firstName ?? ''} ${e.employee?.lastName ?? ''}`).includes(texto)
      )
    }
    if (searchEntryDto.ship) {
      groupedEntries = groupedEntries.filter(
        e => e.named?.vessel_description === searchEntryDto.ship
      )
    }
    if (searchEntryDto.position) {
      groupedEntries = groupedEntries.filter(
        e => e.listStaffDetail?.staff_role_type_description === searchEntryDto.position
      )
    }

    //limit y skip
    const startIndex = (searchEntryDto.page - 1) * searchEntryDto.limit
    const endIndex = startIndex + searchEntryDto.limit
    const paginatedEntries = groupedEntries.slice(startIndex, endIndex)

    return {
      data: paginatedEntries,
      // Se cuentan las filas que se pintan, que son trabajadores, no las
      // marcaciones sueltas: cada trabajador deja varias y el total salia
      // inflado, con paginas vacias al final.
      total: groupedEntries.length,
      page: searchEntryDto.page,
      limit: searchEntryDto.limit,
      ships,
      positions,
    }
  }

  async remove(id: string) {
    return await this.entryModel.findByIdAndDelete(id).exec()
  }

  async getEntriesByEmployeeIds(
    employeeIds: string[],
    sInitialDate: string,
    sFinalDate: string
  ) {
    const objTypesEmployeeIds = employeeIds.map(id => new Types.ObjectId(id))
    return await this.entryModel
      .find({
        employeeId: { $in: objTypesEmployeeIds },
        workerDate: { $gte: sInitialDate, $lte: sFinalDate },
      })
      .populate('pointId')
      .exec()
  }

  async getLastEntry(employeeIdRes: string): Promise<EntryDocument | null> {
    const employeeId = new Types.ObjectId(employeeIdRes)
    const today = `${this.getZeroMonth(new Date().getDate())}/${this.getZeroMonth(new Date().getMonth() + 1)}/${new Date().getFullYear()}`
    const lastEntry = await this.entryModel
      .findOne({ employeeId, workerDate: today })
      .sort({ order: 1 })
      .exec()
    if (lastEntry && lastEntry.workerDate === today) {
      return lastEntry
    }
    return null
  }

  getZeroMonth(month: number) {
    return month < 10 ? `0${month}` : month
  }

  /**
   * Si ahora cae dentro del turno de la nombrada, con las tolerancias.
   *
   * El turno se interpreta en hora de Lima de forma explicita. Antes se armaba
   * con la zona del proceso, y el contenedor corre en UTC: el turno de 07:00 a
   * 15:00 quedaba abierto de 02:00 a 10:00 de Lima.
   */
  verifyRange(
    range: string,
    previousTolerance: number,
    nextTolerance: number,
    workerDate: string,
    now: Date = new Date()
  ) {
    const [initialHourStr, finalHourStr] = range.split('-').map(s => s.trim())
    const dateIso = this.formatToStringDate(workerDate)

    let initialDate = limaDateTime(dateIso, this.padTime(initialHourStr))
    let finalDate = limaDateTime(dateIso, this.padTime(finalHourStr))
    // Turno que cruza la medianoche (23:00 - 07:00): termina al dia siguiente.
    if (finalDate.getTime() <= initialDate.getTime()) {
      finalDate = addDays(finalDate, 1)
    }

    initialDate = subMinutes(initialDate, previousTolerance || 0)
    finalDate = addMinutes(finalDate, nextTolerance || 0)

    return isWithinInterval(now, { start: initialDate, end: finalDate })
  }

  /** `7:0` o `07:00` a `07:00`. */
  private padTime(time: string): string {
    const [h, m] = time.split(':').map(Number)
    return `${String(h || 0).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`
  }

  getEntriesByNamedId(namedId: number, employeeId: string) {
    return this.entryModel
      .find({ namedId, employeeId: new Types.ObjectId(employeeId) })
      .populate('pointId')
      .exec()
  }

  async getEntries(employeeId: string, workerDate: string) {
    return this.entryModel
      .find({ employeeId: new Types.ObjectId(employeeId), workerDate })
      .populate('pointId')
      .exec()
  }

  async verifyLastEntry(
    employeeId: string,
    pointId: string,
    workerDate: string,
    namedId: number
  ): Promise<boolean> {
    const lastEntry = await this.entryModel
      .findOne({
        employeeId: new Types.ObjectId(employeeId),
        pointId: new Types.ObjectId(pointId),
        workerDate,
        namedId,
      })
      .exec()
    return lastEntry ? true : false
  }

  async verifyDependence(
    employeeId: string,
    pointId: string,
    workerDate: string,
    namedId: number
  ) {
    const point: any = await this.pointService.findOne(pointId)
    const dependOn = point.dependOnId as PointDocument
    if (dependOn) {
      const lastEntry = await this.verifyLastEntry(
        employeeId,
        dependOn._id.toString(),
        workerDate,
        namedId
      )
      if (!lastEntry) {
        throw new BadRequestException(
          `Debe marcar la entrada en el punto ${dependOn.name}`
        )
      }
    }
  }

  formatToStringDate(date: string) {
    const dateRes = date.split('/')
    return `${dateRes[2]}-${dateRes[1]}-${dateRes[0]}`
  }

  /** Fecha de hoy en Lima, `dd/mm/yyyy`. */
  getTodayDateToNamed(now: Date) {
    return formatInTimeZone(now, LIMA_TZ, 'dd/MM/yyyy')
  }

  /** Fecha de ayer en Lima, `dd/mm/yyyy`. */
  getYesterdayDateToNamed(now: Date) {
    return formatInTimeZone(addDays(now, -1), LIMA_TZ, 'dd/MM/yyyy')
  }

  async checkin(createEntryDto: CreateEntryDto) {
    const pointId = new Types.ObjectId(createEntryDto.pointId)
    const allPoints = await this.pointService.findAll(0, 1)

    const employeeId = new Types.ObjectId(createEntryDto.employeeId)
    const employee = await this.employeeService.findOne(
      createEntryDto.employeeId
    )
    if (!employee) {
      throw new NotFoundException(
        'El empleado no está registrado en el sistema'
      )
    }
    const now = new Date()
    const sInitialDate = this.getYesterdayDateToNamed(now)
    const sFinalDate = this.getTodayDateToNamed(now)
    const nameds = await this.namedService.getNameds({
      sInitialDate,
      sFinalDate,
    })

    const named = nameds.listStaff.find(
      named => named.staff_transmission_id === createEntryDto.namedId
    )

    if (!named) {
      throw new NotFoundException('No se encontró la nombrada')
    }

    const { start: startPoint, end: endPoint } = routeEnds(allPoints.data)

    if (!startPoint || !endPoint) {
      throw new BadRequestException(
        'No se encontraron los puntos de marcación '
      )
    }

    const range = this.verifyRange(
      named.shift_description,
      startPoint.previousTolerance,
      endPoint.nextTolerance,
      named.worker_date
    )
    if (range) {
      const lastEntry = await this.verifyLastEntry(
        employee._id.toString(),
        pointId.toString(),
        this.formatToStringDate(named.worker_date),
        named.staff_transmission_id
      )
      if (lastEntry) {
        throw new BadRequestException(
          'El empleado ya tiene una entrada registrada para hoy en ese punto'
        )
      }
      await this.verifyDependence(
        employee._id.toString(),
        pointId.toString(),
        this.formatToStringDate(named.worker_date),
        named.staff_transmission_id
      )
      return this.entryModel.create({
        pointId,
        employeeId,
        workerDate: this.formatToStringDate(named.worker_date),
        namedId: named.staff_transmission_id,
        // Con que se identifico la persona. Sin esto, una marcacion con los
        // datos de otro no se podia reconstruir.
        ...(createEntryDto.method ? { method: createEntryDto.method } : {}),
        ...(typeof createEntryDto.matchScore === 'number'
          ? { matchScore: createEntryDto.matchScore }
          : {}),
      })
    }

    throw new BadRequestException('Fuera del rango de horario')
  }

  formatDate(date: string) {
    const dateRes = date.split('-')
    return `${dateRes[2]}/${dateRes[1]}/${dateRes[0]}`
  }

  async getEntriesByEmployeeIdAndNamedId(
    employeeId: string,
    namedId: number,
    workerDate: string
  ) {
    const date = this.formatDate(workerDate)
    // En orden de hora: la ficha se lee como el recorrido del trabajador.
    const [entries, employee, nameds] = await Promise.all([
      this.entryModel
        .find({ employeeId: new Types.ObjectId(employeeId), namedId, workerDate })
        .sort({ date: 1 })
        .populate('pointId')
        .exec(),
      this.employeeService.findOne(employeeId),
      this.namedService.getNameds({
        sInitialDate: date,
        sFinalDate: date,
      }),
    ])
    const named = nameds.listStaff.find(
      named => named.staff_transmission_id === namedId
    )
    if (!named) {
      throw new NotFoundException('No se encontró la nombrada')
    }
    // El panel necesita el documento para registrar una marcacion que falte.
    return {
      entries,
      named,
      employee,
    }
  }

  async getEntriesByEmployeeId(
    employeeId: string,
    staffTransmissionId: number,
    dateRes: string
  ) {
    const date = this.formatDate(dateRes)
    const employee = await this.employeeService.findOne(employeeId)
    const nameds = await this.namedService.getNameds({
      sInitialDate: date,
      sFinalDate: date,
    })
    const named = nameds.listStaff.find(
      named => named.staff_transmission_id === staffTransmissionId
    )
    if (!named) {
      throw new NotFoundException('No se encontró la nombrada')
    }
    const employeeInfo = named.listStaffDetail.find(
      detail => detail.staff_id === employee?.id
    )
    if (!employee) {
      throw new NotFoundException(
        'El empleado no está registrado en el sistema'
      )
    }
    const entries = await this.entryModel
      .find({
        employeeId: employee._id,
        workerDate: dateRes,
        namedId: staffTransmissionId,
      })
      .exec()
    const allPoints = await this.pointService.findAll(0, 1)
    const points = allPoints.data.map(point => {
      const entry: EntryDocument = entries.find(
        entry => entry.pointId.toString() === point._id.toString()
      ) as EntryDocument
      const isAbsence = entry?.isAbsence || false
      const isChecked = isAbsence
        ? false
        : entries.some(
            entry => entry.pointId.toString() === point._id.toString()
          )

      return {
        ...point,
        isChecked,
        isAbsence,
        dateCheck: entry?.date || '',
      }
    })
    return { employee, points, nameds: employeeInfo, named }
  }

  async checkoutRemate(
    employeeIdRes: string,
    pointIdRes: string,
    lastEntry: EntryDocument
  ) {
    const employeeId = new Types.ObjectId(employeeIdRes)
    const pointId = new Types.ObjectId(pointIdRes)
    return this.entryModel.create({
      pointId,
      employeeId,
      workerDate: lastEntry.workerDate,
      namedId: lastEntry.namedId,
      isRemate: true,
    })
  }

  async checkinRemate(
    employeeIdRes: string,
    pointIdRes: string,
    namedId: number,
    workerDate: string
  ) {
    const employeeId = new Types.ObjectId(employeeIdRes)
    const pointId = new Types.ObjectId(pointIdRes)
    return this.entryModel.create({
      pointId,
      employeeId,
      workerDate,
      namedId,
      isRemate: true,
    })
  }

  getNextDate(date: string) {
    const [year, month, day] = date.split('-').map(Number)
    const nextDate = new Date(year, month - 1, day)
    nextDate.setDate(nextDate.getDate() + 1)
    const dayRes = String(nextDate.getDate()).padStart(2, '0')
    const monthRes = String(nextDate.getMonth() + 1).padStart(2, '0')
    const yearRes = nextDate.getFullYear()
    return `${dayRes}/${monthRes}/${yearRes}`
  }

  async getNextNamed(lastEntry: EntryDocument) {
    const nextDate = this.getNextDate(lastEntry.workerDate)
    const nameds = await this.namedService.getNameds({
      sInitialDate: this.formatDate(lastEntry.workerDate),
      sFinalDate: nextDate,
    })
    return nameds.listStaff.find(
      named => named.staff_transmission_id > lastEntry.namedId
    )
  }

  async remate(employeeId: string) {
    const today = `${this.getZeroMonth(new Date().getFullYear())}-${this.getZeroMonth(new Date().getMonth() + 1)}-${new Date().getDate()}`
    const points = await this.pointService.findAll(0, 1)
    const fisrtPoint = points.data[0]
    const lastEntry = await this.entryModel
      .findOne({
        employeeId: new Types.ObjectId(employeeId),
        pointId: fisrtPoint._id,
        workerDate: today,
      })
      .exec()
    if (!lastEntry) {
      throw new BadRequestException(
        'El empleado no tiene una entrada registrada'
      )
    }
    const lastPoint = points.data[points.data.length - 1]
    await this.checkoutRemate(employeeId, lastPoint._id.toString(), lastEntry)
    const nextNamed = await this.getNextNamed(lastEntry)
    if (!nextNamed) {
      return {
        status: 'warning',
        message:
          'Remate realizado correctamente, pero no se pudo registrar la entrada, debido ha que no se encontró la siguiente nombrada',
      }
    }
    if (nextNamed?.worker_date) {
      await this.checkinRemate(
        employeeId,
        fisrtPoint._id.toString(),
        nextNamed.staff_transmission_id,
        this.formatToStringDate(nextNamed.worker_date)
      )
    } else {
      return {
        status: 'warning',
        message:
          'Remate realizado correctamente, pero no se pudo registrar la entrada, debido ha que no se encontró la siguiente nombrada',
      }
    }
    return {
      status: 'success',
      message: 'Remate realizado correctamente',
    }
  }

  formatToAPIDate(date: string) {
    const dateRes = date.split('-')
    return `${dateRes[2]}/${dateRes[1]}/${dateRes[0]}`
  }

  groupByEmployeeId(entries: EntryDocument[]) {
    const groupedEntries = entries.reduce((acc, entry) => {
      acc[entry.employeeId.toString()] = acc[entry.employeeId.toString()] || []
      acc[entry.employeeId.toString()].push(entry)
      return acc
    }, {})
    return groupedEntries
  }

  getPersonNameds(nameds: IListStaff[]) {
    let total = 0
    nameds.forEach(named => {
      total += named.listStaffDetail.length
    })
    return total
  }

  groupByWorkerDate(entries: EntryDocument[]) {
    const entriesGroupedByWorkerDate = entries.reduce((acc, entry) => {
      acc[entry.workerDate] = acc[entry.workerDate] || []
      acc[entry.workerDate].push(entry)
      return acc
    }, {})
    return entriesGroupedByWorkerDate
  }

  // ---------------------------------------------------------------------------
  // Índices auxiliares del dashboard.
  //
  // Los cálculos hacían `employees.find(...)`, `nameds.find(...)` y
  // `entries.filter(...)` dentro de bucles anidados sobre nombradas y personal,
  // lo que da un coste cuadrático o cúbico sobre el rango consultado. Estos
  // índices se construyen una vez por llamada y dejan cada búsqueda en O(1).
  //
  // Todos replican la semántica de `Array.prototype.find`, que devuelve la
  // primera coincidencia: por eso nunca se sobrescribe una clave ya presente.
  // ---------------------------------------------------------------------------

  private indexEmployeesByObjectId(employees: EmployeeDocument[]) {
    const index = new Map<string, EmployeeDocument>()
    for (const employee of employees) {
      const key = employee._id.toString()
      if (!index.has(key)) {
        index.set(key, employee)
      }
    }
    return index
  }

  private indexEmployeesByStaffId(employees: EmployeeDocument[]) {
    const index = new Map<number, EmployeeDocument>()
    for (const employee of employees) {
      if (!index.has(employee.id)) {
        index.set(employee.id, employee)
      }
    }
    return index
  }

  /** Conjunto de `staff_id` registrados localmente, para pruebas de pertenencia O(1). */
  private indexEmployeeStaffIds(employees: EmployeeDocument[]) {
    const ids = new Set<number>()
    for (const employee of employees) {
      ids.add(employee.id)
    }
    return ids
  }

  private indexNamedsById(nameds: IListStaff[]) {
    const index = new Map<number, IListStaff>()
    for (const named of nameds) {
      if (!index.has(named.staff_transmission_id)) {
        index.set(named.staff_transmission_id, named)
      }
    }
    return index
  }

  private indexPositionsByNamed(nameds: IListStaff[]) {
    const index = new Map<number, Map<number, IListStaffDetail>>()
    for (const named of nameds) {
      if (index.has(named.staff_transmission_id)) {
        continue
      }
      const byStaffId = new Map<number, IListStaffDetail>()
      for (const detail of named.listStaffDetail ?? []) {
        if (!byStaffId.has(detail.staff_id)) {
          byStaffId.set(detail.staff_id, detail)
        }
      }
      index.set(named.staff_transmission_id, byStaffId)
    }
    return index
  }

  /** Entradas agrupadas por `empleado|nombrada`, conservando el orden original. */
  private indexEntriesByEmployeeAndNamed(entries: EntryDocument[]) {
    const index = new Map<string, EntryDocument[]>()
    for (const entry of entries) {
      const key = `${entry.employeeId.toString()}|${entry.namedId}`
      const bucket = index.get(key)
      if (bucket) {
        bucket.push(entry)
      } else {
        index.set(key, [entry])
      }
    }
    return index
  }

  /** Primera entrada de cada `empleado|nombrada` en el punto indicado. */
  private indexFirstEntryByEmployeeAndNamed(
    entries: EntryDocument[],
    pointId: string
  ) {
    const index = new Map<string, EntryDocument>()
    for (const entry of entries) {
      if (entry.pointId.toString() !== pointId.toString()) {
        continue
      }
      const key = `${entry.employeeId.toString()}|${entry.namedId}`
      if (!index.has(key)) {
        index.set(key, entry)
      }
    }
    return index
  }

  // ---------------------------------------------------------------------------
  // Filtros del panel.
  //
  // Cada cálculo repetía el mismo bloque de tres `if`, y en `getTotalNames` los
  // filtros se reasignaban desde el arreglo original en lugar de encadenarse:
  // navío + turno juntos sólo aplicaban el turno. Un único punto de verdad
  // garantiza que todas las tarjetas, gráficos y tablas cuenten lo mismo.
  //
  // `namedId` es siempre el `staff_vessel_number` que publica
  // `GET /entry/dashboard/filters`. Antes cada cálculo lo interpretaba a su
  // manera (`staff_vessel_id` numérico en el detalle de nombradas, la etiqueta
  // "id - numero" en la tabla de asistencias) y ninguna de las dos coincidía
  // nunca con lo que envía el panel.
  // ---------------------------------------------------------------------------

  /** Nombradas que pasan los filtros de nombrada, navío y turno, en cadena. */
  private filterNamedsByDto(
    nameds: IListStaff[],
    dashboardDto: DashboardDto
  ): IListStaff[] {
    const { namedId, ship, turn } = dashboardDto
    let filtered = nameds
    if (namedId) {
      filtered = filtered.filter(named => named.staff_vessel_number === namedId)
    }
    if (ship) {
      filtered = filtered.filter(named => named.vessel_description === ship)
    }
    if (turn) {
      filtered = filtered.filter(named => named.shift_description === turn)
    }
    return filtered
  }

  /**
   * Personal de una nombrada que está registrado localmente y pasa los filtros
   * de cargo y empleado.
   */
  private filterStaffDetails(
    named: IListStaff,
    dashboardDto: DashboardDto,
    registeredStaffIds: Set<number>,
    filterStaffId?: number
  ): IListStaffDetail[] {
    const { position } = dashboardDto
    let details = (named.listStaffDetail ?? []).filter(detail =>
      registeredStaffIds.has(detail.staff_id)
    )
    if (position) {
      details = details.filter(
        detail => detail.staff_role_type_description === position
      )
    }
    if (filterStaffId !== undefined) {
      details = details.filter(detail => detail.staff_id === filterStaffId)
    }
    return details
  }

  /**
   * Datos base de una consulta del panel: puntos, nombradas, entradas del rango
   * y empleados. Los tres extremos del panel pedían exactamente lo mismo, cada
   * uno por su cuenta y de forma secuencial. Aquí se cargan una sola vez y en
   * paralelo, con proyección y `lean()` para no hidratar documentos Mongoose
   * que sólo se leen.
   */
  private async loadDashboardContext(dashboardDto: DashboardDto) {
    const { startDate, endDate } = dashboardDto
    const start = this.formatToAPIDate(startDate)
    const end = this.formatToAPIDate(endDate)

    const [pointsRes, namedsRes, entries, employees] = await Promise.all([
      this.pointService.findAll(0, 1),
      this.namedService.getNameds({ sInitialDate: start, sFinalDate: end }),
      this.entryModel
        .find({ workerDate: { $gte: startDate, $lte: endDate } })
        .select('employeeId pointId namedId workerDate date isAbsence isRemate')
        .lean<EntryDocument[]>()
        .exec(),
      this.employeeService.findAllLean(),
    ])

    const { start: startPoint, end: endPoint } = routeEnds(pointsRes.data)
    if (!startPoint || !endPoint) {
      throw new BadRequestException(
        'No se encontraron puntos de entrada o salida'
      )
    }

    // Las marcaciones de puntos ya borrados no cuentan: con el recorrido
    // reducido darian contadores como 6 / 2. Las faltas si, sea cual sea el
    // punto en que se registraron: son de la persona, no del punto.
    const pointIds = new Set(pointsRes.data.map(p => p._id.toString()))
    return {
      points: pointsRes.data as PointDocument[],
      nameds: (namedsRes?.listStaff ?? []) as IListStaff[],
      entries: entries.filter(
        entry => entry.isAbsence || pointIds.has(entry.pointId?.toString())
      ),
      employees: employees as EmployeeDocument[],
      startPointId: startPoint._id.toString(),
      endPointId: endPoint._id.toString(),
    }
  }

  /**
   * Filas de la tabla de asistencias: una por empleado, día y nombrada.
   *
   * Antes se recorría el producto `fechas x empleados` y de cada empleado sólo
   * se conservaba la primera nombrada del día (`entriesByDateAndEmployee[0]`),
   * de modo que la jornada de quien trabajaba en dos nombradas el mismo día
   * desaparecía y sus marcaciones se contaban a medias. Ahora se agrupa por
   * `dia|empleado|nombrada`, que es la unidad real de la tabla.
   */
  formatAsistances(
    entries: EntryDocument[],
    nameds: IListStaff[],
    employees: EmployeeDocument[],
    dashboardDto: DashboardDto,
    endPointId: string,
    totalPoints: number
  ) {
    const employeeById = this.indexEmployeesByObjectId(employees)
    const namedById = this.indexNamedsById(nameds)
    const positionByNamed = this.indexPositionsByNamed(nameds)

    interface AssistanceGroup {
      workerDate: string
      employeeId: string
      namedId: number
      markingsCount: number
      isAbsence: boolean
    }

    // Un solo recorrido de las entradas construye todo lo que antes se
    // recalculaba con `filter`/`find` dentro de los bucles anidados.
    const groups = new Map<string, AssistanceGroup>()
    const endPointByEmployeeAndNamed = new Set<string>()

    for (const entry of entries) {
      const employeeId = entry.employeeId.toString()
      const key = `${entry.workerDate}|${employeeId}|${entry.namedId}`
      const group = groups.get(key)
      if (group) {
        group.markingsCount++
        if (entry.isAbsence) {
          group.isAbsence = true
        }
      } else {
        groups.set(key, {
          workerDate: entry.workerDate,
          employeeId,
          namedId: entry.namedId,
          markingsCount: 1,
          isAbsence: !!entry.isAbsence,
        })
      }
      if (entry.pointId.toString() === endPointId.toString()) {
        endPointByEmployeeAndNamed.add(`${employeeId}|${entry.namedId}`)
      }
    }

    let entriesRes: any[] = []

    for (const group of groups.values()) {
      const named = namedById.get(group.namedId)
      if (!named) {
        continue
      }
      const employee = employeeById.get(group.employeeId)
      const issetEndPoint = endPointByEmployeeAndNamed.has(
        `${group.employeeId}|${named.staff_transmission_id}`
      )
      entriesRes.push({
        named: `${named.staff_transmission_id} - ${named.staff_vessel_number}`,
        // Clave cruda de la nombrada, para que el filtro compare contra el
        // mismo valor que envía el panel y no contra la etiqueta de la tabla.
        namedNumber: named.staff_vessel_number,
        location: `${named.location_id}`,
        muelle: `${named.pier_description}`,
        ship: `${named.vessel_description} - ${named.voyage_number}`,
        shipName: named.vessel_description,
        position:
          positionByNamed
            .get(named.staff_transmission_id)
            ?.get(employee?.id as number)?.staff_role_type_description || '',
        workerDate: group.workerDate,
        employeeId: group.employeeId,
        employee: employee ? `${employee.firstName} ${employee.lastName}` : '',
        turn: named.shift_description || '',
        markings: `${group.markingsCount} / ${totalPoints} ${issetEndPoint ? '-S' : ''}`,
        isAbsence: group.isAbsence,
      })
    }

    if (dashboardDto.turn) {
      entriesRes = entriesRes.filter(entry => entry.turn === dashboardDto.turn)
    }

    if (dashboardDto.position) {
      entriesRes = entriesRes.filter(
        entry => entry.position === dashboardDto.position
      )
    }

    if (dashboardDto.ship) {
      // Comparación contra el nombre de la nave, no contra `nave - viaje`
      // partido por " - ": el separador aparece también dentro de nombres como
      // "CMA CGM - VOLTAIRE".
      entriesRes = entriesRes.filter(
        entry => entry.shipName === dashboardDto.ship
      )
    }

    if (dashboardDto.namedId) {
      entriesRes = entriesRes.filter(
        entry => entry.namedNumber === dashboardDto.namedId
      )
    }

    if (dashboardDto.employeeId) {
      entriesRes = entriesRes.filter(
        entry => entry.employeeId === dashboardDto.employeeId
      )
    }

    // La ordenación se resuelve antes de paginar. Con el `slice` primero, el
    // `orderBy` del cliente se aplicaba a un arreglo que ya nadie leía.
    if (dashboardDto.orderBy && dashboardDto.orderDirection) {
      const field = dashboardDto.orderBy
      const direction = dashboardDto.orderDirection === 'asc' ? 1 : -1
      entriesRes.sort(
        (a, b) =>
          direction *
          String(a[field] ?? '').localeCompare(String(b[field] ?? ''))
      )
    } else {
      entriesRes.sort(
        (a, b) =>
          b.workerDate.localeCompare(a.workerDate) ||
          b.turn.localeCompare(a.turn) ||
          b.named.localeCompare(a.named) ||
          b.employee.localeCompare(a.employee)
      )
    }

    const startIndex = (dashboardDto.page - 1) * dashboardDto.limit
    const endIndex = startIndex + dashboardDto.limit
    const paginatedEntries = entriesRes.slice(startIndex, endIndex)

    return {
      data: paginatedEntries,
      total: entriesRes.length,
      page: dashboardDto.page,
      limit: dashboardDto.limit,
    }
  }

  /**
   * `[nombradas programadas, nombradas con al menos una asistencia]`.
   *
   * Los filtros se encadenan sobre el mismo arreglo. La versión anterior
   * reasignaba desde `nameds` en cada `if`, así que navío + turno sólo aplicaba
   * el turno, y con una nombrada seleccionada devolvía `[1, ...]` fijo aunque
   * el resto de filtros la descartara o aunque el número correspondiera a
   * varias nombradas del rango.
   */
  getTotalNames(
    nameds: IListStaff[],
    dashboardDto: DashboardDto,
    allEmployees: EmployeeDocument[],
    entries: EntryDocument[]
  ): number[] {
    const { employeeId } = dashboardDto
    let namedsFiltered = this.filterNamedsByDto(nameds, dashboardDto)

    if (employeeId) {
      const employee = allEmployees.find(e => e._id.toString() === employeeId)
      const staffId = employee?.id
      namedsFiltered = namedsFiltered.filter(named =>
        (named.listStaffDetail ?? []).some(
          detail => detail.staff_id === staffId
        )
      )
    }

    if (dashboardDto.position) {
      namedsFiltered = namedsFiltered.filter(named =>
        (named.listStaffDetail ?? []).some(
          detail => detail.staff_role_type_description === dashboardDto.position
        )
      )
    }

    const assistancesByNamed = this.getTotalAssistancesByNamed(
      entries,
      namedsFiltered
    )

    return [namedsFiltered.length, assistancesByNamed]
  }

  getTotalAssistancesByNamed(
    entries: EntryDocument[],
    nameds: IListStaff[]
  ): number {
    // Antes recorría todas las entradas por cada nombrada. Un solo pase basta
    // para saber qué nombradas tienen al menos una entrada sin ausencia.
    const namedsWithAssistance = new Set<number>()
    for (const entry of entries) {
      if (!entry.isAbsence) {
        namedsWithAssistance.add(entry.namedId)
      }
    }
    let total = 0
    for (const named of nameds) {
      if (namedsWithAssistance.has(named.staff_transmission_id)) {
        total++
      }
    }
    return total
  }

  getTotalAssistances(
    entries: EntryDocument[],
    dashboardDto: DashboardDto,
    nameds: IListStaff[],
    employees: EmployeeDocument[],
    startPointId: string,
    endPointId: string
  ): number[] {
    const { employeeId } = dashboardDto
    const totalEntriesStart = entries.filter(
      entry => entry.pointId.toString() === startPointId.toString()
    )

    const namedsFiltered = this.filterNamedsByDto(nameds, dashboardDto)
    if (namedsFiltered.length === 0) {
      return [0, 0, 0]
    }

    let assitances = 0
    let employeeApiRegisteredNumber = 0
    let noAssistances = 0

    const employeeRegisteredIds = this.indexEmployeeStaffIds(employees)
    const employeeByStaffId = this.indexEmployeesByStaffId(employees)
    const employeeById = this.indexEmployeesByObjectId(employees)
    const startEntriesByEmployeeAndNamed =
      this.indexEntriesByEmployeeAndNamed(totalEntriesStart)
    const filterStaffId = employeeId
      ? employeeById.get(employeeId)?.id
      : undefined

    namedsFiltered.forEach(named => {
      const employeeApiRegistered = this.filterStaffDetails(
        named,
        dashboardDto,
        employeeRegisteredIds,
        employeeId ? (filterStaffId ?? -1) : undefined
      )

      employeeApiRegistered.forEach(detail => {
        const currentEmployee = employeeByStaffId.get(detail.staff_id)
        const currentEmployeeEntries = currentEmployee
          ? (startEntriesByEmployeeAndNamed.get(
              `${currentEmployee._id.toString()}|${named.staff_transmission_id}`
            ) ?? [])
          : []
        for (const entry of currentEmployeeEntries) {
          if (entry.isAbsence) {
            noAssistances++
          } else {
            assitances++
          }
        }
      })
      employeeApiRegisteredNumber += employeeApiRegistered.length
    })
    return [assitances, employeeApiRegisteredNumber, noAssistances]
  }

  getStartTime(turn: string) {
    const turnArray = turn.split('-')
    const initialHour = turnArray[0].trim()
    return initialHour
  }

  /**
   * Reparto de marcaciones: `[a tiempo, tolerancias, tardanzas, faltas,
   * jornadas por completar, remates por completar]`.
   *
   * La salida en vacío devolvía `[0, 0]`, dos posiciones para seis series.
   */
  getChart2Data(
    entries: EntryDocument[],
    dashboardDto: DashboardDto,
    nameds: IListStaff[],
    employees: EmployeeDocument[],
    startPointId: string,
    endPointId: string,
    points: PointDocument[]
  ): number[] {
    const { employeeId } = dashboardDto

    let assitances = 0
    let tolerances = 0
    let failures = 0
    let timeOuts = 0
    let incompletedEntries = 0
    let incompletedRemates = 0

    const namedsFiltered = this.filterNamedsByDto(nameds, dashboardDto)
    if (namedsFiltered.length === 0) {
      return [0, 0, 0, 0, 0, 0]
    }

    const employeeRegisteredIds = this.indexEmployeeStaffIds(employees)
    const employeeByStaffId = this.indexEmployeesByStaffId(employees)
    const employeeById = this.indexEmployeesByObjectId(employees)
    const filterStaffId = employeeId
      ? employeeById.get(employeeId)?.id
      : undefined
    const startEntriesByEmployeeAndNamed = this.indexEntriesByEmployeeAndNamed(
      entries.filter(
        entry => entry.pointId.toString() === startPointId.toString()
      )
    )
    const endEntryByEmployeeAndNamed = this.indexFirstEntryByEmployeeAndNamed(
      entries,
      endPointId
    )
    // Dentro del bucle el punto siempre es el inicial, porque las entradas ya
    // vienen filtradas por `startPointId`.
    const startPoint: any = points.find(
      p => p._id.toString() === startPointId.toString()
    )

    namedsFiltered.forEach(named => {
      const employeeApiRegistered = this.filterStaffDetails(
        named,
        dashboardDto,
        employeeRegisteredIds,
        employeeId ? (filterStaffId ?? -1) : undefined
      )

      employeeApiRegistered.forEach(detail => {
        const currentEmployee = employeeByStaffId.get(detail.staff_id)
        const employeeAndNamedKey = currentEmployee
          ? `${currentEmployee._id.toString()}|${named.staff_transmission_id}`
          : null

        const entriesOnlyStartPoint = employeeAndNamedKey
          ? (startEntriesByEmployeeAndNamed.get(employeeAndNamedKey) ?? [])
          : []

        // `issetEndPoint` no depende de la entrada concreta, así que se resuelve
        // una vez por empleado y nombrada en lugar de una vez por marcación.
        const issetEndPoint = employeeAndNamedKey
          ? endEntryByEmployeeAndNamed.get(employeeAndNamedKey)
          : undefined
        const isRemate = issetEndPoint && issetEndPoint.isRemate

        entriesOnlyStartPoint.forEach((entry, index) => {
          const point: any = startPoint
          const nextEntry = entriesOnlyStartPoint[index + 1]

          if (isRemate && (!nextEntry || !nextEntry.isRemate)) {
            incompletedRemates += 1
          }

          if (!issetEndPoint && !entry.isAbsence) {
            incompletedEntries += 1
          }

          if (!point) {
            return
          }
          const turn = named.shift_description
          const startTime = this.getStartTime(turn)
          // Inicio del turno en hora de Lima; con `new Date('yyyy-mm-dd hh:mm')`
          // salia en la zona del proceso y todas las marcaciones eran tardanzas.
          const entryDate = limaDateTime(
            entry.workerDate,
            this.padTime(startTime)
          ).getTime()
          if (!entry?.date) {
            return
          }

          if (entry.isAbsence) {
            failures += 1
            return
          }

          if (new Date(entry?.date).getTime() <= entryDate) {
            assitances += 1
          } else if (
            (new Date(entry?.date).getTime() - entryDate) / (1000 * 60) <=
            (point?.nextTolerance || 0)
          ) {
            tolerances += 1
          } else {
            timeOuts += 1
          }
        })
      })
    })
    return [
      assitances,
      tolerances,
      timeOuts,
      failures,
      incompletedEntries,
      incompletedRemates,
    ]
  }

  /**
   * Asistencias acumuladas por cargo. La salida en vacío devolvía `[0, 0]`, dos
   * números en una lista de objetos `{ position, assistances }`: el gráfico
   * quedaba con etiquetas `undefined`.
   */
  getChart3Data(
    entries: EntryDocument[],
    dashboardDto: DashboardDto,
    nameds: IListStaff[],
    employees: EmployeeDocument[],
    startPointId: string,
    endPointId: string
  ): any[] {
    const { employeeId } = dashboardDto

    const namedsFiltered = this.filterNamedsByDto(nameds, dashboardDto)
    if (namedsFiltered.length === 0) {
      return []
    }

    const response: any[] = []
    // Índice paralelo a `response` para no recorrerlo con `find` en cada vuelta;
    // el arreglo se sigue construyendo en el mismo orden de inserción.
    const responseByPosition = new Map<string, any>()

    const employeeRegisteredIds = this.indexEmployeeStaffIds(employees)
    const employeeByStaffId = this.indexEmployeesByStaffId(employees)
    const employeeById = this.indexEmployeesByObjectId(employees)
    const filterStaffId = employeeId
      ? employeeById.get(employeeId)?.id
      : undefined
    const startEntriesByEmployeeAndNamed = this.indexEntriesByEmployeeAndNamed(
      entries.filter(
        entry => entry.pointId.toString() === startPointId.toString()
      )
    )

    namedsFiltered.forEach(named => {
      const employeeApiRegistered = this.filterStaffDetails(
        named,
        dashboardDto,
        employeeRegisteredIds,
        employeeId ? (filterStaffId ?? -1) : undefined
      )

      employeeApiRegistered.forEach(detail => {
        const currentEmployee = employeeByStaffId.get(detail.staff_id)
        const entriesOnlyStartPoint = currentEmployee
          ? (startEntriesByEmployeeAndNamed.get(
              `${currentEmployee._id.toString()}|${named.staff_transmission_id}`
            ) ?? [])
          : []

        let assistancesCount = 0
        for (const entry of entriesOnlyStartPoint) {
          if (!entry.isAbsence) {
            assistancesCount++
          }
        }

        if (!detail.staff_role_type_description || assistancesCount === 0) {
          return
        }

        const existing = responseByPosition.get(
          detail.staff_role_type_description
        )
        if (existing) {
          existing.assistances += assistancesCount
        } else {
          const row = {
            position: detail.staff_role_type_description,
            assistances: assistancesCount,
          }
          response.push(row)
          responseByPosition.set(detail.staff_role_type_description, row)
        }
      })
    })

    // El gráfico se titula "Top posiciones": sin orden explícito mostraba el
    // orden en que aparecieron las nombradas del rango.
    response.sort(
      (a, b) =>
        b.assistances - a.assistances || a.position.localeCompare(b.position)
    )

    return response
  }

  /** Asistencias agrupadas por turno. */
  getChart5Data(
    entries: EntryDocument[],
    dashboardDto: DashboardDto,
    nameds: IListStaff[],
    employees: EmployeeDocument[],
    startPointId: string,
    endPointId: string
  ) {
    const { employeeId } = dashboardDto

    const filteredNameds = this.filterNamedsByDto(nameds, dashboardDto)
    if (filteredNameds.length === 0) {
      return { labels: [], values: [] }
    }

    const turnCounts = new Map<string, number>()

    const employeeRegisteredIds = this.indexEmployeeStaffIds(employees)
    const employeeByStaffId = this.indexEmployeesByStaffId(employees)
    const employeeById = this.indexEmployeesByObjectId(employees)
    const filterStaffId = employeeId
      ? employeeById.get(employeeId)?.id
      : undefined
    const startEntriesByEmployeeAndNamed = this.indexEntriesByEmployeeAndNamed(
      entries.filter(
        entry => entry.pointId.toString() === startPointId.toString()
      )
    )

    filteredNameds.forEach(named => {
      const employeeApiRegistered = this.filterStaffDetails(
        named,
        dashboardDto,
        employeeRegisteredIds,
        employeeId ? (filterStaffId ?? -1) : undefined
      )

      let turnAssistances = 0
      employeeApiRegistered.forEach(detail => {
        const currentEmployee = employeeByStaffId.get(detail.staff_id)
        if (!currentEmployee) return

        const currentEmployeeEntries =
          startEntriesByEmployeeAndNamed.get(
            `${currentEmployee._id.toString()}|${named.staff_transmission_id}`
          ) ?? []

        for (const entry of currentEmployeeEntries) {
          if (!entry.isAbsence) {
            turnAssistances++
          }
        }
      })

      const turnKey = named.shift_description || 'Sin turno'
      turnCounts.set(turnKey, (turnCounts.get(turnKey) || 0) + turnAssistances)
    })

    // Orden cronológico del turno, no el de aparición de las nombradas: así la
    // misma consulta dibuja siempre las barras en el mismo sitio.
    const labels = Array.from(turnCounts.keys()).sort((a, b) =>
      a.localeCompare(b)
    )
    const values = labels.map(label => turnCounts.get(label) as number)

    return { labels, values }
  }

  /**
   * Serie de asistencias por día, semana, mes y año.
   *
   * La salida en vacío devolvía `{ daily: [], monthly: [], yearly: [] }`: sin
   * `weekly`, y con arreglos donde el gráfico espera `{ labels, data }`. Al
   * filtrar por un turno sin nombradas en el rango, Chart.js recibía
   * `labels: undefined`.
   */
  getChart1Data(
    entries: EntryDocument[],
    dashboardDto: DashboardDto,
    nameds: IListStaff[],
    employees: EmployeeDocument[],
    startPointId: string,
    endPointId: string
  ) {
    const { employeeId } = dashboardDto

    const emptySeries = () => ({ labels: [] as string[], data: [] as number[] })
    const emptyResponse = () => ({
      daily: emptySeries(),
      weekly: emptySeries(),
      monthly: emptySeries(),
      yearly: emptySeries(),
    })

    const namedsFiltered = this.filterNamedsByDto(nameds, dashboardDto)
    if (namedsFiltered.length === 0) {
      return emptyResponse()
    }

    const totalEntriesStart = entries.filter(
      entry =>
        entry.pointId.toString() === startPointId.toString() && !entry.isAbsence
    )

    const filteredEntries: EntryDocument[] = []

    const employeeRegisteredIds = this.indexEmployeeStaffIds(employees)
    const employeeByStaffId = this.indexEmployeesByStaffId(employees)
    const employeeById = this.indexEmployeesByObjectId(employees)
    const filterStaffId = employeeId
      ? employeeById.get(employeeId)?.id
      : undefined
    const startEntriesByEmployeeAndNamed =
      this.indexEntriesByEmployeeAndNamed(totalEntriesStart)

    namedsFiltered.forEach(named => {
      const employeeApiRegistered = this.filterStaffDetails(
        named,
        dashboardDto,
        employeeRegisteredIds,
        employeeId ? (filterStaffId ?? -1) : undefined
      )

      employeeApiRegistered.forEach(detail => {
        const currentEmployee = employeeByStaffId.get(detail.staff_id)
        if (!currentEmployee) return
        const currentEmployeeEntries =
          startEntriesByEmployeeAndNamed.get(
            `${currentEmployee._id.toString()}|${named.staff_transmission_id}`
          ) ?? []
        filteredEntries.push(...currentEmployeeEntries)
      })
    })

    const dayCounts = new Map<string, number>()
    const weekCounts = new Map<string, number>()
    const monthCounts = new Map<string, number>()
    const yearCounts = new Map<string, number>()

    const getISOWeekKey = (date: Date) => {
      const d = new Date(
        Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
      )
      const day = d.getUTCDay() || 7
      d.setUTCDate(d.getUTCDate() + 4 - day)
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
      const weekNo = Math.ceil(
        ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
      )
      const weekKey = `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
      return weekKey
    }

    filteredEntries.forEach(entry => {
      const createdAt = entry.date ? new Date(entry.date) : null
      if (!createdAt || isNaN(createdAt.getTime())) return
      const dayKey = `${createdAt.getFullYear()}-${this.getZeroMonth(createdAt.getMonth() + 1)}-${this.getZeroMonth(createdAt.getDate())}`
      const weekKey = getISOWeekKey(createdAt)
      const monthKey = `${createdAt.getFullYear()}-${this.getZeroMonth(createdAt.getMonth() + 1)}`
      const yearKey = `${createdAt.getFullYear()}`

      dayCounts.set(dayKey, (dayCounts.get(dayKey) || 0) + 1)
      weekCounts.set(weekKey, (weekCounts.get(weekKey) || 0) + 1)
      monthCounts.set(monthKey, (monthCounts.get(monthKey) || 0) + 1)
      yearCounts.set(yearKey, (yearCounts.get(yearKey) || 0) + 1)
    })

    const toSeries = (map: Map<string, number>) => {
      const entries = Array.from(map.entries()).sort((a, b) =>
        a[0].localeCompare(b[0])
      )
      return {
        labels: entries.map(([label]) => label),
        data: entries.map(([, count]) => count),
      }
    }

    return {
      daily: toSeries(dayCounts),
      weekly: toSeries(weekCounts),
      monthly: toSeries(monthCounts),
      yearly: toSeries(yearCounts),
    }
  }

  /**
   * Catálogos de los desplegables del dashboard.
   *
   * Antes pedía las nombradas desde el `01/08/2025` fijo hasta hoy, un rango que
   * crecía sin límite y se descargaba entero en cada carga del panel sólo para
   * extraer cuatro listas de textos.
   *
   * Ahora se resuelven, por orden: desde la copia local, que acumula todo el
   * histórico ya sincronizado y responde con un `distinct`; y sólo mientras esa
   * copia esté vacía, desde el servicio externo sobre una ventana amplia (por
   * defecto 400 días, más que el rango fijo anterior, para no perder ninguna
   * nave ni nombrada de las que ya se listaban). El resultado se cachea.
   */
  async getDashboardFilters() {
    return this.dashboardFiltersCache.wrap('filters', async () => {
      const employees = await this.employeeService.findAllLean()

      const catalogs = await this.namedService.getCatalogs()
      if (catalogs) {
        return {
          employees,
          nameds: catalogs.nameds,
          positions: catalogs.positions,
          ships: catalogs.ships,
        }
      }

      const windowDays = Number(
        this.configService.get('DASHBOARD_FILTERS_WINDOW_DAYS', 400)
      )
      const now = new Date()
      const from = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - windowDays
      )
      const startDate = this.getTodayDateToNamed(from)
      const endDate = this.getTodayDateToNamed(now)
      const namedsApi = await this.namedService.getNameds({
        sInitialDate: startDate,
        sFinalDate: endDate,
      })
      const ships: string[] = []
      const nameds: string[] = []
      const positions: string[] = []
      // Los `includes` sobre los arreglos de salida eran cuadráticos; los
      // conjuntos mantienen el mismo orden de inserción con coste constante.
      const seenShips = new Set<string>()
      const seenNameds = new Set<string>()
      const seenPositions = new Set<string>()
      const listStaff: IListStaff[] = namedsApi.listStaff ?? []
      listStaff.forEach((named: IListStaff) => {
        if (
          named.vessel_description &&
          !seenShips.has(named.vessel_description)
        ) {
          seenShips.add(named.vessel_description)
          ships.push(named.vessel_description)
        }
        if (
          named.staff_vessel_number &&
          !seenNameds.has(named.staff_vessel_number)
        ) {
          seenNameds.add(named.staff_vessel_number)
          nameds.push(named.staff_vessel_number)
        }
        named.listStaffDetail.forEach(detail => {
          if (
            detail.staff_role_type_description &&
            !seenPositions.has(detail.staff_role_type_description)
          ) {
            seenPositions.add(detail.staff_role_type_description)
            positions.push(detail.staff_role_type_description)
          }
        })
      })
      return { employees, nameds, positions, ships }
    })
  }

  async cancelAbsence(cancelAbsenceDto: CancelAbsenceDto) {
    const { employeeId, workerDate, namedId, pointId } = cancelAbsenceDto
    const entry = await this.entryModel.findOne({
      employeeId: new Types.ObjectId(employeeId),
      workerDate,
      namedId,
      pointId: new Types.ObjectId(pointId),
      isAbsence: true,
    })
    await this.entryModel.deleteOne({ _id: entry?._id })
    return { message: 'Asistencia cancelada correctamente' }
  }

  /**
   * Todo lo que pinta el panel en una sola llamada: tarjetas, los cuatro
   * graficos y la primera pagina de las dos tablas.
   *
   * Antes el panel encadenaba `/dashboard` -> `/dashboard/assistances` ->
   * `/dashboard/nameds`, y cada extremo volvia a pedir las nombradas al
   * servicio externo, todos los empleados y todas las entradas del rango. Los
   * dos extremos paginados se mantienen para cambiar de pagina sin recalcular
   * los graficos.
   */
  async dashboard(dashboardDto: DashboardDto) {
    const { startDate, endDate } = dashboardDto

    const [context, talks, records] = await Promise.all([
      this.loadDashboardContext(dashboardDto),
      this.talkService.getTalkByDate(startDate, endDate, '0', '1'),
      this.namedRecordService.findByDateRange(startDate, endDate),
    ])

    const { nameds, entries, employees, points, startPointId, endPointId } =
      context

    // Las capacitaciones se registran ahora en la propia nombrada. Contar solo
    // la coleccion `talks` dejaria el indicador congelado: ahi ya solo entra lo
    // que crea la app movil y lo que quedo del modulo anterior.
    const totalTalks =
      talks.total + records.filter(record => record.talkType).length

    const namedsFiltered = this.filterNamedsByDto(nameds, dashboardDto)
    const totalAssistancesResponse = this.getTotalAssistances(
      entries,
      dashboardDto,
      nameds,
      employees,
      startPointId,
      endPointId
    )
    const noAssistances = totalAssistancesResponse[2]
    const totalNamedsAndAssistances = this.getTotalNames(
      nameds,
      dashboardDto,
      employees,
      entries
    )

    // `totalEmployees` contaba los empleados con marcaciones en el rango sin
    // mirar un solo filtro: la tarjeta no cambiaba al filtrar por turno, navio
    // o nombrada. Se cuentan los que tienen marcacion dentro de lo filtrado.
    const namedIdsFiltered = new Set(
      namedsFiltered.map(named => named.staff_transmission_id)
    )
    const employeesWithEntries = new Set<string>()
    for (const entry of entries) {
      if (namedIdsFiltered.has(entry.namedId)) {
        employeesWithEntries.add(entry.employeeId.toString())
      }
    }

    return {
      totalNameds: totalNamedsAndAssistances[0],
      totalAssistancesByNamed: totalNamedsAndAssistances[1],
      totalEmployees: employeesWithEntries.size,
      totalAssistances: totalAssistancesResponse[0],
      totalTalks,
      totalPersonNameds: this.getPersonNameds(namedsFiltered),
      totalNoAssistances: noAssistances,
      chart1Data: this.getChart1Data(
        entries,
        dashboardDto,
        nameds,
        employees,
        startPointId,
        endPointId
      ),
      chart2Data: this.getChart2Data(
        entries,
        dashboardDto,
        nameds,
        employees,
        startPointId,
        endPointId,
        points
      ),
      chart3Data: this.getChart3Data(
        entries,
        dashboardDto,
        nameds,
        employees,
        startPointId,
        endPointId
      ),
      chart5Data: this.getChart5Data(
        entries,
        dashboardDto,
        nameds,
        employees,
        startPointId,
        endPointId
      ),
      // Primera pagina de cada tabla, para que el panel no encadene dos
      // peticiones mas por cada busqueda.
      assistancesPage: this.formatAsistances(
        entries,
        nameds,
        employees,
        { ...dashboardDto, page: 1 },
        endPointId,
        points.length
      ),
      namedsPage: this.getChart4Data(
        entries,
        { ...dashboardDto, page: 1 },
        nameds,
        employees,
        startPointId,
        endPointId
      ),
    }
  }

  async getAssistancesDashboard(dashboardDto: DashboardDto) {
    const { nameds, entries, employees, points, endPointId } =
      await this.loadDashboardContext(dashboardDto)
    return this.formatAsistances(
      entries,
      nameds,
      employees,
      dashboardDto,
      endPointId,
      points.length
    )
  }

  /**
   * Detalle de nombradas paginado.
   *
   * Corrige dos defectos: la nombrada se filtraba por `Number(namedId)` contra
   * `staff_vessel_id`, cuando el panel envia el `staff_vessel_number` (un texto
   * como "0875-1", que da `NaN`), de modo que el filtro nunca coincidia; y la
   * pagina se cortaba antes de ordenar, asi que devolvia un trozo del arreglo
   * sin ordenar y luego ordenaba lo que ya nadie leia. Las salidas en vacio
   * devolvian un arreglo pelado en lugar del sobre paginado, y el panel
   * reventaba al leer `res.data`.
   */
  getChart4Data(
    entries: EntryDocument[],
    dashboardDto: DashboardDto,
    nameds: IListStaff[],
    employees: EmployeeDocument[],
    startPointId: string,
    endPointId: string
  ) {
    const page = dashboardDto.page
    const limit = dashboardDto.limit
    const empty = { data: [] as any[], total: 0, page, limit }

    const namedsFiltered = this.filterNamedsByDto(nameds, dashboardDto)
    if (namedsFiltered.length === 0) {
      return empty
    }

    // Entradas en el punto inicial. La condicion `entries.find(e => e.workerDate
    // === entry.workerDate)` del codigo anterior siempre se cumplia, porque la
    // propia entrada satisface la busqueda; se elimina por ser un recorrido
    // cuadratico sin efecto sobre el resultado.
    const totalEntriesStart = entries.filter(
      entry => entry.pointId.toString() === startPointId.toString()
    )

    const assistantsByNamed = new Map<number, Set<string>>()
    totalEntriesStart.forEach(entry => {
      if (entry.isAbsence) {
        return
      }
      const key = entry.namedId
      const employeeKey = entry.employeeId.toString()
      if (!assistantsByNamed.has(key)) {
        assistantsByNamed.set(key, new Set<string>())
      }
      assistantsByNamed.get(key)!.add(employeeKey)
    })

    // El personal de la nombrada se cuenta con los mismos filtros de cargo y
    // empleado que el resto del panel; antes `staffCount` mostraba la plantilla
    // entera aunque se estuviera filtrando por un cargo concreto.
    const employeeRegisteredIds = this.indexEmployeeStaffIds(employees)
    const employeeById = this.indexEmployeesByObjectId(employees)
    const filterStaffId = dashboardDto.employeeId
      ? employeeById.get(dashboardDto.employeeId)?.id
      : undefined
    const needsStaffFilter =
      !!dashboardDto.position || !!dashboardDto.employeeId

    let rows = namedsFiltered.map(named => {
      const staffCount = needsStaffFilter
        ? this.filterStaffDetails(
            named,
            dashboardDto,
            employeeRegisteredIds,
            dashboardDto.employeeId ? (filterStaffId ?? -1) : undefined
          ).length
        : (named.listStaffDetail ?? []).length
      return {
        number: `${named.staff_transmission_id} - ${named.staff_vessel_number}`,
        ship: named.vessel_description,
        location: named.location_id,
        date: named.worker_date,
        staffCount,
        turn: named.shift_description,
        assistantsCount:
          assistantsByNamed.get(named.staff_transmission_id)?.size || 0,
      }
    })

    if (needsStaffFilter) {
      // Una nombrada sin personal que cumpla el filtro no pertenece al resultado.
      rows = rows.filter(row => row.staffCount > 0)
    }

    // `worker_date` viene como dd/mm/aaaa: comparar el texto tal cual ordena
    // por dia del mes. Se normaliza a aaaa-mm-dd solo para ordenar.
    const sortKey = (date: string) =>
      String(date ?? '')
        .split('/')
        .reverse()
        .join('-')
    rows.sort(
      (a, b) =>
        sortKey(b.date).localeCompare(sortKey(a.date)) ||
        String(b.turn ?? '').localeCompare(String(a.turn ?? '')) ||
        a.number.localeCompare(b.number)
    )

    const startIndex = (page - 1) * limit
    const endIndex = startIndex + limit

    return {
      data: rows.slice(startIndex, endIndex),
      total: rows.length,
      page,
      limit,
    }
  }

  async getNamedsDashboard(dashboardDto: DashboardDto) {
    const { nameds, entries, employees, startPointId, endPointId } =
      await this.loadDashboardContext(dashboardDto)
    return this.getChart4Data(
      entries,
      dashboardDto,
      nameds,
      employees,
      startPointId,
      endPointId
    )
  }
}

/** Minusculas y sin tildes, para buscar "pena" y encontrar "PEÑA". */
function normalizar(value?: string): string {
  return (value ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
}

function uniqueSorted(values: (string | undefined | null)[]): string[] {
  return [...new Set(values.filter((v): v is string => !!v && !!v.trim()))].sort((a, b) =>
    a.localeCompare(b)
  )
}
