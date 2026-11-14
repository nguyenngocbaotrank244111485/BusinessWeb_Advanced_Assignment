import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ShopLayout } from '../core/layout/shop-layout/shop-layout';
import { ProductList } from './product-list/product-list';
import { ProductDetail } from './product-detail/product-detail';

const routes: Routes = [
  {
    path: 'products',
    component: ShopLayout,
    children: [
      { path: '', component: ProductList, title: 'Sản phẩm | PrintiFy' },
      { path: ':slug', component: ProductDetail, title: 'Chi tiết sản phẩm | PrintiFy' },
    ],
  },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class ShopRoutingModule {}
