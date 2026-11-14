import { Injectable, computed, signal } from '@angular/core';
import { Listing } from '../models/market.model';
import { Product, ProductVariant } from '../models/product.model';

export const MAX_QTY = 999;

/**
 * 1 dòng giỏ hàng. Xác định bởi productId + variantId + designId + listingId.
 * Giai đoạn mock lưu localStorage (Guest = session trình duyệt). Không giữ kho khi thêm giỏ.
 */
export interface CartItem {
  key: string;
  productId: string;
  variantId: string;
  name: string;
  slug?: string;
  category: string;
  color: string;
  size: string | null;
  unitPrice: number; // snapshot giá lúc thêm, để báo khi giá đổi
  quantity: number;
  imageUrl: string;
  stock: number; // snapshot tồn kho lúc thêm
  designId: string | null; // null = sản phẩm thô
  listingId?: string | null; // thiết kế Marketplace
  listingTitle?: string;
  designFee?: number; // phí thiết kế Marketplace, tính 1 lần / dòng
  designArtUrl?: string; // file in để hiện mockup nhỏ
  selected: boolean;
  addedAt: string;
}

const STORAGE_KEY = 'printify_cart';

@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly _items = signal<CartItem[]>(this.load());

  readonly items = this._items.asReadonly();
  /** Tổng số lượng (hiện trên icon giỏ) */
  readonly count = computed(() => this._items().reduce((n, i) => n + i.quantity, 0));
  readonly selectedItems = computed(() => this._items().filter((i) => i.selected));

  static keyOf(productId: string, variantId: string, listingId?: string | null): string {
    return [productId, variantId, listingId || ''].join('__');
  }

  quantityInCart(productId: string, variantId: string, listingId?: string | null): number {
    return this._items().find((i) => i.key === CartService.keyOf(productId, variantId, listingId))?.quantity ?? 0;
  }

  /** Thêm sản phẩm thô. Trả về false nếu vượt tồn kho. */
  add(product: Product, variant: ProductVariant, quantity = 1): boolean {
    return this.addLine(product, variant, quantity, null);
  }

  /** Thêm sản phẩm in thiết kế Marketplace (bản đặt mặc định, chỉnh trong Editor sau) */
  addWithListing(product: Product, variant: ProductVariant, listing: Listing, artUrl: string, quantity = 1): boolean {
    return this.addLine(product, variant, quantity, listing, artUrl);
  }

  updateQuantity(key: string, quantity: number): void {
    this.save(
      this._items().map((i) =>
        i.key === key ? { ...i, quantity: Math.max(1, Math.min(Math.round(quantity) || 1, MAX_QTY, i.stock || MAX_QTY)) } : i,
      ),
    );
  }

  /** Đổi màu / size của 1 dòng; nếu trùng dòng đã có thì gộp số lượng */
  changeVariant(key: string, variant: ProductVariant, imageUrl: string): void {
    const list = [...this._items()];
    const idx = list.findIndex((i) => i.key === key);
    if (idx < 0) return;
    const old = list[idx];
    const newKey = CartService.keyOf(old.productId, variant._id, old.listingId);
    const updated: CartItem = {
      ...old,
      key: newKey,
      variantId: variant._id,
      color: variant.color,
      size: variant.size,
      stock: variant.stock,
      imageUrl: old.listingId ? old.imageUrl : variant.imageUrl || imageUrl,
    };
    const dup = list.findIndex((i, n) => i.key === newKey && n !== idx);
    if (dup >= 0) {
      list[dup] = { ...list[dup], quantity: Math.min(list[dup].quantity + old.quantity, MAX_QTY) };
      list.splice(idx, 1);
    } else {
      list[idx] = updated;
    }
    this.save(list);
  }

  toggleSelected(key: string): void {
    this.save(this._items().map((i) => (i.key === key ? { ...i, selected: !i.selected } : i)));
  }

  setAllSelected(selected: boolean): void {
    this.save(this._items().map((i) => ({ ...i, selected })));
  }

  /** Cập nhật giá/tồn kho snapshot theo dữ liệu mới (người dùng đồng ý giá mới) */
  acceptLatest(key: string, unitPrice: number, stock: number): void {
    this.save(this._items().map((i) => (i.key === key ? { ...i, unitPrice, stock, quantity: Math.min(i.quantity, Math.max(stock, 1)) } : i)));
  }

  /** Hoàn tác xóa: đưa lại đúng dòng cũ lên đầu giỏ */
  restore(item: CartItem): void {
    if (this._items().some((i) => i.key === item.key)) return;
    this.save([item, ...this._items()]);
  }

  remove(key: string): void {
    this.save(this._items().filter((i) => i.key !== key));
  }

  removeMany(keys: string[]): void {
    const set = new Set(keys);
    this.save(this._items().filter((i) => !set.has(i.key)));
  }

  clear(): void {
    this.save([]);
  }

  // ---------- nội bộ ----------

  private addLine(product: Product, variant: ProductVariant, quantity: number, listing: Listing | null, artUrl?: string): boolean {
    const key = CartService.keyOf(product._id, variant._id, listing?._id);
    const list = [...this._items()];
    const existing = list.find((i) => i.key === key);
    const nextQty = (existing?.quantity ?? 0) + quantity;
    if (nextQty > variant.stock || nextQty > MAX_QTY) return false;

    if (existing) {
      existing.quantity = nextQty;
      existing.selected = true;
    } else {
      list.unshift({
        key,
        productId: product._id,
        variantId: variant._id,
        name: product.name,
        slug: product.slug,
        category: product.category,
        color: variant.color,
        size: variant.size,
        unitPrice: product.price,
        quantity,
        imageUrl: variant.imageUrl || product.img_display,
        stock: variant.stock,
        designId: listing?.designId ?? null,
        listingId: listing?._id ?? null,
        listingTitle: listing?.title,
        designFee: listing?.buyerDesignFee ?? 0,
        designArtUrl: artUrl,
        selected: true,
        addedAt: new Date().toISOString(),
      });
    }
    this.save(list);
    return true;
  }

  private save(list: CartItem[]): void {
    this._items.set(list);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch {
      /* trình duyệt chặn localStorage: giỏ vẫn chạy trong phiên hiện tại */
    }
  }

  private load(): CartItem[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const list = raw ? (JSON.parse(raw) as CartItem[]) : [];
      // dữ liệu cũ (trước khi có listingId) -> chuẩn hóa key
      return list.map((i) => ({ ...i, key: CartService.keyOf(i.productId, i.variantId, i.listingId) }));
    } catch {
      return [];
    }
  }
}
