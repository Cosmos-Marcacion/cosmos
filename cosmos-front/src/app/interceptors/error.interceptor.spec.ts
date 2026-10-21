import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpInterceptorFn, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';

import { errorInterceptor } from './error.interceptor';
import { handled } from './handled-error';
import { NotificationService } from '../services/notification.service';
import { UserStateService } from '../services/user-state.service';
import { USER_LOCALSTORAGE_KEY } from '../constants/user-localstorage.constant';

describe('errorInterceptor', () => {
  const interceptor: HttpInterceptorFn = (req, next) =>
    TestBed.runInInjectionContext(() => errorInterceptor(req, next));

  let http: HttpClient;
  let mock: HttpTestingController;
  let notificaciones: NotificationService;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    mock = TestBed.inject(HttpTestingController);
    notificaciones = TestBed.inject(NotificationService);
    router = TestBed.inject(Router);
    spyOn(notificaciones, 'show');
    spyOn(router, 'navigate');
    localStorage.setItem(USER_LOCALSTORAGE_KEY, JSON.stringify({ access_token: 't' }));
  });

  afterEach(() => localStorage.removeItem(USER_LOCALSTORAGE_KEY));

  it('should be created', () => {
    expect(interceptor).toBeTruthy();
  });

  it('un 401 con token cierra la sesion guardada y vuelve al login', () => {
    http.get('/api/x', { headers: { Authorization: 'Bearer t' } }).subscribe({ error: () => undefined });
    mock.expectOne('/api/x').flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });

    // Con `clearUser` la sesion seguia en localStorage y `authGuard` la daba por buena.
    expect(localStorage.getItem(USER_LOCALSTORAGE_KEY)).toBeNull();
    expect(TestBed.inject(UserStateService).getUser()).toBeNull();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
    expect(notificaciones.show).toHaveBeenCalledWith(
      'Tu sesión ha caducado. Entra otra vez para continuar.',
      'error'
    );
  });

  it('un 401 del login (sin token) no se anuncia como sesion caducada', () => {
    http.post('/api/auth/login', {}, { context: handled() }).subscribe({ error: () => undefined });
    mock.expectOne('/api/auth/login').flush({ message: 'Unauthorized' }, { status: 401, statusText: 'Unauthorized' });

    // La pantalla de acceso explica el fallo junto al formulario.
    expect(notificaciones.show).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });
});
