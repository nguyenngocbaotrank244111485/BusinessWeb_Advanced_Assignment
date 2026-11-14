import { Component, Input } from '@angular/core';
import { Listing } from '../../models/market.model';

/** Thẻ tin đăng: ảnh watermark, tên, người bán, phí thiết kế, số sản phẩm in được */
@Component({
  selector: 'app-listing-card',
  standalone: false,
  templateUrl: './listing-card.html',
  styleUrl: './listing-card.css',
})
export class ListingCard {
  @Input({ required: true }) listing!: Listing;
  @Input({ required: true }) imageUrl = '';
  @Input() sellerName = '';
  /** Số sản phẩm có thể in thiết kế (0 = ẩn nhãn) */
  @Input() printableCount = 0;
  /** Tin của chính người đang xem */
  @Input() mine = false;
}
