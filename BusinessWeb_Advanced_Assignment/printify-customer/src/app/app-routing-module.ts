import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PrintifyHomepage } from './printify-homepage/printify-homepage';
import { ProductList } from './product-list/product-list';
import { ProductDetail } from './product-detail/product-detail';
import { ComingSoon } from './coming-soon/coming-soon';

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
  { path: 'products', component: ProductList, title: 'Sản phẩm | PrintiFy' },
  { path: 'products/:id', component: ProductDetail, title: 'Chi tiết sản phẩm | PrintiFy' },

  // Các màn hình chưa xây dựng: tạm hiện trang "đang xây dựng". Ai làm màn nào thì thay component tương ứng.
  { path: 'cart', component: ComingSoon, data: { title: 'Giỏ hàng' } },
  { path: 'checkout', component: ComingSoon, data: { title: 'Thanh toán' } },
  { path: 'editor/:productId', component: ComingSoon, data: { title: 'Thiết kế sản phẩm' } },
  { path: 'market', component: ComingSoon, data: { title: 'Marketplace' } },
  { path: 'about', component: ComingSoon, data: { title: 'Giới thiệu' } },
  { path: 'auth/login', component: ComingSoon, data: { title: 'Đăng nhập' } },
  { path: 'auth/register', component: ComingSoon, data: { title: 'Đăng ký' } },
  { path: '**', component: ComingSoon }
];


@NgModule({
  imports: [RouterModule.forRoot(routes, { scrollPositionRestoration: 'enabled' })],
  exports: [RouterModule]
})
export class AppRoutingModule { }
