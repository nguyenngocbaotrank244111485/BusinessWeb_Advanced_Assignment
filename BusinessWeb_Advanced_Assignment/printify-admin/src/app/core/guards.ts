import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AdminAuthService } from '../services/admin-auth.service';

/** Chưa đăng nhập -> D1 (giữ returnUrl) */
export const adminAuthGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AdminAuthService);
  const router = inject(Router);
  await auth.ready;
  return auth.user() ? true : router.createUrlTree(['/admin/login'], { queryParams: { returnUrl: state.url } });
};

/** Đã đăng nhập mà mở trang login -> D0 */
export const adminGuestGuard: CanActivateFn = async () => {
  const auth = inject(AdminAuthService);
  const router = inject(Router);
  await auth.ready;
  return auth.user() ? router.createUrlTree(['/admin/homepage']) : true;
};

/** Route chỉ dành cho 1 số vai trò: data.roles = ['SUPERADMIN'] -> người khác vào D10 */
export const adminRoleGuard: CanActivateFn = async (route) => {
  const auth = inject(AdminAuthService);
  const router = inject(Router);
  await auth.ready;
  const roles: string[] = route.data?.['roles'] ?? [];
  return !roles.length || roles.includes(auth.user()?.role ?? '') ? true : router.createUrlTree(['/admin/forbidden']);
};
