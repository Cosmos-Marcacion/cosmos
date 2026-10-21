import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { IUserResponse } from '../../../interfaces/user.interface';
import { Observable } from 'rxjs';
import { environment } from '../../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private http = inject(HttpClient);

  login(email: string, password: string): Observable<IUserResponse> {
    return this.http.post<IUserResponse>(`${environment.api}/auth/login`, { email, password });
  }

  isLoggedIn() {
    return this.http.get<boolean>(`${environment.api}/employee/loggued`)
  }

}
