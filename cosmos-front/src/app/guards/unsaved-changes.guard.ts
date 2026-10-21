import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { ConfirmationService } from '../services/confirmation.service';
import { UserStateService } from '../services/user-state.service';

/**
 * Una pantalla que puede tener trabajo sin guardar.
 *
 * `unsavedWarning` deja que cada una diga qué se pierde: "el borrador del
 * formato" y "la marcación a medias" no se salvan igual.
 */
export interface HasUnsavedChanges {
  hasUnsavedChanges(): boolean;
  unsavedWarning?(): { message: string; detail?: string; confirmLabel?: string };
}

/**
 * Avisa antes de salir con cambios sin guardar.
 *
 * El maestro de formatos deja editar un documento entero antes de guardar
 * nada. Pulsar "Marcaciones" en el menú tiraba todo lo hecho sin decir una
 * palabra, y el borrador del servidor seguía teniendo lo de antes: no había
 * forma de darse cuenta hasta imprimir el formato.
 */
export const unsavedChangesGuard: CanDeactivateFn<HasUnsavedChanges> = (component) => {
  if (!component?.hasUnsavedChanges?.()) {
    return true;
  }

  // Sin sesión no hay nada que guardar: quien manda es el interceptor, que
  // acaba de mandar al login. Preguntar aquí dejaría a alguien delante de un
  // editor cuyas peticiones fallan todas.
  if (!inject(UserStateService).getUser()) {
    return true;
  }

  const confirmation = inject(ConfirmationService);
  const warning = component.unsavedWarning?.() ?? {
    message: 'Tienes cambios sin guardar.',
  };

  return new Promise<boolean>((resolve) => {
    confirmation.show(warning.message, () => resolve(true), {
      detail: warning.detail ?? 'Si sales ahora se pierden.',
      confirmLabel: warning.confirmLabel ?? 'Salir sin guardar',
      cancelLabel: 'Seguir aquí',
      danger: true,
      onCancel: () => resolve(false),
    });
  });
};
