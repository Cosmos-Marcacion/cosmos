import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { IEntry, IEntryEmployeeAndNamedResponse, IEntryResponseData, IEntrySearch, IEntrySearchResponse } from '../interfaces/entries.interface';
import { environment } from '../../../../environments/environment';
import { IEmployeeResponse } from '../../../interfaces/employee.interface';

@Injectable({
  providedIn: 'root',
})
export class EntriesService {
  private apiUrl = environment.api;
  private http = inject(HttpClient);

  getEntries(filters: IEntrySearch): Observable<IEntrySearchResponse> {
    return this.http.post<IEntrySearchResponse>(`${this.apiUrl}/entry/search`, filters);
  }

  getEntry(id: string): Observable<IEntryResponseData> {
    return this.http.get<IEntryResponseData>(`${this.apiUrl}/entry/${id}`);
  }

  createEntry(entry: Partial<IEntry>): Observable<IEntryResponseData> {
    return this.http.post<IEntryResponseData>(`${this.apiUrl}/entry/manual`, entry);
  }

  updateEntry(id: string, entry: Partial<IEntry>): Observable<IEntry> {
    return this.http.patch<IEntry>(`${this.apiUrl}/entry/${id}`, entry);
  }

  deleteEntry(id: string): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/entry/${id}`);
  }

  sendReport(filters?: any): Observable<any> {
    return this.http.post(`${this.apiUrl}/entry/report`, filters);
  }

  getAllEmployees(): Observable<IEmployeeResponse[]> {
    return this.http.get<IEmployeeResponse[]>(`${this.apiUrl}/employee`);
  }

  getEntriesEmployee(employeeId: string, staffTransmissionId: string, date: string): Observable<IEntryEmployeeAndNamedResponse> {
    return this.http.get<IEntryEmployeeAndNamedResponse>(`${this.apiUrl}/entry/employee-and-named/${employeeId}/${staffTransmissionId}/${date}`);
  }
}
