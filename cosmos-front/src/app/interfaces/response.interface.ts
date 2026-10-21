import { INamed } from "./named.interface";

export interface IResponse<T> {
    data: T;
    total: number;
    page: number;
    limit: number;
    nameds?: INamed[];
}