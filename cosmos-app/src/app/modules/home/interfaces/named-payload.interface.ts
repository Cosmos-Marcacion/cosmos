import { IEmployeeResponse } from "../../employee-register/interfaces/employee.interface";
import { IPointsResponse } from "../../employee-register/interfaces/point.interface";

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
    pointId: IPointsResponse
    employeeId: string
    date: string
    createdAt: string
    updatedAt: string
}

export interface IEntryEmployeeResponse {
    employee: IEmployeeResponse
    points: IPointsResponse[]
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

export interface INamed {
    berth_description: string
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
    /** Marco el punto de salida (el de mayor orden). Lo calcula el backend. */
    isComplete?: boolean
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
    isColapsed?: boolean
    workerDate: string
}
