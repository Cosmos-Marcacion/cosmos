import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../../../environments/environment';
import { Observable } from 'rxjs';
import { IEmployeeResponse } from '../interfaces/talk.interface';

@Injectable({
  providedIn: 'root',
})
export class EmployeesService {
  private baseUrl = environment.api;
  private http = inject(HttpClient);

  getEmployees(): Observable<IEmployeeResponse[]> {
    return this.http.get<IEmployeeResponse[]>(`${this.baseUrl}/employee`);
  }
}
