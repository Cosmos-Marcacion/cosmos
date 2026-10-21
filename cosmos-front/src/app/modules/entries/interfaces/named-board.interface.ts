export type { IPersonRef } from '../../../interfaces/person.interface';
import type { IPersonRef } from '../../../interfaces/person.interface';

/**
 * Como se entrega el formato. El PDF es una conversion del mismo `.xlsx` hecha
 * en el servidor, no una segunda maquetacion, asi que ambos son identicos.
 */
export type FormatOutput = 'xlsx' | 'pdf';

export interface ITalkTopic {
  topic: string;
  summary: string;
}

/**
 * Capacitación del turno, que se registra dentro de la nombrada.
 *
 * Antes vivía en un módulo aparte (`/capacitaciones`): la charla se creaba por
 * un lado y la nombrada por otro, y quien emitía el formato tenía que acordarse
 * de haber hecho las dos cosas. Ahora es un dato más de la nombrada.
 *
 * Los identificadores son estables y sin acentos, como `formatType`. Lo que se
 * imprime en la hoja de charla lo resuelve el backend.
 */
export interface ITalkSession {
  /** `INDUCCION`, `CAPACITACION`, `ENTRENAMIENTO`, `SIMULACRO`, `TOOLBOX`, `OTROS`. */
  talkType: string;
  /** `EMBARCACION`, `TERMINAL`, `OFICINA`, `OTROS`. */
  talkPlace: string;
  /** "¿Pertenece a Programa Anual de Capacitación?" de la hoja de charla. */
  talkIsAnnual: boolean;
  /** `HH:mm`, vacío mientras no se registre. */
  talkStartTime: string;
  talkEndTime: string;
  talkHours: number;
}

export interface IGeneratedFormat {
  formatType: string;
  fileName: string;
  generatedAt: string;
  generatedBy?: string;
  staffCount: number;
  /** Paginas que ocupa la lista de personal. */
  pages: number;
  /** Se conserva por compatibilidad con formatos ya emitidos. */
  truncated?: boolean;
  /** Correlativo del permiso de trabajo impreso en ese formato. */
  workPermitNumber?: number;
  /** Si se entrego en Excel o en PDF. */
  output?: FormatOutput;
}

/**
 * Tipo de nave que trae Cosmos (`code_type_vessel`) y formato que le toca.
 * Solo ET, GR, ME, CO y BB tienen formato; el resto no puede emitir.
 */
export interface IVesselType {
  /** `ET`, `GR`, `ME`, `CO`, `BB`, `VA`... Vacío si no vino. */
  code: string;
  /** `ETANOL`, `GRANEL`, `CONTAINER`... */
  description: string;
  /** `ETHANOL`, `GRANEL`, `MERCADERIA_GENERAL`, o vacío si no se acepta. */
  formatType: string;
  accepted: boolean;
  /** `record`: nombrada copiada antes de que Cosmos enviara el tipo. */
  source: 'api' | 'record';
}

/** Fila del listado de nombradas. */
export interface INamedBoardRow {
  staffTransmissionId: number;
  /** Número de la nombrada; es de donde sale el N.º de ATS del formato. */
  staffVesselId: number;
  staffVesselNumber: string;
  vesselDescription: string;
  voyageNumber: string;
  locationId: string;
  pierDescription: string;
  workerDate: string;
  workerDateIso: string;
  shiftDescription: string;
  staffCount: number;
  assistCount: number;
  /** El que toca por el tipo de nave; vacío si el tipo no se acepta. */
  formatType: string;
  vesselType: IVesselType;
  jefeCubierta: IPersonRef | null;
  supervisorOperaciones: IPersonRef | null;
  supervisorSsoma: IPersonRef | null;
  /** Tipo de capacitación de la nombrada; vacío si aún no se ha elegido. */
  talkType: string;
  talkTopicsCount: number;
  talksCount: number;
  lastFormat: IGeneratedFormat | null;
  ready: boolean;
}

/** Ficha completa que la plataforma guarda de una nombrada. */
export interface INamedRecord extends Partial<ITalkSession> {
  staffTransmissionId: number;
  workerDateIso: string;
  formatType: string;
  workPermitNumber?: number;
  jefeCubierta?: IPersonRef;
  supervisorOperaciones?: IPersonRef;
  supervisorSsoma?: IPersonRef;
  jefeCubiertaVsi?: IPersonRef;
  ssomaVsi?: IPersonRef;
  trainer?: IPersonRef;
  registerResponsible?: IPersonRef;
  talkTopics: ITalkTopic[];
  generatedFormats: IGeneratedFormat[];
  notes?: string;
}

export interface IFormatType {
  id: string;
  label: string;
  /** Personal que lista la hoja de asistencia en una página. */
  capacity: number;
  /**
   * A partir de aquí el formato se reparte en varias páginas. No es un tope:
   * por encima de esta cifra no se pierde a nadie.
   */
  onePageCapacity: number;
  attendanceSheet: string;
}

export interface INamedBoardFilters {
  sInitialDate: string;
  sFinalDate: string;
  turn?: string;
  vessel?: string;
}
