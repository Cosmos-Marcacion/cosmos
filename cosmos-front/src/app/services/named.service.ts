import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { INamedPayload, INamedResponseFormat } from '../interfaces/named.interface';
import { environment } from '../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class NamedService {
  private readonly api = environment.api
  private http = inject(HttpClient)

  getNameds(payload: INamedPayload) {
    return this.http.post<INamedResponseFormat[]>(`${this.api}/named/nameds/grouped`, payload)
  }

  formatDate(date: string) {
    return date.split('-').reverse().join('/')
  }

  isLoggedIn() {
    return this.http.get<boolean>(`${this.api}/employee/loggued`)
  }
}
