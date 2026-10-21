import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';
import { IPlatformModule, IRoleResponse } from '../interfaces/user.interface';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class RolesService {
  private http = inject(HttpClient);
  url = environment.api;

  getRoles(): Observable<IRoleResponse[]> {
    return this.http.get<IRoleResponse[]>(`${this.url}/role`);
  }

  /**
   * Perfiles que quien opera puede dar a un usuario.
   *
   * El alta de usuarios no usa `getRoles()`: esa ruta es de la pantalla de
   * Perfiles y responde 403 a quien tiene Usuarios pero no Perfiles, con lo que
   * el desplegable de rol quedaba vacio.
   */
  getAssignableRoles(): Observable<IRoleResponse[]> {
    return this.http.get<IRoleResponse[]>(`${this.url}/user/assignable-roles`);
  }

  /**
   * El catalogo de modulos que se pueden conceder.
   *
   * Sale del backend y no de una lista escrita aqui: es el mismo catalogo con
   * el que el servidor decide si deja pasar, asi que la pantalla no puede
   * ofrecer un permiso que la API no reconozca.
   */
  getModules(): Observable<IPlatformModule[]> {
    return this.http.get<IPlatformModule[]>(`${this.url}/role/modules`);
  }

  create(role: Partial<IRoleResponse>): Observable<IRoleResponse> {
    return this.http.post<IRoleResponse>(`${this.url}/role`, role);
  }

  update(id: string, role: Partial<IRoleResponse>): Observable<IRoleResponse> {
    return this.http.patch<IRoleResponse>(`${this.url}/role/${id}`, role);
  }

  remove(id: string): Observable<unknown> {
    return this.http.delete(`${this.url}/role/${id}`);
  }
}
