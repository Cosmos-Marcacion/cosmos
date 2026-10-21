import { TestBed } from '@angular/core/testing';
import { CanActivateFn, Router } from '@angular/router';
import { UserStateService } from '../services/user-state.service';
import { USER_LOCALSTORAGE_KEY } from '../constants/user-localstorage.constant';

import { authGuard } from './auth.guard';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';

describe('authGuard', () => {
  const executeGuard: CanActivateFn = (...guardParameters) => 
      TestBed.runInInjectionContext(() => authGuard(...guardParameters));

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
  });

  it('should be created', () => {
    expect(executeGuard).toBeTruthy();
  });
});

describe('authGuard con sesion', () => {
  const run = () =>
    TestBed.runInInjectionContext(() => authGuard({} as any, {} as any));

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    });
  });

  afterEach(() => localStorage.removeItem(USER_LOCALSTORAGE_KEY));

  it('deja pasar con sesion', () => {
    TestBed.inject(UserStateService).setUser({ access_token: 't' } as any);
    expect(run()).toBe(true);
  });

  it('tras un 401 (sesion vaciada en memoria) no deja volver a las pantallas privadas', () => {
    const state = TestBed.inject(UserStateService);
    state.setUser({ access_token: 't' } as any);
    // Lo que hace el interceptor de errores ante un 401: la clave sigue en
    // localStorage, pero la sesion en memoria ya no.
    state.clearUser();
    const navigate = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);

    expect(run()).toBe(false);
    expect(navigate).toHaveBeenCalledWith(['/login']);
  });
});
