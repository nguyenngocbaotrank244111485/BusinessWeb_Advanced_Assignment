import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';
import { SharedModule } from '../shared/shared-module';
import { CoreModule } from '../core/core-module';
import { NotFound } from '../core/not-found/not-found';
import { authGuard } from '../core/guards/auth-guard';
import { AccountLayout } from './account-layout/account-layout';
import { ProfilePage } from './profile-page/profile-page';
import { NotificationsPage } from './notifications-page/notifications-page';
import { DesignsPage } from './designs-page/designs-page';

/**
 * AccountModule (lazy) – /account/*
 * C11, C18, C19 xong; các màn còn lại tạm hiện trang "đang xây dựng", ai làm thì thay component tương ứng.
 */
const routes: Routes = [
  {
    path: '',
    component: AccountLayout,
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'profile' },
      { path: 'profile', component: ProfilePage, title: 'Tài khoản của tôi | PrintiFy' },
      { path: 'designs', component: DesignsPage, title: 'Thiết kế của tôi | PrintiFy' },
      { path: 'orders', component: NotFound, data: { title: 'Đơn hàng của tôi' } },
      { path: 'orders/:orderId', component: NotFound, data: { title: 'Chi tiết đơn hàng' } },
      { path: 'notifications', component: NotificationsPage, title: 'Thông báo | PrintiFy' },
    ],
  },
];

@NgModule({
  declarations: [AccountLayout, ProfilePage, NotificationsPage, DesignsPage],
  imports: [SharedModule, CoreModule, ReactiveFormsModule, RouterModule.forChild(routes)],
})
export class AccountModule {}
