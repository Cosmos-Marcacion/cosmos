import { Injectable, signal } from '@angular/core';

@Injectable({
    providedIn: 'root'
})
export class NavigationStateService {
    private internalNavigation = signal(false);

    /**
     * Marca que la próxima navegación es interna
     */
    markInternalNavigation(): void {
        this.internalNavigation.set(true);
    }

    /**
     * Verifica si la navegación actual es interna
     */
    isInternalNavigation(): boolean {
        return this.internalNavigation();
    }

    /**
     * Resetea el estado de navegación interna
     */
    resetInternalNavigation(): void {
        this.internalNavigation.set(false);
    }
}
