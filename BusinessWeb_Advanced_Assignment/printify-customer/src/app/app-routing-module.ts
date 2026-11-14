import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PrintifyHomepage } from './printify-homepage/printify-homepage';
import { ShopLayout } from './core/layout/shop-layout/shop-layout';
import { NotFound } from './core/not-found/not-found';
import { DemoLogin } from './core/demo-login/demo-login';
import { SurveyQuestionsComponent } from './survey-questions-component/survey-questions-component';
import { customerAuthGuard } from './guards/customer-auth';

const routes: Routes = [
  { path: '', component: PrintifyHomepage, pathMatch: 'full' },
  { path: 'printify-homepage', component: PrintifyHomepage },
  // /products và /products/:slug nằm trong shop/shop-routing-module.ts

  // Đăng nhập / đăng ký (Trân Nguyễn)
  {
    path: 'auth/login',
    loadComponent: () => import('./login-component/login-component').then((m) => m.LoginComponent),
  },
  {
    path: 'auth/register',
    loadComponent: () => import('./register-component/register-component').then((m) => m.RegisterComponent),
  },
  {
    path: 'survey-question',
    component: SurveyQuestionsComponent,
    canActivate: [customerAuthGuard],
  },

  // C10 Design Editor (lazy, toàn màn hình, không navbar)
  { path: 'editor', loadChildren: () => import('./editor/editor-module').then((m) => m.EditorModule) },
  {
    path: 'account/orders/:orderId/items/:itemId/edit',
    loadChildren: () => import('./editor/editor-module').then((m) => m.EditorSampleModule),
  },

  // Marketplace: tải lazy (Ch.IV 4.4.2)
  {
    path: 'market',
    component: ShopLayout,
    loadChildren: () => import('./market/market-module').then((m) => m.MarketModule),
  },

  // Tài khoản (C18 + sidebar cho C11, C14, C19): tải lazy
  { path: 'account', loadChildren: () => import('./account/account-module').then((m) => m.AccountModule) },

  // Các màn hình chưa xây dựng: tạm hiện trang "đang xây dựng".
  {
    path: '',
    component: ShopLayout,
    children: [
      { path: 'cart', component: NotFound, data: { title: 'Giỏ hàng' } },
      { path: 'checkout', component: NotFound, data: { title: 'Thanh toán' } },
      { path: 'about', component: NotFound, data: { title: 'Giới thiệu' } },
      // Đăng nhập demo bằng dữ liệu mock (khi chưa chạy server)
      { path: 'auth/demo-login', component: DemoLogin, title: 'Đăng nhập demo | PrintiFy' },
      { path: '**', component: NotFound, title: 'Không tìm thấy trang | PrintiFy' },
    ],
  },
];

@NgModule({
  imports: [RouterModule.forRoot(routes, { scrollPositionRestoration: 'enabled' })],
  exports: [RouterModule],
})
export class AppRoutingModule {}
