import { NgModule } from '@angular/core';
import { SharedModule } from '../shared/shared-module';
import { Navbar } from './navbar/navbar';
import { ShopLayout } from './layout/shop-layout/shop-layout';
import { NotFound } from './not-found/not-found';
import { DemoLogin } from './demo-login/demo-login';

/** Thành phần toàn cục, chỉ import 1 lần ở AppModule */
@NgModule({
  declarations: [Navbar, ShopLayout, NotFound, DemoLogin],
  imports: [SharedModule],
  exports: [Navbar, ShopLayout, NotFound, DemoLogin],
})
export class CoreModule {}
