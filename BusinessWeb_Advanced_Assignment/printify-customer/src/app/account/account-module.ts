import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';
import { SharedModule } from '../shared/shared-module';
import { CoreModule } from '../core/core-module';
import { authGuard } from '../core/guards/auth-guard';
import { AccountLayout } from './account-layout/account-layout';
import { ProfilePage } from './profile-page/profile-page';
import { NotificationsPage } from './notifications-page/notifications-page';
import { DesignsPage } from './designs-page/designs-page';
import { OrdersPage } from './orders/orders-page/orders-page';
import { OrderDetail } from './orders/order-detail/order-detail';
import { CancelDialog } from './orders/cancel-dialog/cancel-dialog';
import { ReviewDialog } from './orders/review-dialog/review-dialog';

/**
 * AccountModule (lazy) – /account/*
 * C11, C14, C15, C18, C19 xong; các màn còn lại tạm hiện trang "đang xây dựng", ai làm thì thay component tương ứng.
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
      { path: 'orders', component: OrdersPage, title: 'Đơn hàng của tôi | PrintiFy' },
      { path: 'orders/:orderId', component: OrderDetail, title: 'Chi tiết đơn hàng | PrintiFy' },
      { path: 'notifications', component: NotificationsPage, title: 'Thông báo | PrintiFy' },
    ],
  },
];

@NgModule({
  declarations: [AccountLayout, ProfilePage, NotificationsPage, DesignsPage, OrdersPage, OrderDetail, CancelDialog, ReviewDialog],
  imports: [SharedModule, CoreModule, ReactiveFormsModule, RouterModule.forChild(routes)],
})
export class AccountModule {}
