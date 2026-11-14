import { Injectable, computed, signal } from '@angular/core';
import { Product, ProductVariant } from '../models/product.model';

/** 1 dòng trong giỏ hàng (giai đoạn mock: lưu ở localStorage của trình duyệt) */
export interface CartItem {
  key: string; // productId + variantId (+ designId sau này)
  productId: string;
  variantId: string;
  name: string;
  category: string;
  color: string;
  size: string | null;
  unitPrice: number;
  quantity: number;
  imageUrl: string;
  stock: number;
  designId: string | null; // null = sản phẩm thô (chưa thiết kế)
  selected: boolean; // tick chọn để đặt hàng
  addedAt: string;
}

const STORAGE_KEY = 'printify_cart';

@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly _items = signal<CartItem[]>(this.load());

  /** Danh sách món trong giỏ (chỉ đọc) */
  readonly items = this._items.asReadonly();

  /** Tổng số lượng (hiện trên icon giỏ) */
  readonly count = computed(() => this._items().reduce((n, i) => n + i.quantity, 0));

  /** Tạm tính các món đã tick (chưa gồm ship, chiết khấu) */
  readonly selectedSubtotal = computed(() =>
    this._items()
      .filter((i) => i.selected)
      .reduce((sum, i) => sum + i.unitPrice * i.quantity, 0),
  );

  /** Số lượng của 1 biến thể sản phẩm thô đang có trong giỏ */
  quantityInCart(productId: string, variantId: string): number {
    return this._items().find((i) => i.key === `${productId}__${variantId}`)?.quantity ?? 0;
  }

  /** Thêm sản phẩm thô vào giỏ. Trả về false nếu vượt tồn kho. */
  add(product: Product, variant: ProductVariant, quantity = 1): boolean {
    const key = `${product._id}__${variant._id}`;
    const list = [...this._items()];
    const existing = list.find((i) => i.key === key);
    const nextQty = (existing?.quantity ?? 0) + quantity;
    if (nextQty > variant.stock) return false;

    if (existing) {
      existing.quantity = nextQty;
    } else {
      list.unshift({
        key,
        productId: product._id,
        variantId: variant._id,
        name: product.name,
        category: product.category,
        color: variant.color,
        size: variant.size,
        unitPrice: product.price,
        quantity,
        imageUrl: variant.imageUrl || product.img_display,
        stock: variant.stock,
        designId: null,
        selected: true,
        addedAt: new Date().toISOString(),
      });
    }
    this.save(list);
    return true;
  }

  updateQuantity(key: string, quantity: number): void {
    this.save(
      this._items().map((i) =>
        i.key === key ? { ...i, quantity: Math.max(1, Math.min(quantity, i.stock)) } : i,
      ),
    );
  }

  toggleSelected(key: string): void {
    this.save(this._items().map((i) => (i.key === key ? { ...i, selected: !i.selected } : i)));
  }

  remove(key: string): void {
    this.save(this._items().filter((i) => i.key !== key));
  }

  clear(): void {
    this.save([]);
  }

  // ---------- nội bộ ----------

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
      return raw ? (JSON.parse(raw) as CartItem[]) : [];
    } catch {
      return [];
    }
  }
}
