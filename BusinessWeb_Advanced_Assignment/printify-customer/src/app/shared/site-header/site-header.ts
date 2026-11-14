import { Component, Input, inject } from '@angular/core';
import { Router } from '@angular/router';
import { CartService } from '../../services/cart-service';

/** Header dùng chung cho các trang (trừ trang chủ đang có header riêng) */
@Component({
  selector: 'app-site-header',
  standalone: false,
  templateUrl: './site-header.html',
  styleUrl: './site-header.css',
})
export class SiteHeader {
  /** Mục menu đang chọn: 'home' | 'products' | 'market' | 'about' */
  @Input() active = '';

  readonly cart = inject(CartService);
  private readonly router = inject(Router);

  search(input: HTMLInputElement): void {
    const q = input.value.trim();
    this.router.navigate(['/products'], { queryParams: q ? { q } : {} });
  }
}
