import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { adminAuthGuard, adminGuestGuard } from './core/guards';
import { AdminLayout } from './core/layout/admin-layout';
import { AdminLogin } from './core/login/admin-login';
import { AdminForbidden, AdminNotFound } from './core/errors/admin-errors';

/**
 * Route Admin theo bảng D0–D11 (đặc tả nhóm trưởng):
 * D1 → D0 → D2, D3 (→ D4), D5 (→ D6), D7 (→ D8), D9; D10 403, D11 404
 */
const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'admin/homepage' },
  { path: 'admin/login', component: AdminLogin, canActivate: [adminGuestGuard], title: 'Đăng nhập | PrintiFy Admin' },
  { path: 'admin/forbidden', component: AdminForbidden, title: 'Không có quyền | PrintiFy Admin' },
  {
    path: 'admin',
    component: AdminLayout,
    canActivate: [adminAuthGuard],
    // D0, D2–D9 tải lazy (pages/pages-module.ts)
    loadChildren: () => import('./pages/pages-module').then((m) => m.PagesModule),
  },
  { path: '**', component: AdminNotFound, title: 'Không tìm thấy | PrintiFy Admin' },
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { scrollPositionRestoration: 'top' })],
  exports: [RouterModule],
})
export class AppRoutingModule {}
