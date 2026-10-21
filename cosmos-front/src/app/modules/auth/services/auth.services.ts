import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { IUserResponse } from '../../../interfaces/user.interface';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';
import { handled } from '../../../interceptors/handled-error';

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private http = inject(HttpClient);

  login(email: string, password: string): Observable<IUserResponse> {
    // La pantalla de acceso explica sus propios errores junto al formulario.
    return this.http.post<IUserResponse>(`${environment.api}/auth/login`, { email, password }, { context: handled() });
  }

  sendPasswordCode(email: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${environment.api}/auth/password/send-code`, { email }, { context: handled() });
  }

  resetPassword(data: any): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${environment.api}/auth/password/reset`, data, { context: handled() });
  }

}
