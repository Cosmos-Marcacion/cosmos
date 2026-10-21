import { Injectable, computed, signal } from '@angular/core';
import { IUserResponse } from '../interfaces/user.interface';
import { USER_LOCALSTORAGE_KEY } from '../constants/user-localstorage.constant';
@Injectable({
  providedIn: 'root',
})
export class UserStateService {

  private _user = signal<IUserResponse | null>(null);

  constructor() {
    const user = localStorage.getItem(USER_LOCALSTORAGE_KEY);
    if (user) {
      this._user.set(JSON.parse(user));
    }
  }

  setUser(user: IUserResponse) {
    this._user.set(user);
    localStorage.setItem(USER_LOCALSTORAGE_KEY, JSON.stringify(user));
  }

  getUser() {
    return this._user();
  }

  /**
   * Los modulos que el usuario puede abrir.
   *
   * Se leen del token, no del perfil guardado: `permissions` viene resuelto
   * por el backend al entrar y es exactamente lo que el servidor admitira. Si
   * alguien cambia el perfil con la sesion abierta, la pantalla y la API siguen
   * de acuerdo hasta la proxima entrada, en vez de ofrecer opciones que dan 403.
   */
  readonly permissions = computed(() => this._user()?.permissions ?? []);

  /** Si puede entrar a un modulo. */
  can(moduleKey: string): boolean {
    return this.permissions().includes(moduleKey);
  }

  clearUser() {
    this._user.set(null);
  }

  logout() {
    this.clearUser();
    localStorage.removeItem(USER_LOCALSTORAGE_KEY);
  }
}
