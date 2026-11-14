import { NgModule } from '@angular/core';
import { SharedModule } from '../shared/shared-module';
import { ShopRoutingModule } from './shop-routing-module';
import { ProductList } from './product-list/product-list';
import { ProductDetail } from './product-detail/product-detail';
import { FilterBar } from './components/filter-bar/filter-bar';
import { SearchBox } from './components/search-box/search-box';
import { VariantPicker } from './components/variant-picker/variant-picker';
import { SimilarProducts } from './components/similar-products/similar-products';

/** ShopModule (công khai) – NV03, NV12. Nạp eager vì là trang đầu. */
@NgModule({
  declarations: [ProductList, ProductDetail, FilterBar, SearchBox, VariantPicker, SimilarProducts],
  imports: [SharedModule, ShopRoutingModule],
  exports: [VariantPicker], // để giỏ hàng / editor dùng lại
})
export class ShopModule {}
