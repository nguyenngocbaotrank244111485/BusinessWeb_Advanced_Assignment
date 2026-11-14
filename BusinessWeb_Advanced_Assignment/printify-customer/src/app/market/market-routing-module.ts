import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { authGuard } from '../core/guards/auth-guard';
import { MarketList } from './market-list/market-list';
import { MarketDetail } from './market-detail/market-detail';
import { MyListings } from './my-listings/my-listings';
import { ListingForm } from './listing-form/listing-form';

/** /market/... – C05, C06 xem công khai; C20 My marketplace (gồm form đăng/sửa tin) cần đăng nhập */
const routes: Routes = [
  { path: '', component: MarketList, title: 'Marketplace | PrintiFy' },
  { path: 'my-listings', component: MyListings, canActivate: [authGuard], title: 'My marketplace | PrintiFy' },
  { path: 'my-listings/new', component: ListingForm, canActivate: [authGuard], title: 'Đăng bán thiết kế | PrintiFy' },
  { path: 'my-listings/:listingId/edit', component: ListingForm, canActivate: [authGuard], title: 'Sửa tin đăng | PrintiFy' },
  { path: ':listingId', component: MarketDetail, title: 'Chi tiết thiết kế | PrintiFy' },
];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule],
})
export class MarketRoutingModule {}
