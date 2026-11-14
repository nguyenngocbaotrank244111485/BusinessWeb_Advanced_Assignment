import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { PrintifyHomepage } from './printify-homepage/printify-homepage';
import { ShopLayout } from './core/layout/shop-layout/shop-layout';
import { NotFound } from './core/not-found/not-found';
import { DemoLogin } from './core/demo-login/demo-login';
import { authGuard } from './core/guards/auth-guard';
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
  // C23 Khảo sát TAM: đặc tả ghi /survey -> chuyển về trang đang dùng
  { path: 'survey', redirectTo: 'survey-question', pathMatch: 'full' },
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

  // C04 Giới thiệu (lazy)
  {
    path: 'about',
    component: ShopLayout,
    loadChildren: () => import('./about/about-module').then((m) => m.AboutModule),
  },

  // Tài khoản (C18 + sidebar cho C11, C14, C19): tải lazy
  { path: 'account', loadChildren: () => import('./account/account-module').then((m) => m.AccountModule) },

  // Các màn hình chưa xây dựng: tạm hiện trang "đang xây dựng".
  {
    path: '',
    component: ShopLayout,
    children: [
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
