import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { Observable } from 'rxjs';
import { IResponse } from '../../../interfaces/response.interface';
import {
  IDirectoryResponse,
  IEmployeeResponse,
  IVismaPerson,
} from '../interfaces/employee.interface';
import { IPointsResponse } from '../interfaces/point.interface';
import { ownErrorMessage, silent } from '../../../interceptors/silent-request';
import { IEntryEmployeeResponse } from '../../home/interfaces/named-payload.interface';
import { MarkIdentification } from '../../../services/mark-identification';

interface IRemateResponse {
  status: 'success' | 'error' | 'warning'
  message: string
}

@Injectable({
  providedIn: 'root'
})
export class EmployeeRegisterService {

  private baseUrl = environment.api;
  private http = inject(HttpClient);

  getEmployee(id: string) {
    return this.http.get<IEmployeeResponse>(`${this.baseUrl}/employee/${id}`);
  }

  getEmployeeByIdBS(id: number) {
    return this.http.get<IEmployeeResponse>(`${this.baseUrl}/employee/by-id-bs/${id}`)
  }

  saveEmployee(employee: FormData): Observable<IEmployeeResponse> {
    return this.http.post<IEmployeeResponse>(`${this.baseUrl}/employee`, employee);
  }

  updateEmployee(employeeId: string, employee: FormData): Observable<IEmployeeResponse> {
    return this.http.patch<IEmployeeResponse>(`${this.baseUrl}/employee/${employeeId}`, employee);
  }

  /**
   * Buscador del registro: maestro local (Cosmos) y maestro de Visma
   * fusionados por documento en el backend.
   *
   * Sin `search` devuelve solo el maestro local, que es la lista completa con
   * la que arranca la pantalla. Visma no tiene listado y exige al menos tres
   * caracteres de filtro, así que se suma en cuanto se teclea.
   */
  getDirectory(search = '', limit = 100): Observable<IDirectoryResponse> {
    const params: Record<string, string> = { limit: String(limit) };
    if (search.trim()) {
      params['search'] = search.trim();
    }
    return this.http.get<IDirectoryResponse>(`${this.baseUrl}/employee/directory`, { params });
  }

  /**
   * Ficha completa de Visma. El buscador devuelve el nombre en una sola
   * cadena; solo aquí llegan nombres y apellidos separados y el legajo, que es
   * lo que hace falta para dar de alta a alguien que no está en Cosmos.
   */
  getVismaPerson(vismaId: string): Observable<{ source: string; data: IVismaPerson }> {
    return this.http.get<{ source: string; data: IVismaPerson }>(
      `${this.baseUrl}/visma/personal/${vismaId}`
    );
  }

  registerFace(employeeId: string, descriptor: number[]) {
    return this.http.patch(`${this.baseUrl}/employee/${employeeId}/register-face`, descriptor);
  }

  deleteFaceDescriptor(employeeId: string): Observable<any> {
    return this.registerFace(employeeId, []);
  }

  deleteFingerprint(employeeId: string): Observable<any> {
    return this.http.delete(`${this.baseUrl}/fingerprint/by-employee-id/${employeeId}`);
  }

  checkIn(descriptor: number[]) {
    return this.http.post(`${this.baseUrl}/employee/check-in`, descriptor);
  }

  getPoints(): Observable<IResponse<IPointsResponse[]>> {
    return this.http.get<IResponse<IPointsResponse[]>>(`${this.baseUrl}/point/20/1`);
  }

  /**
   * Puntos de marcacion del empleado en su nombrada de hoy. Responde 404 con
   * el motivo ("no esta nombrado para hoy"), que la pantalla de marcacion
   * muestra en su sitio.
   */
  getPointsByEmployee(employeeId: string): Observable<IPointsResponse[]> {
    return this.http.get<IPointsResponse[]>(`${this.baseUrl}/point/by-employee/${employeeId}`, {
      context: ownErrorMessage(),
    });
  }

  /**
   * El backend responde 200 con `null` cuando el documento no existe. Va en
   * silencio porque la pantalla de DNI pinta su propio estado de carga en el
   * boton de buscar.
   */
  getByDni(dni: string): Observable<IEmployeeResponse | null> {
    return this.http.get<IEmployeeResponse | null>(`${this.baseUrl}/employee/search/${dni}`, {
      context: ownErrorMessage(silent()),
    });
  }

  /**
   * Marca en un punto.
   *
   * `identification` dice con qué se identificó la persona y lo seguro que
   * estaba el reconocimiento. Se guarda con la marcación para poder revisar
   * después una marcación hecha con los datos de otro.
   */
  checkin(
    employeeId: string,
    pointId: string,
    namedId: string,
    identification?: MarkIdentification | null
  ): Observable<IResponse<any>> {
    return this.http.post<IResponse<any>>(`${this.baseUrl}/entry/checkin`, {
      employeeId,
      pointId,
      namedId,
      ...(identification?.method ? { method: identification.method } : {}),
      ...(typeof identification?.score === 'number' ? { matchScore: identification.score } : {}),
    });
  }

  saveSignature(employeeId: string, signature: File): Observable<IResponse<any>> {
    const formData = new FormData();
    formData.append('signature', signature);
    formData.append('employeeId', employeeId);
    return this.http.post<IResponse<any>>(`${this.baseUrl}/employee/signature`, formData);
  }

  deleteSignature(employeeId: string, employeeIdNumber: number): Observable<IEmployeeResponse> {
    return this.http.patch<IEmployeeResponse>(`${this.baseUrl}/employee/${employeeId}`, {
      id: employeeIdNumber,
      signature: ''
    });
  }

  getEntriesEmployee(employeeId: string, staffTransmissionId: string, date: string): Observable<IEntryEmployeeResponse> {
    return this.http.get<IEntryEmployeeResponse>(`${this.baseUrl}/entry/employee/${employeeId}/${staffTransmissionId}/${date}`);
  }

  remate(employeeId: string): Observable<IRemateResponse> {
    return this.http.get<IRemateResponse>(`${this.baseUrl}/entry/remate/${employeeId}`);
  }

  registerAbsence(pointId: string, employeeId: string, workerDate: string, namedId: string): Observable<IResponse<any>> {
    return this.http.post<IResponse<any>>(`${this.baseUrl}/entry`, {
      pointId,
      employeeId,
      workerDate,
      namedId: Number(namedId),
      isAbsence: true
    });
  }

  cancelAbsence(employeeId: string, workerDate: string, namedId: string, pointId: string): Observable<IResponse<any>> {
    return this.http.post<IResponse<any>>(`${this.baseUrl}/entry/cancel-absence`, {
      employeeId,
      workerDate,
      namedId: Number(namedId),
      pointId
    });
  }

}
