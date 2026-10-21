import {
  forwardRef,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common'
import {
  NamedService,
  IListStaff,
  IListStaffDetail,
} from '../named/named.service'
import { NamedRecordService } from '../named/named-record.service'
import { EmployeeService } from '../employee/employee.service'
import { EntryService } from '../entry/entry.service'
import { PointService } from '../point/point.service'
import { routeEnds } from '../point/point-route'
import { composeLastName } from '../../common/names/compose-last-name'
import { formatLimaTime } from '../../common/time/lima'
import {
  rejectedVesselTypeMessage,
  resolveVesselType,
  VesselTypeInfo,
} from './vessel-type'

/**
 * Recoleccion de los datos de un formato, sin decidir como se pinta.
 *
 * Existe porque a partir del motor v2 hay **dos** maneras de emitir el mismo
 * formato: rellenando la plantilla del cliente o generando el documento desde
 * un modelo. Lo que no puede haber son dos maneras de reunir los datos, o el
 * dia que se corrija algo se corregira solo en una y los dos formatos dejaran
 * de decir lo mismo.
 *
 * Aqui no hay nada especifico de Excel. Ni coordenadas, ni relleno a ancho
 * fijo, ni etiquetas de turno con el literal que espera una formula: eso es
 * cosa de cada motor. Aqui estan la nombrada, quien la firma, quien trabajo y a
 * que hora marco.
 */

/** Una persona de la lista, ya resuelta con sus marcaciones. */
export interface FormatPerson {
  cargo: string
  nombres: string
  documento: string
  /** `HH:mm`, o cadena vacia si no marco. */
  horaIngreso: string
  horaSalida: string
  /**
   * URL de la firma que esta persona registro en la app, si la registro.
   *
   * Vacia es lo normal y no es un error: significa que la casilla de firma sale
   * en blanco, para firmarla a mano como se ha hecho siempre.
   */
  signature?: string
}

/** Persona responsable, tal como viene del maestro. */
export interface FormatResponsible {
  fullName: string
  document: string
  /** Cargo, cuando la hoja lo pide (el responsable del registro lo lleva). */
  position?: string
  /** URL de su firma registrada. Ver `FormatPerson.signature`. */
  signature?: string
}

/**
 * La capacitacion del turno, que es un dato de la nombrada.
 *
 * Todos los campos pueden venir vacios: la hoja de charla sale entonces con sus
 * huecos sin marcar, igual que si se hubiera impreso para rellenar a mano.
 */
export interface FormatTalk {
  /** `INDUCCION`, `CAPACITACION`, `ENTRENAMIENTO`, `SIMULACRO`, `TOOLBOX`, `OTROS`. */
  type: string
  /** `EMBARCACION`, `TERMINAL`, `OFICINA`, `OTROS`. */
  place: string
  isAnnual: boolean
  /** `HH:mm`. */
  startTime: string
  endTime: string
  hours: number
  /**
   * Entrenador designado, si lo hay. Vacio significa que lo firma el supervisor
   * de operaciones, que es lo que la hoja imprime por formula.
   */
  trainer: FormatResponsible
  registerResponsible: FormatResponsible
}

export interface FormatData {
  staffTransmissionId: number
  /** `dd/mm/yyyy`, tal como lo pide quien descarga. */
  workerDate: string
  /** `yyyy-mm-dd`, que es como lo guarda la ficha de la nombrada. */
  workerDateIso: string
  /** La fecha de la jornada como valor, para la celda o el campo de fecha. */
  workerDateValue: Date
  /**
   * Formato que toca por el tipo de nave de Cosmos. Nunca vacio: una nombrada
   * con un tipo que no se acepta no llega aqui (ver `collect`).
   */
  formatType: string
  /** Tipo de nave tal como llega y como se resolvio. */
  vesselType: VesselTypeInfo
  /** Correlativo del permiso de trabajo, ya asignado y estable. */
  workPermitNumber: number

  /**
   * Nave, muelle y turno **tal como llegan** del servicio externo, sin poner
   * valor por defecto.
   *
   * No se normalizan a proposito. El servicio manda a veces cadena vacia y a
   * veces nada, y cada motor decide distinto: el actual escribe `NAVE` en el
   * nombre del fichero solo cuando no llega nada, y cadena vacia cuando llega
   * vacia. Normalizar aqui borraria esa diferencia y cambiaria el nombre de los
   * ficheros que ya se estan descargando.
   */
  vesselDescription: string
  pierDescription: string
  /** Turno tal cual llega, por ejemplo `07:00 - 15:00`. */
  shiftDescription: string
  /**
   * Numero de la nombrada, que es `staff_vessel_id`. De el sale el N.o de ATS.
   * No confundir con `staff_vessel_number`, que llega vacio en una de cada diez
   * nombradas, ni con `staff_transmission_id`, que es el de la transmision.
   */
  namedNumber: string

  supervisorOperaciones: FormatResponsible
  jefeCubierta: FormatResponsible
  supervisorSsoma: string
  /** Responsables de la naviera. Si no hay, valen los de Cosmos. */
  jefeCubiertaVsi: string
  ssomaVsi: string

  talkTopics: { topic: string; summary: string }[]
  /** Resto de la hoja de charla: tipo, lugar, horario y quien la firma. */
  talk: FormatTalk

  /** Lista de personal, con el jefe de cubierta al frente. */
  people: FormatPerson[]
}

@Injectable()
export class FormatDataService {
  constructor(
    private readonly namedService: NamedService,
    private readonly namedRecordService: NamedRecordService,
    private readonly employeeService: EmployeeService,
    @Inject(forwardRef(() => EntryService))
    private readonly entryService: EntryService,
    @Inject(forwardRef(() => PointService))
    private readonly pointService: PointService
  ) {}

  /** `dd/mm/yyyy` a `Date`. */
  private parseWorkerDate(workerDate: string): Date {
    const [d, m, y] = (workerDate ?? '').split('/').map(Number)
    return new Date(y, (m ?? 1) - 1, d ?? 1)
  }

  /**
   * Hora de Lima. Con `getHours()` salia la del proceso, que en el contenedor
   * es UTC: una marcacion de las 10:00 se imprimia como "15:00".
   */
  private formatTime(date: Date | string | null | undefined): string {
    return formatLimaTime(date)
  }

  /**
   * Reune todo lo que hace falta para emitir el formato de una nombrada.
   *
   * Asigna de paso el correlativo del permiso de trabajo, que es idempotente:
   * se asigna la primera vez y reemitir el formato reimprime el mismo numero.
   */
  async collect(
    staffTransmissionId: number,
    workerDate: string
  ): Promise<FormatData> {
    const nameds = await this.namedService.getNameds({
      sInitialDate: workerDate,
      sFinalDate: workerDate,
    })
    const listStaff: IListStaff[] = nameds?.listStaff ?? []
    const named = listStaff.find(
      n => n.staff_transmission_id === staffTransmissionId
    )
    if (!named) {
      throw new HttpException(
        `No se encontro la nombrada ${staffTransmissionId} en la fecha ${workerDate}`,
        HttpStatus.NOT_FOUND
      )
    }

    const workerDateIso = workerDate.split('/').reverse().join('-')
    const record = await this.namedRecordService.findOne(staffTransmissionId)

    // Antes de asignar el permiso de trabajo: un tipo rechazado no puede
    // consumir un correlativo.
    const vesselType = resolveVesselType(
      named.code_type_vessel,
      named.description_type_vessel,
      record?.formatType
    )
    if (!vesselType.accepted) {
      throw new UnprocessableEntityException(
        rejectedVesselTypeMessage(vesselType)
      )
    }

    const workPermitNumber =
      await this.namedRecordService.ensureWorkPermitNumber(
        staffTransmissionId,
        workerDateIso
      )

    // --- personal y sus marcaciones -----------------------------------------
    const details: IListStaffDetail[] = [...(named.listStaffDetail ?? [])].sort(
      (a, b) => (a.order_number ?? 0) - (b.order_number ?? 0)
    )

    const employees = await this.employeeService.getEmployeesByIds(
      details.map(d => d.staff_id)
    )
    // Las marcaciones se buscan en todas las fichas del `staff_id`, como en el
    // detalle y en la tarjeta del tablero.
    const employeeIdsByStaffId = new Map<number, string[]>()
    for (const e of employees) {
      const ids = employeeIdsByStaffId.get(e.id) ?? []
      ids.push(e._id.toString())
      employeeIdsByStaffId.set(e.id, ids)
    }

    const entries = await this.entryService.getEntriesByEmployeeIds(
      employees.map(e => e._id.toString()),
      workerDateIso,
      workerDateIso
    )

    const points = await this.pointService.findAllGlobal()
    // Entrada y salida son el de menor y el de mayor orden; los ordenes no
    // tienen por que ser correlativos ni empezar en 1.
    const { start, end } = routeEnds(points)
    const startPointId = start?._id?.toString()
    const endPointId = end?._id?.toString()

    const inByEmployee = new Map<string, Date>()
    const outByEmployee = new Map<string, Date>()
    for (const entry of entries) {
      if (entry.namedId !== staffTransmissionId || entry.isAbsence) {
        continue
      }
      const key = entry.employeeId.toString()
      const pointId =
        (entry.pointId as any)?._id?.toString() ?? entry.pointId?.toString()
      if (pointId === startPointId && !inByEmployee.has(key)) {
        inByEmployee.set(key, entry.date)
      }
      if (pointId === endPointId && !outByEmployee.has(key)) {
        outByEmployee.set(key, entry.date)
      }
    }

    // --- lista de personal ----------------------------------------------------
    // El jefe de cubierta encabeza siempre la lista: viene del maestro Visma, no
    // de la nombrada, y es quien firma el permiso de trabajo y el ATS.
    const people: FormatPerson[] = []
    if (record?.jefeCubierta?.fullName) {
      people.push({
        cargo: 'JEFE DE CUBIERTA',
        nombres: record.jefeCubierta.fullName,
        documento: record.jefeCubierta.document ?? '',
        horaIngreso: '',
        horaSalida: '',
      })
    }

    for (const detail of details) {
      const ids = employeeIdsByStaffId.get(detail.staff_id) ?? []
      const firstOf = (byEmployee: Map<string, Date>) =>
        ids
          .map(id => byEmployee.get(id))
          .filter((d): d is Date => Boolean(d))
          .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0]
      const apellidos = composeLastName(
        detail.last_name,
        detail.mother_last_name
      )
      people.push({
        cargo: detail.staff_role_type_description ?? '',
        nombres: `${apellidos} ${detail.first_name ?? ''}`
          .trim()
          .replace(/\s+/g, ' '),
        documento: detail.personal_id ?? '',
        horaIngreso: this.formatTime(firstOf(inByEmployee)),
        horaSalida: this.formatTime(firstOf(outByEmployee)),
      })
    }

    // --- firmas registradas ---------------------------------------------------
    // Una sola consulta para toda la nombrada: los tres responsables mas cada
    // persona de la lista. Quien no tenga firma guardada simplemente no sale en
    // el mapa y su casilla queda en blanco.
    const signatures = await this.employeeService.findSignaturesByDocuments([
      record?.supervisorOperaciones?.document ?? '',
      record?.jefeCubierta?.document ?? '',
      record?.supervisorSsoma?.document ?? '',
      ...people.map(person => person.documento),
    ])
    const signatureOf = (document?: string) =>
      signatures.get((document ?? '').trim())
    for (const person of people) {
      const found = signatureOf(person.documento)
      if (found) {
        person.signature = found
      }
    }

    return {
      staffTransmissionId,
      workerDate,
      workerDateIso,
      workerDateValue: this.parseWorkerDate(named.worker_date),
      formatType: vesselType.formatType,
      vesselType,
      workPermitNumber,

      vesselDescription: named.vessel_description,
      pierDescription: named.pier_description,
      shiftDescription: named.shift_description,
      namedNumber: String(named.staff_vessel_id ?? staffTransmissionId),

      supervisorOperaciones: {
        fullName: record?.supervisorOperaciones?.fullName ?? '',
        document: record?.supervisorOperaciones?.document ?? '',
        signature: signatureOf(record?.supervisorOperaciones?.document),
      },
      jefeCubierta: {
        fullName: record?.jefeCubierta?.fullName ?? '',
        document: record?.jefeCubierta?.document ?? '',
        signature: signatureOf(record?.jefeCubierta?.document),
      },
      supervisorSsoma: record?.supervisorSsoma?.fullName ?? '',
      jefeCubiertaVsi:
        record?.jefeCubiertaVsi?.fullName ??
        record?.jefeCubierta?.fullName ??
        '',
      ssomaVsi:
        record?.ssomaVsi?.fullName ?? record?.supervisorSsoma?.fullName ?? '',

      talkTopics: (record?.talkTopics ?? []).map((t: any) => ({
        topic: t?.topic ?? '',
        summary: t?.summary ?? '',
      })),

      talk: {
        type: record?.talkType ?? '',
        place: record?.talkPlace ?? '',
        isAnnual: Boolean(record?.talkIsAnnual),
        startTime: record?.talkStartTime ?? '',
        endTime: record?.talkEndTime ?? '',
        hours: record?.talkHours ?? 0,
        // Sin fallback a proposito. La hoja de charla ya trae el nombre del
        // capacitador por formula (`=GLOBAL!B9`, el supervisor de operaciones);
        // esto solo lleva quien lo sustituye cuando se designa a otro.
        trainer: {
          fullName: record?.trainer?.fullName ?? '',
          document: record?.trainer?.document ?? '',
          position: record?.trainer?.position ?? '',
        },
        registerResponsible: {
          fullName: record?.registerResponsible?.fullName ?? '',
          document: record?.registerResponsible?.document ?? '',
          position: record?.registerResponsible?.position ?? '',
        },
      },

      people,
    }
  }
}
