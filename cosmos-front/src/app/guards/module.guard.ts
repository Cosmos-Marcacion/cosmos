import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { UserStateService } from '../services/user-state.service';
import { NotificationService } from '../services/notification.service';
import { firstAllowedPath } from '../constants/platform-modules.constant';

/**
 * Deja entrar a una ruta solo si el perfil tiene su módulo.
 *
 * Ocultar la opción del menú no basta: la URL se puede escribir, y quedaba una
 * pantalla que carga, lanza sus peticiones y las ve fallar con 403 una a una.
 * Esto corta antes y lleva a donde el usuario sí puede estar.
 *
 * No sustituye al guardia del backend, que es el que protege de verdad. Este
 * está para que la aplicación se comporte, no para impedir nada: quien edite
 * el `localStorage` verá la pantalla y ninguna de sus peticiones funcionará.
 */
export function moduleGuard(moduleKey: string): CanActivateFn {
  return () => {
    const router = inject(Router);
    const users = inject(UserStateService);
    const notification = inject(NotificationService);

    const permissions = users.permissions();
    if (permissions.includes(moduleKey)) {
      return true;
    }

    // Sin sesión manda el guardia de autenticación; aquí solo se aparta.
    if (!users.getUser()) {
      router.navigate(['/login']);
      return false;
    }

    notification.show('Tu perfil no tiene acceso a esta pantalla.', 'error');
    router.navigate([firstAllowedPath(permissions)]);
    return false;
  };
}
