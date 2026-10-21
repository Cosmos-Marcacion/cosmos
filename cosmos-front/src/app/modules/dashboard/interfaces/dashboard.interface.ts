import { IEmployeeResponse } from "../../../interfaces/employee.interface";

export interface IDashboardResponse {
    totalNameds: number;
    totalEmployees: number;
    totalAssistances: number;
    totalTalks: number;
    totalPersonNameds: number;
    totalNoAssistances: number;
    totalAssistancesByNamed: number;
    chart1Data: IChart1DataResponse
    chart2Data: number[]
    chart3Data: IChart3Data[]
    chart5Data: IChart5Data
    /**
     * Primera página de cada tabla. Viene con la misma respuesta para que una
     * búsqueda del panel sea una sola petición: antes se encadenaban
     * `/dashboard` -> `/dashboard/assistances` -> `/dashboard/nameds` y las tres
     * recargaban las nombradas, los empleados y las marcaciones del rango.
     */
    assistancesPage: IAssistancesResponse
    namedsPage: INamedsResponse
}

export interface IAssistancesResponse {
    total: number;
    limit: number;
    page: number;
    data: IAssistance[];
}

export interface INamedsResponse {
    total: number;
    limit: number;
    page: number;
    data: INamedRow[];
}

export interface ILabelData {
    labels: string[]
    data: number[]
}

export interface IChart1DataResponse {
    daily: ILabelData
    weekly: ILabelData
    monthly: ILabelData
    yearly: ILabelData
}

export interface IChart3Data {
    position: string
    assistances: number
}

export interface IAssistance {
    named: string;
    namedNumber: string;
    location: string;
    muelle: string;
    ship: string;
    shipName: string;
    position: string;
    employee: string;
    employeeId: string;
    markings: string;
    markingsText?: string;
    turn: string;
    workerDate: string;
    isAbsence: boolean;
}

export interface IDashboardFilters {
    employeeId: string;
    ship: string;
    position: string;
    turn: string;
    /** `staff_vessel_number` de la nombrada, tal como lo publica el backend. */
    namedId: string;
    startDate: string;
    endDate: string;
    limit?: number;
    page?: number;
}

export interface IDashboardFiltersKeywords {
    employee: string;
    ship: string;
    position: string;
    namedId: string;
}

export interface IFiltersDashboardData {
    employees: IEmployeeResponse[];
    ships: string[];
    positions: string[];
    nameds: string[];
}

export interface INamedRow {
    assistantsCount: number
    date: string
    location: string
    number: string
    ship: string
    staffCount: number
    turn: string
}

export interface IChart5Data {
    labels: string[]
    values: number[]
}
