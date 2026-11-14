import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PrintifyHomepage } from './printify-homepage/printify-homepage';
import { ShopLayout } from './core/layout/shop-layout/shop-layout';
import { NotFound } from './core/not-found/not-found';

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

  // Các màn hình chưa xây dựng: tạm hiện trang "đang xây dựng".
  // Ai làm màn nào thì thay NotFound bằng component (hoặc loadChildren) tương ứng.
  {
    path: '',
    component: ShopLayout,
    children: [
      { path: 'cart', component: NotFound, data: { title: 'Giỏ hàng' } },
      { path: 'checkout', component: NotFound, data: { title: 'Thanh toán' } },
      { path: 'editor/:productId', component: NotFound, data: { title: 'Thiết kế sản phẩm' } },
      { path: 'market', component: NotFound, data: { title: 'Marketplace' } },
      { path: 'about', component: NotFound, data: { title: 'Giới thiệu' } },
      { path: 'auth/login', component: NotFound, data: { title: 'Đăng nhập' } },
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
