import { IPortResponse } from "../../ports/interfaces/port.interface"

export interface IPoint {
    name: string
    portId: string
    order: number
    dependOnId: string
    previousTolerance?: number
    nextTolerance?: number

}

export interface IPointResponse {
    _id: string
    name: string
    port: IPortResponse
    order: number
    dependOn: IPointResponse
    previousTolerance: number
    isChecked?: boolean;
    dateCheck?: Date;
    nextTolerance: number
    createdAt: string
    updatedAt: string
}   