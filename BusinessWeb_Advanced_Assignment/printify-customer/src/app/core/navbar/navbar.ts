import { Component, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter, map } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { CartService } from '../../services/cart-service';
import { AuthService } from '../../services/auth-service';

/** Thanh điều hướng chung: logo, menu, ô tìm kiếm, giỏ hàng, đăng nhập */
@Component({
  selector: 'app-navbar',
  standalone: false,
  templateUrl: './navbar.html',
  styleUrl: './navbar.css',
})
export class Navbar {
  readonly cart = inject(CartService);
  readonly auth = inject(AuthService);
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

  logout(): void {
    this.auth.logout().subscribe({ next: () => this.router.navigateByUrl('/') });
  }

  /** Đường dẫn hiện tại, để đăng nhập xong quay lại đúng trang */
  get returnUrl(): string {
    return this.router.url.startsWith('/auth') ? '/' : this.router.url;
  }

  private section(url: string): string {
    if (url.startsWith('/products')) return 'products';
    if (url.startsWith('/market')) return 'market';
    if (url.startsWith('/about')) return 'about';
    return url === '/' ? 'home' : '';
  }
}
