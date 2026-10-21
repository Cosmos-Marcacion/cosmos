export interface ISyncEmployeesResponse {
    totalProcessed: number;
    newEmployees: number;
    existingEmployees: number;
    errors: string[]
}

export interface IEmployeeWithStatus {
    firstName: string;
    lastName: string;
    document: string;
    status: string;
}


/** Una ejecucion registrada de la sincronizacion (CKI11). */
export interface ISyncRun {
    _id: string;
    startedAt: string;
    finishedAt?: string;
    status: 'running' | 'success' | 'partial' | 'failed';
    totalProcessed: number;
    newEmployees: number;
    existingEmployees: number;
    errors: string[];
    errorCount: number;
    failureMessage: string;
    triggeredBy: string;
}
