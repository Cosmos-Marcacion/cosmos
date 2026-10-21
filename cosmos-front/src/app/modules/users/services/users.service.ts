import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { IUserResponse, IUser } from '../interfaces/user.interface';
import { Observable } from 'rxjs';
import { IResponse } from '../../../interfaces/response.interface';

@Injectable({
  providedIn: 'root',
})
export class UsersService {
  private http = inject(HttpClient);
  url = environment.api;

  getUsers(
    limit: number,
    page: number,
    search: string = ''
  ): Observable<IResponse<IUserResponse[]>> {
    return this.http.get<IResponse<IUserResponse[]>>(
      `${this.url}/user/${limit}/${page}?search=${encodeURIComponent(search)}`
    );
  }

  getUsersExceptSuper(
    limit: number,
    page: number,
    search: string = ''
  ): Observable<IResponse<IUserResponse[]>> {
    return this.http.get<IResponse<IUserResponse[]>>(
      `${this.url}/user/except-super/${limit}/${page}?search=${encodeURIComponent(search)}`
    );
  }

  deleteUser(id: string): Observable<IResponse<void>> {
    return this.http.delete<IResponse<void>>(`${this.url}/user/${id}`);
  }

  getUser(id: string): Observable<IUserResponse> {
    return this.http.get<IUserResponse>(`${this.url}/user/by-id/${id}`);
  }

  createUser(user: IUser): Observable<IUserResponse> {
    return this.http.post<IUserResponse>(`${this.url}/user`, user);
  }

  updateUser(id: string, user: Partial<IUser>): Observable<IUserResponse> {
    return this.http.patch<IUserResponse>(`${this.url}/user/${id}`, user);
  }

  createUserFormData(formData: FormData): Observable<IUserResponse> {
    return this.http.post<IUserResponse>(`${this.url}/user`, formData);
  }

  updateUserFormData(id: string, formData: FormData): Observable<IUserResponse> {
    return this.http.patch<IUserResponse>(`${this.url}/user/${id}`, formData);
  }
}
