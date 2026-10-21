import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { ISyncEmployeesResponse, IEmployeeWithStatus, ISyncRun } from '../interfaces/sync-employees.interface';
import { environment } from '../../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class SyncEmployeesService {
  private http = inject(HttpClient);
  private apiUrl = environment.api;

  /**
   * Sincroniza los empleados desde el sistema externo
   * @returns Observable con el resultado de la sincronización
   */
  syncEmployees(): Observable<ISyncEmployeesResponse> {
    return this.http.post<ISyncEmployeesResponse>(`${this.apiUrl}/employee/sync-from-named`, {});
  }

  /** Ultimas ejecuciones de la sincronizacion, la mas reciente primero. */
  getSyncRuns(limit = 10): Observable<ISyncRun[]> {
    return this.http.get<ISyncRun[]>(`${this.apiUrl}/employee/sync-runs?limit=${limit}`);
  }

  /**
   * Obtiene la lista de empleados con su estado de registro facial
   * @returns Observable con la lista de empleados y su estado
   */
  getEmployeesWithStatus(): Observable<IEmployeeWithStatus[]> {
    return this.http.get<IEmployeeWithStatus[]>(`${this.apiUrl}/employee/list-with-status`);
  }
}
