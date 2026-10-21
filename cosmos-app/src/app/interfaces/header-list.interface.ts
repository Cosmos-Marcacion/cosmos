export interface IHeaderList {
    header: string;
    value?: string;
    options?: string[];
    items?: IHeaderItem[];
}

export interface IHeaderItem {
    up: string;
    down: string;
}