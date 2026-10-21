import { CanActivateFn } from '@angular/router';
import { UserStateService } from '../services/user-state.service';
import { Router } from '@angular/router';
import { inject } from '@angular/core';

export const noAuthGuard: CanActivateFn = (route, state) => {
  const userStateService = inject(UserStateService);
  const router = inject(Router);

  if (!userStateService.getUser()?.access_token) {
    return true;
  }
  router.navigate(['/']);
  return false;
};
