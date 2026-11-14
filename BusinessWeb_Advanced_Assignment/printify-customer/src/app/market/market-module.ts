import { NgModule } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { SharedModule } from '../shared/shared-module';
import { MarketRoutingModule } from './market-routing-module';
import { MarketList } from './market-list/market-list';
import { MarketDetail } from './market-detail/market-detail';
import { ListingCard } from './listing-card/listing-card';
import { ReportDialog } from './report-dialog/report-dialog';
import { MyListings } from './my-listings/my-listings';
import { ListingForm } from './listing-form/listing-form';
import { WatermarkImage } from './watermark-image/watermark-image';

/** MarketModule (lazy) – NV05 Marketplace thiết kế */
@NgModule({
  declarations: [MarketList, MarketDetail, ListingCard, ReportDialog, MyListings, ListingForm, WatermarkImage],
  imports: [SharedModule, ReactiveFormsModule, MarketRoutingModule],
})
export class MarketModule {}
