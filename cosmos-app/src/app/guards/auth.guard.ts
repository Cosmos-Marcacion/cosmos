
import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { UserStateService } from '../services/user-state.service';

/**
 * Se decide por la sesion en memoria, como `noAuthGuard`.
 *
 * Antes miraba si existia la clave en localStorage. Tras un 401 el interceptor
 * vacia la sesion en memoria (no el almacenamiento) y manda al login; con el
 * boton atras se volvia a entrar a las pantallas privadas con una sesion ya
 * caducada, y cada peticion rebotaba otra vez al login.
 */
export const authGuard: CanActivateFn = (route, state) => {
  const router = inject(Router);
  const user = inject(UserStateService).getUser();
  if (user?.access_token) {
    return true;
  }
  router.navigate(['/login']);
  return false;
};
