import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { IEmployeeResponse } from '../../../interfaces/employee.interface';
import { environment } from '../../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class GeneratorService {

  private http = inject(HttpClient)
  private url = environment.api

  getEmployees() {
    return this.http.get<IEmployeeResponse[]>(`${this.url}/employee`);
  }

  generateQR(employeeId: string, type: string) {
    return this.http.post<{ url: string }>(`${this.url}/generator`, { employeeId, type });
  }
}
