import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthService } from '../services/auth-service';

// Reuse for editor, cart, checkout, designs, orders, profile and survey.
export const customerAuthGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  return auth.checkSession().pipe(
    map(user => user?.role === 'CUSTOMER' && user.status === 'ACTIVE'
      ? true
      : router.createUrlTree(['/auth/login'], {
          queryParams: { returnUrl: state.url }
        })),
    catchError(() => of(router.createUrlTree(['/auth/login'], {
      queryParams: { returnUrl: state.url }
    })))
  );
};