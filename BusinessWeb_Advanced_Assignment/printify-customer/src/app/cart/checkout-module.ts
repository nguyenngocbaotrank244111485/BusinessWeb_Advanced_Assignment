import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { SharedModule } from '../shared/shared-module';
import { CheckoutPage } from './checkout-page/checkout-page';

/** C13 – Checkout + popup QR (lazy, CustomerGuard ở app-routing) */
@NgModule({
  declarations: [CheckoutPage],
  imports: [SharedModule, ReactiveFormsModule, RouterModule.forChild([{ path: '', component: CheckoutPage, title: 'Thanh toán | PrintiFy' }])],
})
export class CheckoutModule {}
