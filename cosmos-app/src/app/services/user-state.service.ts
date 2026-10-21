import { Injectable, signal } from '@angular/core';
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
      // Una sesion guardada corrupta reventaba el arranque (pantalla en blanco):
      // se descarta y se vuelve al login.
      try {
        this._user.set(JSON.parse(user));
      } catch {
        localStorage.removeItem(USER_LOCALSTORAGE_KEY);
      }
    }
  }

  setUser(user: IUserResponse) {
    this._user.set(user);
    localStorage.setItem(USER_LOCALSTORAGE_KEY, JSON.stringify(user));
  }

  getUser() {
    return this._user();
  }

  clearUser() {
    this._user.set(null);
  }

  logout() {
    this.clearUser();
    localStorage.removeItem(USER_LOCALSTORAGE_KEY);
  }
}
