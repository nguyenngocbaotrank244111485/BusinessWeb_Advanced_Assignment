import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { combineLatest, map } from 'rxjs';
import { Product } from '../models/product.model';
import { CartService } from '../services/cart-service';
import { ProductService } from '../services/product-service';

/** S03 – Chi tiết sản phẩm: /products/:id */
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

  readonly colors = computed(() => (this.product() ? this.ps.getColors(this.product()!) : []));
  readonly sizes = computed(() => (this.product() ? this.ps.getSizes(this.product()!, this.color()) : []));
  readonly variant = computed(() => {
    const p = this.product();
    return p ? this.ps.findVariant(p, this.color(), this.sizes().length ? this.size() : null) : undefined;
  });
  readonly stock = computed(() => this.variant()?.stock ?? 0);
  readonly needSize = computed(() => this.sizes().length > 0 && !this.size());
  readonly canAdd = computed(() => !!this.variant() && this.stock() > 0 && this.quantity() <= this.stock());

  /** Ảnh: ảnh theo màu đang chọn + ảnh chi tiết, không trùng */
  readonly gallery = computed(() => {
    const p = this.product();
    if (!p) return [];
    const byColor = p.variants.find((v) => v.color === this.color())?.imageUrl;
    return [...new Set([byColor || p.img_display, ...p.img_detail].filter(Boolean))];
  });

  constructor() {
    const destroyRef = inject(DestroyRef);
    combineLatest([this.route.paramMap.pipe(map((m) => m.get('id') ?? '')), this.ps.getActiveProducts()])
      .pipe(takeUntilDestroyed(destroyRef))
      .subscribe(([id, list]) => {
        const p = list.find((x) => x._id === id);
        this.loading.set(false);
        if (!p) {
          // id sai hoặc sản phẩm ngừng bán -> quay về danh sách
          this.router.navigate(['/products'], { queryParams: { notfound: id } });
          return;
        }
        this.product.set(p);
        this.similar.set(list.filter((x) => x.category === p.category && x._id !== p._id).slice(0, 4));
        const first = p.variants.find((v) => v.stock > 0) ?? p.variants[0];
        this.color.set(first?.color ?? '');
        this.size.set(first?.size ?? null);
        this.quantity.set(1);
        this.activeImage.set(this.gallery()[0] ?? p.img_display);
        window.scrollTo({ top: 0 });
      });
  }

  selectColor(c: string): void {
    this.color.set(c);
    // giữ size cũ nếu màu mới cũng có, không thì bỏ chọn
    if (this.size() && !this.sizes().includes(this.size()!)) this.size.set(null);
    this.quantity.set(1);
    this.activeImage.set(this.gallery()[0]);
  }

  selectSize(s: string): void {
    this.size.set(s);
    this.quantity.set(1);
  }

  sizeStock(s: string): number {
    const p = this.product();
    return p ? this.ps.findVariant(p, this.color(), s)?.stock ?? 0 : 0;
  }

  changeQty(delta: number): void {
    this.quantity.set(Math.max(1, Math.min(this.quantity() + delta, Math.max(1, this.stock()))));
  }

  addToCart(): void {
    const p = this.product();
    const v = this.variant();
    if (this.needSize()) return this.showToast('error', 'Bạn chọn size trước nhé.');
    if (!p || !v) return;
    const ok = this.cart.add(p, v, this.quantity());
    if (ok) {
      this.showToast('ok', `Đã thêm ${this.quantity()} × ${p.name} vào giỏ hàng!`);
    } else {
      const inCart = this.cart.quantityInCart(p._id, v._id);
      const left = Math.max(0, v.stock - inCart);
      this.showToast(
        'error',
        left > 0
          ? `Kho còn ${v.stock}, giỏ đã có ${inCart} nên bạn chỉ thêm được tối đa ${left} nữa.`
          : `Giỏ đã có ${inCart}, bằng toàn bộ số hàng còn lại.`,
      );
    }
  }

  startDesign(): void {
    const p = this.product();
    if (!p) return;
    this.router.navigate(['/editor', p._id], {
      queryParams: { color: this.color() || null, size: this.size() || null },
    });
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
