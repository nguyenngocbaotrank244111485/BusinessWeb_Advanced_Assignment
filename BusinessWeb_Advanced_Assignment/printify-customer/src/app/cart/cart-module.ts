import { NgModule } from '@angular/core';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../shared/shared-module';
import { CartPage } from './cart-page/cart-page';

/** C12 – Giỏ hàng (lazy). Khách chưa đăng nhập vẫn dùng được. */
@NgModule({
  declarations: [CartPage],
  imports: [SharedModule, RouterModule.forChild([{ path: '', component: CartPage, title: 'Giỏ hàng | PrintiFy' }])],
})
export class CartModule {}
