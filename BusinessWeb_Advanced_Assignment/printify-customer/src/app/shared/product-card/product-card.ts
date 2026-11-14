import { Component, Input } from '@angular/core';
import { Product } from '../../models/product.model';
import { ProductService } from '../../services/product-service';

/** Thẻ sản phẩm dùng lại: danh sách, sản phẩm tương tự, trang chủ... */
@Component({
  selector: 'app-product-card',
  standalone: false,
  templateUrl: './product-card.html',
  styleUrl: './product-card.css',
})
export class ProductCard {
  @Input({ required: true }) product!: Product;
  /** compact = thẻ nhỏ (dùng ở "Sản phẩm tương tự") */
  @Input() compact = false;

  constructor(readonly ps: ProductService) {}

  get soldOut(): boolean {
    return this.ps.totalStock(this.product) === 0;
  }
}
