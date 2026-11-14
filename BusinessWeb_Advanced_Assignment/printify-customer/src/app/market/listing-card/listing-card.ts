import { Component, Input } from '@angular/core';
import { Listing } from '../../models/market.model';
import { Product } from '../../models/product.model';

/** Thẻ tin đăng: ảnh watermark, tên, người bán, phí thiết kế, sản phẩm gắn cố định */
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
  @Input() product?: Product;
}
