import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import {
  IAssistant,
  IAssistantResponse,
  ITalk,
  ITalkFilters,
  ITalkResponse,
  IEmployeeResponse,
  IAssistantEmployee,
} from '../interfaces/talk.interface';
import { environment } from '../../../../environments/environment';
import { Observable } from 'rxjs';
import { IResponse } from '../../../interfaces/response.interface';

@Injectable({
  providedIn: 'root',
})
export class TalksService {
  private readonly API_URL = environment.api;
  private http = inject(HttpClient);

  getTalks(
    filters: ITalkFilters,
    page: number,
    limit: number
  ): Observable<IResponse<ITalkResponse[]>> {
    return this.http.post<IResponse<ITalkResponse[]>>(
      `${this.API_URL}/talk/search?page=${page}&limit=${limit}`,
      filters
    );
  }

  getTalk(id: string): Observable<ITalkResponse> {
    return this.http.get<ITalkResponse>(`${this.API_URL}/talk/${id}`);
  }

  createTalk(talk: ITalk): Observable<ITalkResponse> {
    return this.http.post<ITalkResponse>(`${this.API_URL}/talk`, talk);
  }

  updateTalk(id: string, talk: ITalk): Observable<ITalkResponse> {
    return this.http.patch<ITalkResponse>(`${this.API_URL}/talk/${id}`, talk);
  }

  deleteTalk(id: string): Observable<IResponse<void>> {
    return this.http.delete<IResponse<void>>(`${this.API_URL}/talk/${id}`);
  }

  saveAllAssistants(employeeIds: string[], talkId: string): Observable<IResponse<void>> {
    return this.http.post<IResponse<void>>(`${this.API_URL}/assistant/save-by-employee-ids`, { employeeIds, talkId });
  }

  addEmployee(assistant: IAssistant): Observable<IResponse<void>> {
    return this.http.post<IResponse<void>>(
      `${this.API_URL}/assistant`,
      assistant
    );
  }

  getEmployeesByTalk(id: string): Observable<IAssistantResponse[]> {
    return this.http.get<IAssistantResponse[]>(
      `${this.API_URL}/assistant/talk/${id}`
    );
  }

  /** Borra un registro de asistencia concreto (charla + empleado). */
  deleteAssistantRecord(assistantId: string): Observable<IResponse<void>> {
    return this.http.delete<IResponse<void>>(`${this.API_URL}/assistant/${assistantId}`);
  }

  deleteByTalkId(talkId: string): Observable<IResponse<void>> {
    return this.http.delete<IResponse<void>>(`${this.API_URL}/assistant/delete-by-talk-id/${talkId}`);
  }

  getAssistantsByWorkerDateAndTurn(
    workerDate: string,
    turn: string,
    talkId: string
  ): Observable<IAssistantEmployee[]> {
    return this.http.post<IAssistantEmployee[]>(
      `${this.API_URL}/named/date-turn`,
      { workerDate, turn, talkId }
    );
  }
}
