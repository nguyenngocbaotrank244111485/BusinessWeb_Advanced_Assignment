import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { calcTotals } from '../../models/order.model';
import { Product, ProductVariant } from '../../models/product.model';
import { AuthService } from '../../services/auth-service';
import { CartItem, CartService, MAX_QTY } from '../../services/cart-service';
import { ConfigService } from '../../services/config-service';
import { ProductService } from '../../services/product-service';
import { ProfileService } from '../../services/profile-service';
import { tierDiscount } from '../../models/membership.model';

/** Một dòng giỏ kèm dữ liệu mới nhất để phát hiện giá đổi / hết hàng */
export interface CartLine {
  item: CartItem;
  product?: Product;
  variant?: ProductVariant;
  currentPrice: number;
  currentStock: number;
  issue: '' | 'UNAVAILABLE' | 'OUT_OF_STOCK' | 'INSUFFICIENT_STOCK' | 'PRICE_CHANGED';
}

/** C12 – Giỏ hàng: /cart. Chỉ tính tiền các dòng được chọn. Không giữ kho khi thêm giỏ. */
@Component({
  selector: 'app-cart-page',
  standalone: false,
  templateUrl: './cart-page.html',
  styleUrl: './cart-page.css',
})
export class CartPage {
  readonly cart = inject(CartService);
  readonly auth = inject(AuthService);
  readonly ps = inject(ProductService);
  readonly cfg = inject(ConfigService).config;
  private readonly profiles = inject(ProfileService);
  /** Giảm giá theo hạng thành viên (C18), khách vãng lai = 0% */
  readonly discount = computed(() => tierDiscount(this.auth.isLoggedIn() ? this.profiles.membership() : null));
  private readonly loadProfile = this.auth.isLoggedIn() ? void this.profiles.load() : undefined;
  private readonly router = inject(Router);

  readonly maxQty = MAX_QTY;
  private readonly products = toSignal(this.ps.getProducts(), { initialValue: undefined });
  readonly loading = computed(() => this.products() === undefined);
  readonly confirmRemoveSelected = signal(false);
  readonly undo = signal<CartItem | null>(null);
  private undoTimer?: ReturnType<typeof setTimeout>;
  /** Thông báo khi Checkout trả về vì giá đổi / hết kho */
  readonly returnedIssue = signal(!!inject(ActivatedRoute).snapshot.queryParamMap.get('issue'));

  readonly lines = computed<CartLine[]>(() => {
    const map = new Map((this.products() ?? []).map((p) => [p._id, p]));
    return this.cart.items().map((item) => {
      const product = map.get(item.productId);
      const variant = product?.variants.find((v) => v._id === item.variantId);
      const currentPrice = product?.price ?? item.unitPrice;
      const currentStock = variant?.stock ?? 0;
      let issue: CartLine['issue'] = '';
      if (!product || !product.isActive || !variant) issue = 'UNAVAILABLE';
      else if (currentStock === 0) issue = 'OUT_OF_STOCK';
      else if (item.quantity > currentStock) issue = 'INSUFFICIENT_STOCK';
      else if (currentPrice !== item.unitPrice) issue = 'PRICE_CHANGED';
      return { item, product, variant, currentPrice, currentStock, issue };
    });
  });

  readonly selectedLines = computed(() => this.lines().filter((l) => l.item.selected));
  readonly allSelected = computed(() => this.lines().length > 0 && this.lines().every((l) => l.item.selected));
  readonly blocking = computed(() => this.selectedLines().filter((l) => l.issue));
  readonly totals = computed(() =>
    calcTotals(
      this.selectedLines().map((l) => ({ unitPrice: l.currentPrice, quantity: l.item.quantity, designFee: l.item.designFee ?? 0 })),
      { ...this.cfg(), discountRate: this.discount().rate, discountThresholdVnd: 0 },
    ),
  );
  readonly selectedQty = computed(() => this.selectedLines().reduce((s, l) => s + l.item.quantity, 0));

  colors(l: CartLine): string[] {
    return l.product ? this.ps.getColors(l.product) : [l.item.color];
  }

  sizes(l: CartLine, color: string): string[] {
    return l.product ? this.ps.getSizes(l.product, color) : [];
  }

  stockOf(l: CartLine, color: string, size: string | null): number {
    return l.product ? this.ps.findVariant(l.product, color, size)?.stock ?? 0 : 0;
  }

  onColor(l: CartLine, color: string): void {
    if (!l.product) return;
    const sizes = this.sizes(l, color);
    const size = sizes.includes(l.item.size ?? '') ? l.item.size : (sizes.find((s) => this.stockOf(l, color, s) > 0) ?? sizes[0] ?? null);
    this.applyVariant(l, color, size);
  }

  onSize(l: CartLine, size: string): void {
    this.applyVariant(l, l.item.color, size);
  }

  setQty(l: CartLine, value: number): void {
    this.cart.updateQuantity(l.item.key, value);
  }

  remove(l: CartLine): void {
    this.cart.remove(l.item.key);
    clearTimeout(this.undoTimer);
    this.undo.set(l.item);
    this.undoTimer = setTimeout(() => this.undo.set(null), 5000);
  }

  undoRemove(): void {
    const item = this.undo();
    if (!item) return;
    this.cart.restore(item);
    this.undo.set(null);
  }

  removeSelected(): void {
    this.cart.removeMany(this.selectedLines().map((l) => l.item.key));
    this.confirmRemoveSelected.set(false);
  }

  acceptPrice(l: CartLine): void {
    this.cart.acceptLatest(l.item.key, l.currentPrice, l.currentStock);
  }

  goProducts(): void {
    this.router.navigate(['/products']);
  }

  checkout(): void {
    if (!this.selectedLines().length || this.blocking().length) return;
    // CustomerGuard ở /checkout tự chuyển sang đăng nhập (returnUrl=/checkout)
    this.router.navigate(['/checkout']);
  }

  private applyVariant(l: CartLine, color: string, size: string | null): void {
    const v = l.product ? this.ps.findVariant(l.product, color, size) : undefined;
    if (v && l.product) this.cart.changeVariant(l.item.key, v, l.product.img_display);
  }
}
