import { inject } from '@angular/core';
import { CanDeactivateFn, Router } from '@angular/router';

// Redirige a /inicio cuando la salida del componente se debe a un evento de back (popstate)
export const employeeDetailBackGuard: CanDeactivateFn<unknown> = (
    component,
    currentRoute,
    currentState,
    nextState
) => {
    const router = inject(Router);
    const navigation = router.getCurrentNavigation();
    const isBackNavigation = navigation?.trigger === 'popstate';

    if (isBackNavigation) {
        // Cancelar la navegación y redirigir explícitamente
        router.navigate(['/inicio'], { replaceUrl: true });
        return false;
    }

    return true;
};


