export interface IHeaderList {
    header: string;
    value?: string;
    options?: string[];
    items?: IHeaderItem[];
    size?: number;
}

export interface IHeaderItem {
    up: string;
    down: string;
}