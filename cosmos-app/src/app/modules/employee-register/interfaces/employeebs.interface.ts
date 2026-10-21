export interface IEmployeeBS {
    id: number;
    firstName: string;
    lastName: string;
    document: string;
    image: string;
    personal_id: string;
    first_name: string;
    last_name: string;
    email: string;
    phone: string;
    staff_id: number;
    address: string;
    status: string;
    faceDescriptor: number[];
    signature: string;
}

export interface IEmployeeBSResponse {
    listUsers: IEmployeeBS[];
}
