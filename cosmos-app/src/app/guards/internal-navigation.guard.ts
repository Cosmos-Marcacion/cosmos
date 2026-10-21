import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { NavigationStateService } from '../services/navigation-state.service';

export const internalNavigationGuard: CanActivateFn = (route, state) => {
    const router = inject(Router);
    const navigationStateService = inject(NavigationStateService);

    // Verificar si la navegación proviene de dentro de la aplicación
    const isInternalNavigation = navigationStateService.isInternalNavigation();

    if (!isInternalNavigation) {
        // Si no es navegación interna, redirigir a /marcacion
        router.navigate(['/marcacion']);
        return false;
    }

    // Resetear el estado después de validar
    navigationStateService.resetInternalNavigation();
    return true;
};
