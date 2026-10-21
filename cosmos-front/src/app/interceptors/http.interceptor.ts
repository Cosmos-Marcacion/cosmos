import { HttpInterceptorFn } from '@angular/common/http';
import { UserStateService } from '../services/user-state.service';
import { inject } from '@angular/core';
import { LoaderService } from '../services/loader.service';
import { finalize } from 'rxjs';
import { SILENT_REQUEST } from './silent-request';

export const httpInterceptor: HttpInterceptorFn = (req, next) => {
  const userStateService = inject(UserStateService);
  const loaderService = inject(LoaderService);
  // Las consultas de autocompletado no deben levantar el loader global.
  const isSilent = req.context.get(SILENT_REQUEST);
  if (!isSilent) {
    loaderService.show();
  }
  const user = userStateService.getUser();
  const currentHeaders = req.headers;
  const objectHeaders = Object.fromEntries(currentHeaders.keys().map(key => [key, currentHeaders.get(key)]));
  if (user) {
    req = req.clone({
      setHeaders: {
        ...objectHeaders,
        Authorization: `Bearer ${user.access_token}`
      }
    });
  }


  return next(req).pipe(
    // El panel estaba excluido de aquí porque encadenaba tres peticiones y el
    // loader parpadeaba entre ellas; a cambio, sólo lo ocultaba el callback de
    // éxito de la última, así que cualquier error lo dejaba girando para
    // siempre. Ahora el panel resuelve su búsqueda en una sola petición y el
    // loader se libera pase lo que pase.
    finalize(() => {
      if (!isSilent) {
        loaderService.hide();
      }
    })
  );
};
