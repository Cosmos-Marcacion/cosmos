import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { UserStateService } from '../services/user-state.service';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { NotificationService } from '../services/notification.service';
import { OWN_ERROR_MESSAGE } from './silent-request';

/**
 * Extrae el mensaje que se le muestra al usuario.
 *
 * El cuerpo del error no siempre es el JSON del backend: cuando el telefono se
 * queda sin cobertura o el servidor no responde, `error.error` es un
 * `ProgressEvent` (status 0) y cuando la respuesta viene vacia es `null`. Leer
 * `.message` a ciegas mostraba "undefined" en el aviso, o reventaba dentro del
 * `catchError` y dejaba la peticion sin gestionar.
 */
function resolveMessage(error: unknown): string {
  if (!(error instanceof HttpErrorResponse)) {
    return 'Ocurrio un error inesperado';
  }

  if (error.status === 0) {
    return 'No hay conexion con el servidor';
  }

  const body = error.error;

  if (typeof body === 'string' && body.trim()) {
    return body;
  }

  if (body && typeof body === 'object') {
    const message = (body as { message?: string | string[] }).message;
    if (Array.isArray(message) && message.length) {
      // class-validator devuelve un array con un mensaje por regla incumplida.
      return message.join('. ');
    }
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }

  return error.message || 'Ocurrio un error inesperado';
}

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const userStateService = inject(UserStateService);
  const router = inject(Router);
  const notificationService = inject(NotificationService);
  return next(req).pipe(
    catchError((error) => {
      let errorMessage = resolveMessage(error);
      if (error instanceof HttpErrorResponse && error.status === 401) {
        userStateService.clearUser();
        router.navigate(['/login']);
        errorMessage = 'Error de autenticación';
      }
      if (!req.url.includes('loggued') && !req.context.get(OWN_ERROR_MESSAGE)) {
        notificationService.show(errorMessage, 'error');
      }
      return throwError(() => error);
    })
  );
};
