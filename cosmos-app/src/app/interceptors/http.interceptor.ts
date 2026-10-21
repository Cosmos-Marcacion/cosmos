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
    finalize(() => {
      if (!isSilent) {
        loaderService.hide();
      }
    })
  );
};
