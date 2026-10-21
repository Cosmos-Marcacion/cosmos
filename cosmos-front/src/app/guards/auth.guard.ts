
import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { USER_LOCALSTORAGE_KEY } from '../constants/user-localstorage.constant';

export const authGuard: CanActivateFn = (route, state) => {
  const router = inject(Router);
  const user = localStorage.getItem(USER_LOCALSTORAGE_KEY)
  if (user) {
    return true;
  }
  router.navigate(['/login']);
  return false;
};
