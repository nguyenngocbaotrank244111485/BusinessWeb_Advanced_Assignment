import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { combineLatest, map } from 'rxjs';
import { Product } from '../../models/product.model';
import { CartService } from '../../services/cart-service';
import { ProductService } from '../../services/product-service';

/** Chi tiết sản phẩm /products/:slug – slug sai/ngừng bán -> /products kèm thông báo */
@Component({
  selector: 'app-product-detail',
  standalone: false,
  templateUrl: './product-detail.html',
  styleUrl: './product-detail.css',
})
export class ProductDetail {
  readonly ps = inject(ProductService);
  private readonly cart = inject(CartService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly product = signal<Product | null>(null);
  readonly similar = signal<Product[]>([]);
  readonly loading = signal(true);

  readonly color = signal('');
  readonly size = signal<string | null>(null);
  readonly quantity = signal(1);
  readonly activeImage = signal('');
  readonly toast = signal<{ type: 'ok' | 'error'; text: string } | null>(null);
  private toastTimer?: ReturnType<typeof setTimeout>;

  readonly hasSizes = computed(() => !!this.product() && this.ps.getSizes(this.product()!, this.color()).length > 0);
  readonly needSize = computed(() => this.hasSizes() && !this.size());
  readonly variant = computed(() => {
    const p = this.product();
    return p ? this.ps.findVariant(p, this.color(), this.hasSizes() ? this.size() : null) : undefined;
  });
  readonly stock = computed(() => this.variant()?.stock ?? 0);
  readonly canAdd = computed(() => !!this.variant() && this.stock() > 0 && this.quantity() <= this.stock());

  /** Ảnh theo màu đang chọn + ảnh chi tiết (không trùng) */
  readonly gallery = computed(() => {
    const p = this.product();
    if (!p) return [];
    const byColor = p.variants.find((v) => v.color === this.color())?.imageUrl;
    return [...new Set([byColor || p.img_display, ...p.img_detail].filter(Boolean))];
  });

  constructor() {
    combineLatest([this.route.paramMap.pipe(map((m) => m.get('slug') ?? '')), this.ps.getActiveProducts()])
      .pipe(takeUntilDestroyed(inject(DestroyRef)))
      .subscribe(([slug, list]) => {
        const p = list.find((x) => x.slug === slug) ?? list.find((x) => x._id === slug);
        this.loading.set(false);
        if (!p) {
          this.router.navigate(['/products'], { queryParams: { notfound: slug } });
          return;
        }
        if (p.slug !== slug) {
          // link cũ dạng /products/prd101 -> đổi sang /products/<slug>
          this.router.navigate(['/products', p.slug], { replaceUrl: true });
          return;
        }
        this.product.set(p);
        this.similar.set(list.filter((x) => x.category === p.category && x._id !== p._id));
        const first = p.variants.find((v) => v.stock > 0) ?? p.variants[0];
        this.color.set(first?.color ?? '');
        this.size.set(first?.size ?? null);
        this.quantity.set(1);
        this.activeImage.set(this.gallery()[0] ?? p.img_display);
      });
  }

  onColor(c: string): void {
    this.color.set(c);
    this.quantity.set(1);
    this.activeImage.set(this.gallery()[0]);
  }

  onSize(s: string | null): void {
    this.size.set(s);
    this.quantity.set(1);
  }

  changeQty(delta: number): void {
    this.quantity.set(Math.max(1, Math.min(this.quantity() + delta, Math.max(1, this.stock()))));
  }

  addToCart(): void {
    const p = this.product();
    const v = this.variant();
    if (this.needSize()) return this.showToast('error', 'Bạn chọn size trước nhé.');
    if (!p || !v) return;
    if (this.cart.add(p, v, this.quantity())) {
      this.showToast('ok', `Đã thêm ${this.quantity()} × ${p.name} vào giỏ hàng!`);
      return;
    }
    const inCart = this.cart.quantityInCart(p._id, v._id);
    const left = Math.max(0, v.stock - inCart);
    this.showToast(
      'error',
      left > 0
        ? `Kho còn ${v.stock}, giỏ đã có ${inCart} nên bạn chỉ thêm được tối đa ${left} nữa.`
        : `Giỏ đã có ${inCart}, bằng toàn bộ số hàng còn lại.`,
    );
  }

  startDesign(): void {
    const p = this.product();
    if (!p) return;
    this.router.navigate(['/editor', p._id], { queryParams: { color: this.color() || null, size: this.size() || null } });
  }

  exploreDesigns(): void {
    this.router.navigate(['/market'], { queryParams: { productId: this.product()?._id } });
  }

  private showToast(type: 'ok' | 'error', text: string): void {
    clearTimeout(this.toastTimer);
    this.toast.set({ type, text });
    this.toastTimer = setTimeout(() => this.toast.set(null), 3000);
  }
}
