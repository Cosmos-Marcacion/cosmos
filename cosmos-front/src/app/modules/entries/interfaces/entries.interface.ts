import { IEmployeeResponse } from '../../../interfaces/employee.interface';
import { IListStaff, INamed } from '../../../interfaces/named.interface';
import { IPointResponse } from '../../points/interfaces/point.interface';
import { IResponse } from '../../../interfaces/response.interface';

export interface IEntry {
  _id: string;
  employeeId: string;
  pointId: string;
  date: string;
  namedId?: number;
  createdAt?: string;
  time?: string;
  /** Dia real de la marcacion si no es el de la jornada (turno de noche). */
  markDate?: string;
  observation?: string;
}

/**
 * Marcacion tal como la devuelve `GET /entry/:id`: sin poblar, con los ids en
 * `pointId` y `employeeId`. `point` y `employee` solo llegan si otro endpoint
 * la devuelve poblada.
 */
export interface IEntryResponseData {
  _id: string;
  pointId?: string;
  employeeId?: string;
  employee?: IEmployeeResponse;
  point?: IPointResponse;
  namedId?: number;
  workerDate?: string;
  observation?: string;
  date: string;
}

export interface IEntryResponseRes {
  date: string
  isAbsence?: boolean;
  isRemate: boolean;
  namedId: number;
  /** Nulo si la marcacion es una falta de un punto que ya se borro. */
  pointId: IPointResponse | null;
  updatedAt: string;
  workerDate: string;
  observation?: string;
  _id: string;
}

export interface IEntryResponseSearch {
  employee: IEmployeeResponse;
  entries: IEntryResponseRes[];
  named: INamed;
  listStaffDetail: IListStaff;
  totalPoints: number;
  /** Punto de salida (el de mayor orden); marcarlo pinta `-S`. */
  endPointId?: string;
}

export interface IFormatEntry {
  employee: string;
  document: string;
  signature: string;
  ship: string;
  position: string;
  workerDate: string;
  markings: string
  isRemate: boolean;
  turn: string
  entries: IEntryResponseRes[]
  isAbsence: boolean
}

export interface IEntryResponse {
  data: IEntry[];
  total: number;
  page: number;
  limit: number;
}

export interface IEntrySearch {
  limit: number;
  page: number;
  turn?: string;
  workerDate: string;
  /** Nombre del trabajador; la API lo filtra antes de paginar. */
  search?: string;
  ship?: string;
  position?: string;
}

/** Respuesta de `POST /entry/search`: la pagina y las opciones de la jornada entera. */
export interface IEntrySearchResponse extends IResponse<IEntryResponseSearch[]> {
  ships?: string[];
  positions?: string[];
}

export interface IEntryEmployeeAndNamedResponse {
  entries: IEntryResponseRes[]
  named: IListStaffEmployee
  /** Nulo si el trabajador ya no existe en el sistema. */
  employee?: IEmployeeResponse | null
}

export interface IEntryEmployeeResponse {
  employee: IEmployeeResponse
  points: IPointResponse[]
  nameds: IListStaff
  named: IListStaffEmployee
}


export interface IListStaffEmployee {
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
  listStaffDetail: IListStaff[]
}