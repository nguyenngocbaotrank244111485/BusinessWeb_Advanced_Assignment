import { Component, EventEmitter, Input, Output } from '@angular/core';
import { Category } from '../../../models/product.model';

export interface PriceRange { min: number | null; max: number | null; }

/** Bộ lọc bên trái: danh mục + khoảng giá + nút xóa bộ lọc */
@Component({
  selector: 'app-filter-bar',
  standalone: false,
  templateUrl: './filter-bar.html',
  styleUrl: './filter-bar.css',
})
export class FilterBar {
  @Input() categories: Category[] = [];
  @Input() total = 0;
  @Input() category = '';
  @Input() minPrice: number | null = null;
  @Input() maxPrice: number | null = null;
  @Input() hasFilter = false;

  @Output() categoryChange = new EventEmitter<string>();
  @Output() priceChange = new EventEmitter<PriceRange>();
  @Output() clear = new EventEmitter<void>();

  applyPrice(min: string, max: string): void {
    let lo = this.toNumber(min);
    let hi = this.toNumber(max);
    if (lo != null && hi != null && lo > hi) [lo, hi] = [hi, lo]; // nhập ngược thì tự đảo
    this.priceChange.emit({ min: lo, max: hi });
  }

  private toNumber(v: string): number | null {
    const n = parseInt(String(v).replace(/[^\d]/g, ''), 10);
    return Number.isFinite(n) ? n : null;
  }
}
