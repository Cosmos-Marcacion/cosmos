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
    fingerprintId: string;
    /**
     * Bandera precalculada de "tiene huella".
     *
     * Es lo que devuelve el listado de `POST /named/users`, que viaja con la
     * proyeccion `id firstName lastName document signature status issetFinger`
     * para no arrastrar el descriptor facial por red celular. En la ficha
     * individual, que si trae el documento completo, se usa `fingerprintId`.
     */
    issetFinger?: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface ISignature {
    employeeId: string;
    signature: string;
}

/**
 * Persona del buscador del registro, ya fusionada por el backend.
 *
 * Sale de los dos maestros a la vez: el de Cosmos (sincronizado en la
 * plataforma, que es de donde salía esta lista hasta ahora) y el de Visma
 * TuRecibo. Se cruzan por documento, así que quien está en los dos aparece una
 * sola vez con `sources` de dos elementos.
 *
 * Los identificadores son opcionales a propósito: quien solo está en Visma no
 * tiene `staff_id` ni ficha local todavía, y es justamente a quien antes no se
 * le podía registrar la huella, la firma ni el rostro porque no salía aquí.
 */
export interface IDirectoryPerson {
    key: string;
    /** `_id` de la ficha local, si ya está dada de alta. */
    employeeId?: string;
    /** `staff_id` de Cosmos. */
    id?: number;
    /** `id` del usuario en Visma TuRecibo. */
    vismaId?: string;
    firstName: string;
    lastName: string;
    fullName: string;
    document: string;
    fileNumber?: string;
    position?: string;
    email?: string;
    status: string;
    issetFinger: boolean;
    signature: string;
    sources: ('cosmos' | 'visma')[];
}

export interface IDirectoryResponse {
    data: IDirectoryPerson[];
    total: number;
    /** Caracteres mínimos para que Visma responda. */
    minLength: number;
    /** `false` cuando Visma no respondió: la lista sale solo de Cosmos. */
    vismaAvailable: boolean;
}

/** Ficha completa de una persona del maestro de Visma. */
export interface IVismaPerson {
    id: string;
    fullName: string;
    document: string;
    position: string;
    active: boolean;
    firstName?: string;
    lastName?: string;
    fileNumber?: string;
    email?: string;
    sector?: string;
    location?: string;
}

