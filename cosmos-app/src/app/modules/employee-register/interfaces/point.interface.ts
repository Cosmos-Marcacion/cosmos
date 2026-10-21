export interface IPoint {
    id: string;
    name: string;
    description: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface IPointResponse {
    data: IPoint[];
    total: number;
    page: number;
    limit: number;
}

export interface IPointsResponse {
    _id: string;
    name: string;
    description: string;
    order?: number;
    createdAt: Date;
    updatedAt: Date;
    isChecked: boolean;
    isAbsence?: boolean;
    dateCheck?: Date;
    namedId?: string;
    named?: string;
    turn: string;
}