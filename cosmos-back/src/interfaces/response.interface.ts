export interface IResponse<T> {
    data: T;
    total: number;
    page: number;
    limit: number;
}