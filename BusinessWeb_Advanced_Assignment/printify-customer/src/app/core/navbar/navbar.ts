import { Component, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { CartService } from '../../services/cart-service';

/** Thanh điều hướng chung: logo, menu, ô tìm kiếm, giỏ hàng, đăng nhập */
@Component({
  selector: 'app-navbar',
  standalone: false,
  templateUrl: './navbar.html',
  styleUrl: './navbar.css',
})
export class Navbar {
  readonly cart = inject(CartService);
  private readonly router = inject(Router);

  /** Mục menu đang chọn, tính theo URL hiện tại */
  readonly active = toSignal(
    this.router.events.pipe(
      filter((e) => e instanceof NavigationEnd),
      map(() => this.section(this.router.url)),
    ),
    { initialValue: this.section(this.router.url) },
  );

  search(input: HTMLInputElement): void {
    const q = input.value.trim();
    this.router.navigate(['/products'], { queryParams: q ? { q } : {} });
  }

  private section(url: string): string {
    if (url.startsWith('/products')) return 'products';
    if (url.startsWith('/market')) return 'market';
    if (url.startsWith('/about')) return 'about';
    return url === '/' ? 'home' : '';
  }
}
