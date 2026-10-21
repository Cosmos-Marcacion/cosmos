import { IPointResponse } from "../modules/points/interfaces/point.interface";
import { IEmployeeResponse } from "./employee.interface";


export interface INamedPayload {
    sInitialDate: string;
    sFinalDate: string;
    iStaffTransmissionId?: number;
}

export interface INamedResponse {
    codigoRespuesta: string
    descripcionResp: string
    listStaff: IListStaff[]
}

export interface IEntryResponse {
    _id: string
    pointId: IPointResponse
    employeeId: string
    date: string
}

export interface IEntryEmployeeResponse {
    employee: IEmployeeResponse
    points: IPointResponse[]
    nameds: IListStaff
}

export interface INamed {
    berth_description: string
    listStaffDetail: IListStaff[]
    location_id: string
    pier_description: string
    shift_description: string
    staff_transmission_id: number
    staff_vessel_id: number
    staff_vessel_number: string
    vessel_description: string
    voyage_number: string
    worker_date: string
}

export interface IListStaff {
    employeeInfo: IEmployeeResponse
    entriesInfo: IEntryResponse[]
    first_name: string
    last_name: string
    mother_last_name: string
    order_number: number
    personal_id: string
    record: string
    staff_id: number
    staff_role_type_description: string
    staff_role_type_id: number
    staff_transmission_detail_id: number
    staff_transmission_id: number
    staff_vessel_id: number
    team_number: number
}

export interface IShiftDescription {
    named: INamed
    detail: IListStaff[]
    isVisible?: boolean
}

export interface ITurn {
    turn: string
    entries: IShiftDescription[]
}

export interface INamedResponseFormat {
    turns: ITurn[]
    workerDate: string
}

