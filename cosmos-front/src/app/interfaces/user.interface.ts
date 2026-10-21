export interface IUser {
    email: string;
    name: string;
    roleId: string;
}


/** Un perfil de usuario: como se llama y que modulos abre. */
export interface IRoleResponse {
    _id: string;
    name: string;
    description?: string;
    /** Claves de modulo. Un perfil sin permisos no abre ninguna pantalla. */
    permissions?: string[];
    active?: boolean;
    createdAt?: Date;
    updatedAt?: Date;
}

/** Un modulo de la plataforma, tal como lo publica el backend. */
export interface IPlatformModule {
    key: string;
    label: string;
    description: string;
    routes: string[];
}

export interface IUserResponse extends IUser {
    _id: string
    access_token: string;
    role: IRoleResponse;
    /**
     * Los modulos que abre, resueltos por el backend al entrar.
     *
     * Vienen aparte de `role.permissions` a proposito: es lo que el token lleva
     * dentro, asi que es exactamente lo que el servidor va a admitir. Si alguien
     * cambia el perfil mientras hay sesion abierta, la pantalla y la API siguen
     * de acuerdo hasta que se vuelve a entrar.
     */
    permissions?: string[];
    image?: string;
}
