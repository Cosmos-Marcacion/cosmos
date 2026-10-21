import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { INamedPayload, INamedResponseFormat } from '../modules/home/interfaces/named-payload.interface';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class NamedService {

  private http = inject(HttpClient)

  getNameds(payload: INamedPayload) {
    return this.http.post<INamedResponseFormat[]>(`${environment.api}/named/nameds/grouped`, payload)
  }

  formatDate(date: string) {
    return date.split('-').reverse().join('/')
  }
}
