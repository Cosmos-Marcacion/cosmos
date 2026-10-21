export interface IUser {
    email: string;
    name: string;
    roleId: string;
}


export interface IRoleResponse {
    _id: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface IUserResponse extends IUser {
    _id: string
    access_token: string;
    role: IRoleResponse;
    image?: string;
}
