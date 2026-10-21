export interface IUser {

    email: string;
    name: string;
    password: string;
    roleId: string;
}

export interface IUserResponse {
    _id: string;
    email: string;
    name: string;
    password: string;
    roleId: string;
    role: IRoleResponse;
    image?: string;
}

/** Un perfil: como se llama y que modulos abre. */
export interface IRoleResponse {
    _id: string;
    name: string;
    description?: string;
    /** Claves de modulo, las mismas que las opciones del menu. */
    permissions?: string[];
    active?: boolean;
}

/** Un modulo de la plataforma, tal como lo publica `GET /role/modules`. */
export interface IPlatformModule {
    key: string;
    label: string;
    description: string;
    routes: string[];
}