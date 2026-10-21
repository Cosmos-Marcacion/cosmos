import { IPersonRef } from '../../../interfaces/person.interface';
import { IGeneratedFormat, ITalkSession, ITalkTopic, IVesselType } from './named-board.interface';

/** Cabecera de la nombrada, tal como llega del sistema externo. */
export interface INamedHeader {
  staffTransmissionId: number;
  staffVesselId: number;
  staffVesselNumber: string;
  vesselDescription: string;
  voyageNumber: string;
  locationId: string;
  pierDescription: string;
  berthDescription: string;
  workerDate: string;
  workerDateIso: string;
  shiftDescription: string;
}

/** Punto de marcación del recorrido. */
export interface INamedPoint {
  id: string;
  name: string;
  order: number;
}

/** Una marcación concreta de un trabajador. */
export interface IStaffMark {
  id: string;
  pointId: string;
  pointName: string;
  pointOrder: number;
  date: string;
  isAbsence: boolean;
  isRemate: boolean;
  observation: string;
}

/** Trabajador nombrado, con su recorrido de marcaciones del turno. */
export interface INamedStaff {
  staffId: number;
  staffTransmissionDetailId: number;
  orderNumber: number;
  teamNumber: number;
  firstName: string;
  lastName: string;
  fullName: string;
  document: string;
  roleDescription: string;
  employeeId: string | null;
  registered: boolean;
  hasSignature: boolean;
  hasFingerprint: boolean;
  marks: IStaffMark[];
  markCount: number;
  firstMark: string | null;
  lastMark: string | null;
  completed: boolean;
  absent: boolean;
  remate: boolean;
}

/** Ficha que la plataforma guarda de la nombrada. */
export interface INamedDetailRecord extends ITalkSession {
  formatType: string;
  /**
   * Correlativo del permiso de trabajo (PTS) de la nombrada. Es `null` hasta
   * que se asigna, al emitir el formato por primera vez.
   */
  workPermitNumber: number | null;
  jefeCubierta: IPersonRef | null;
  supervisorOperaciones: IPersonRef | null;
  supervisorSsoma: IPersonRef | null;
  jefeCubiertaVsi: IPersonRef | null;
  ssomaVsi: IPersonRef | null;
  trainer: IPersonRef | null;
  registerResponsible: IPersonRef | null;
  talkTopics: ITalkTopic[];
  generatedFormats: IGeneratedFormat[];
  notes: string;
}

/** Charla registrada contra la nombrada. */
export interface INamedTalk {
  id: string;
  type: string;
  topic: string;
  summary: string;
  startTime: string;
  endTime: string;
  hours: number;
  place: string;
  area: string;
  trainer: string;
  register: string;
}

export interface INamedSummary {
  staffCount: number;
  presentCount: number;
  completedCount: number;
  pendingCount: number;
  unregisteredCount: number;
  talksCount: number;
  talkTopicsCount: number;
}

/** Respuesta completa de `GET /named/detail/:id`. */
export interface INamedDetail {
  named: INamedHeader;
  vesselType: IVesselType;
  record: INamedDetailRecord | null;
  points: INamedPoint[];
  staff: INamedStaff[];
  talks: INamedTalk[];
  summary: INamedSummary;
}
