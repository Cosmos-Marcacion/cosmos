export interface IEmployee {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    address: string;
    status: string;
}

export interface IEmployeeResponse {
    _id: string;
    id: number;
    firstName: string;
    lastName: string;
    document: string;
    email: string;
    faceDescriptor: number[];
    phone: string;
    image: string;
    address: string;
    signature: string;
    status: string;
    createdAt: Date;
    updatedAt: Date;
}