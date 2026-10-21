import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { UserStateService } from '../services/user-state.service';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { NotificationService } from '../services/notification.service';
import { HANDLED_ERROR } from './handled-error';

/**
 * Mensaje legible de un fallo de red.
 *
 * `error.error.message` daba por hecho que el cuerpo siempre es el JSON de la
 * API. Con un timeout, un CORS rechazado o un error del propio cliente,
 * `error.error` llega como `null`, texto plano o un `Error`, y leer `.message`
 * lanzaba dentro del `catchError`: el usuario no veía ningún aviso y la
 * petición quedaba a medias.
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return 'No se pudo conectar con el servidor';
    }
    const body: any = error.error;
    const message = typeof body === 'string' ? body : body?.message;
    if (Array.isArray(message)) {
      return message.join('. ');
    }
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
    return error.message || 'Ocurrió un error inesperado';
  }
  return (error as any)?.message || 'Ocurrió un error inesperado';
}

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const userStateService = inject(UserStateService);
  const router = inject(Router);
  const notificationService = inject(NotificationService);
  return next(req).pipe(
    catchError((error) => {
      let errorMessage = getErrorMessage(error);
      // Solo es "sesion caducada" un 401 de una peticion que llevaba token. El
      // login con la contrasena mal tambien responde 401 y salia el aviso de
      // sesion caducada encima del error del formulario.
      const sessionExpired = error?.status === 401 && req.headers.has('Authorization');
      if (sessionExpired) {
        // `logout` y no `clearUser`: este solo vaciaba la memoria y la sesion
        // caducada seguia en localStorage. `authGuard` la daba por buena y al
        // recargar volvia a cargarse, con otro 401 y otro aviso cada vez.
        userStateService.logout();
        router.navigate(['/login']);
        // "Error de autenticación" no dice qué hacer. Lo que ha pasado es que
        // la sesión caducó y la pantalla ya está volviendo al login.
        errorMessage = 'Tu sesión ha caducado. Entra otra vez para continuar.';
      }
      // `loggued` es la comprobación de sesión al arrancar: que falle es lo
      // normal cuando nadie ha entrado todavía. `HANDLED_ERROR` lo marca la
      // pantalla que ya explica el fallo por su cuenta.
      const handled = req.context.get(HANDLED_ERROR) && !sessionExpired;
      if (!req.url.includes('loggued') && !handled) {
        notificationService.show(errorMessage, 'error');
      }
      return throwError(() => error);
    })
  );
};
