import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { SharedModule } from '../shared/shared-module';
import { AdminHomepage } from './homepage/admin-homepage';
import { AdminDashboard } from './dashboard/admin-dashboard';
import { ProductsList } from './products-list/products-list';
import { ProductDetail } from './product-detail/product-detail';
import { OrdersList } from './orders-list/orders-list';
import { OrderDetail } from './order-detail/order-detail';
import { AdminMarketplace } from './marketplace/admin-marketplace';
import { MarketplaceReview } from './marketplace-review/marketplace-review';
import { AdminNotifications } from './notifications/admin-notifications';

/** Các màn D0, D2–D9: tải lazy sau khi đăng nhập (route con của /admin) */
const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'homepage' },
  { path: 'homepage', component: AdminHomepage, title: 'Trang chủ | PrintiFy Admin' },
  { path: 'dashboard', component: AdminDashboard, title: 'Dashboard | PrintiFy Admin' },
  { path: 'products-list', component: ProductsList, title: 'Sản phẩm | PrintiFy Admin' },
  { path: 'products-detail/:id', component: ProductDetail, title: 'Chi tiết sản phẩm | PrintiFy Admin' },
  { path: 'orders-list', component: OrdersList, title: 'Đơn hàng | PrintiFy Admin' },
  { path: 'orders-detail/:id', component: OrderDetail, title: 'Chi tiết đơn | PrintiFy Admin' },
  { path: 'marketplace', component: AdminMarketplace, title: 'Marketplace | PrintiFy Admin' },
  { path: 'marketplace/review/:id', component: MarketplaceReview, title: 'Duyệt tin | PrintiFy Admin' },
  { path: 'notifications', component: AdminNotifications, title: 'Thông báo | PrintiFy Admin' },
];

@NgModule({
  declarations: [AdminHomepage, AdminDashboard, ProductsList, ProductDetail, OrdersList, OrderDetail, AdminMarketplace, MarketplaceReview, AdminNotifications],
  imports: [SharedModule, RouterModule.forChild(routes)],
})
export class PagesModule {}
