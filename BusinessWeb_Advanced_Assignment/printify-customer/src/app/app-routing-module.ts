import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PrintifyHomepage } from './printify-homepage/printify-homepage';
import { ShopLayout } from './core/layout/shop-layout/shop-layout';
import { NotFound } from './core/not-found/not-found';
import { DemoLogin } from './core/demo-login/demo-login';
import { authGuard } from './core/guards/auth-guard';

const routes: Routes = [
  {
    path: '',
    component: PrintifyHomepage,
    pathMatch: 'full'
  },
  {
    path: 'printify-homepage',
    component: PrintifyHomepage
  },
  // /products và /products/:slug nằm trong shop/shop-routing-module.ts

  // Marketplace: tải lazy (Ch.IV 4.4.2)
  {
    path: 'market',
    component: ShopLayout,
    loadChildren: () => import('./market/market-module').then((m) => m.MarketModule),
  },

  // C12 Giỏ hàng (khách vãng lai dùng được) và C13 Checkout (cần đăng nhập) – tải lazy
  {
    path: 'cart',
    component: ShopLayout,
    loadChildren: () => import('./cart/cart-module').then((m) => m.CartModule),
  },
  {
    path: 'checkout',
    component: ShopLayout,
    canActivate: [authGuard],
    loadChildren: () => import('./cart/checkout-module').then((m) => m.CheckoutModule),
  },

  // Các màn hình chưa xây dựng: tạm hiện trang "đang xây dựng".
  // Ai làm màn nào thì thay NotFound bằng component (hoặc loadChildren) tương ứng.
  {
    path: '',
    component: ShopLayout,
    children: [
      { path: 'account/orders', component: NotFound, data: { title: 'Đơn hàng của tôi' } },
      { path: 'account/orders/:orderId', component: NotFound, data: { title: 'Chi tiết đơn hàng' } },
      { path: 'editor/:productId', component: NotFound, data: { title: 'Thiết kế sản phẩm' } },
      { path: 'editor/designs/:designId', component: NotFound, data: { title: 'Chỉnh sửa thiết kế' } },
      { path: 'about', component: NotFound, data: { title: 'Giới thiệu' } },
      // Đăng nhập tạm để demo – thay bằng trang đăng nhập thật của Trân Phạm
      { path: 'auth/login', component: DemoLogin, title: 'Đăng nhập | PrintiFy' },
      { path: 'auth/register', component: NotFound, data: { title: 'Đăng ký' } },
      { path: '**', component: NotFound, title: 'Không tìm thấy trang | PrintiFy' },
    ],
  },
];


@NgModule({
  imports: [RouterModule.forRoot(routes, { scrollPositionRestoration: 'enabled' })],
  exports: [RouterModule]
})
export class AppRoutingModule { }
