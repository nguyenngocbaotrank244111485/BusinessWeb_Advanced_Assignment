import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Product } from '../../../models/product.model';
import { ProductService } from '../../../services/product-service';

/**
 * Chọn màu + size theo tồn kho từng biến thể.
 * Dùng lại ở: chi tiết sản phẩm, giỏ hàng (đổi màu/size), editor.
 */
@Component({
  selector: 'app-variant-picker',
  standalone: false,
  templateUrl: './variant-picker.html',
  styleUrl: './variant-picker.css',
})
export class VariantPicker {
  @Input({ required: true }) product!: Product;
  @Input() color = '';
  @Input() size: string | null = null;

  @Output() colorChange = new EventEmitter<string>();
  @Output() sizeChange = new EventEmitter<string | null>();

  constructor(readonly ps: ProductService) {}

  get colors(): string[] {
    return this.ps.getColors(this.product);
  }

  get sizes(): string[] {
    return this.ps.getSizes(this.product, this.color);
  }

  sizeStock(s: string): number {
    return this.ps.findVariant(this.product, this.color, s)?.stock ?? 0;
  }

  /** Màu hết sạch hàng ở mọi size */
  colorSoldOut(c: string): boolean {
    return this.product.variants.filter((v) => v.color === c).every((v) => v.stock === 0);
  }

  pickColor(c: string): void {
    if (c === this.color) return;
    this.colorChange.emit(c);
    // size cũ không có ở màu mới thì bỏ chọn
    const sizesOfNew = this.ps.getSizes(this.product, c);
    if (this.size && !sizesOfNew.includes(this.size)) this.sizeChange.emit(null);
  }
}
