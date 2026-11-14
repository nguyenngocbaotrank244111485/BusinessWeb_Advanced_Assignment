import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { AuthService } from './auth-service';
import { ApiStatusService } from './api-status-service';
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
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly api = inject(ApiStatusService);
  private readonly _items = signal<CartItem[]>(this.load());
  /** Đồng bộ lên server: khách đã đăng nhập thì giỏ lưu trong MongoDB (PUT /api/cart) */
  private syncTimer?: ReturnType<typeof setTimeout>;
  private pending: Promise<void> = Promise.resolve();
  private acceptKeys = new Set<string>();
  private owner: string | null = null;

  constructor() {
    // đăng nhập: lấy giỏ trên server, gộp giỏ vãng lai rồi lưu lại; đăng xuất: giỏ trống
    effect(() => {
      const id = this.auth.user()?._id ?? null;
      untracked(() => this.onUser(id));
    });
  }

  /** Tải lại giỏ từ server (giá / tồn kho mới) */
  reload(): void {
    this.onUser(this.auth.user()?._id ?? null);
  }

  /** Chờ giỏ lưu xong lên server (gọi trước khi đặt hàng) */
  async flush(): Promise<void> {
    if (this.syncTimer) {
      clearTimeout(this.syncTimer);
      this.syncTimer = undefined;
      this.pending = this.push();
    }
    await this.pending;
  }

  readonly items = this._items.asReadonly();
  /** Tổng số lượng (hiện trên icon giỏ) */
  readonly count = computed(() => this._items().reduce((n, i) => n + i.quantity, 0));
  readonly selectedItems = computed(() => this._items().filter((i) => i.selected));

  /** 1 dòng = sản phẩm + biến thể + thiết kế (Editor) hoặc tin Marketplace */
  static keyOf(productId: string, variantId: string, listingId?: string | null, designId?: string | null): string {
    return [productId, variantId, designId || listingId || ''].join('__');
  }

  quantityInCart(productId: string, variantId: string, listingId?: string | null, designId?: string | null): number {
    return this._items().find((i) => i.key === CartService.keyOf(productId, variantId, listingId, designId))?.quantity ?? 0;
  }

  /** Thêm sản phẩm thô. Trả về false nếu vượt tồn kho. */
  add(product: Product, variant: ProductVariant, quantity = 1): boolean {
    return this.addLine(product, variant, quantity, null);
  }

  /** Thêm sản phẩm in thiết kế Marketplace (bản đặt mặc định, chỉnh trong Editor sau) */
  addWithListing(product: Product, variant: ProductVariant, listing: Listing, artUrl: string, quantity = 1): boolean {
    return this.addLine(product, variant, quantity, listing, artUrl);
  }

  /**
   * Thêm sản phẩm đã thiết kế (C10). Mỗi thiết kế là 1 dòng riêng;
   * thêm lại cùng thiết kế + biến thể thì cập nhật số lượng và ảnh xem trước.
   */
  addDesigned(
    product: Product,
    variant: ProductVariant,
    quantity: number,
    design: { designId: string; previewUrl: string; listingId?: string | null; listingTitle?: string; designFee?: number },
  ): boolean {
    if (quantity < 1 || quantity > variant.stock) return false;
    const key = CartService.keyOf(product._id, variant._id, design.listingId, design.designId);
    const item: CartItem = {
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
      imageUrl: design.previewUrl || variant.imageUrl || product.img_display,
      stock: variant.stock,
      designId: design.designId,
      listingId: design.listingId ?? null,
      listingTitle: design.listingTitle,
      designFee: design.designFee ?? 0,
      selected: true,
      addedAt: new Date().toISOString(),
    };
    this.save([item, ...this._items().filter((i) => i.key !== key)]);
    return true;
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
    const newKey = CartService.keyOf(old.productId, variant._id, old.listingId, old.designId);
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

  /** Bỏ mọi dòng giỏ gắn với 1 thiết kế (khi thiết kế bị xóa). Trả về số dòng đã bỏ */
  removeByDesign(designId: string): number {
    const before = this._items().length;
    this.save(this._items().filter((i) => i.designId !== designId));
    return before - this._items().length;
  }

  /** Số dòng giỏ đang dùng 1 thiết kế */
  linesWithDesign(designId: string): number {
    return this._items().filter((i) => i.designId === designId).length;
  }

  setAllSelected(selected: boolean): void {
    this.save(this._items().map((i) => ({ ...i, selected })));
  }

  /** Cập nhật giá/tồn kho snapshot theo dữ liệu mới (người dùng đồng ý giá mới) */
  acceptLatest(key: string, unitPrice: number, stock: number): void {
    this.acceptKeys.add(key);
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
    const key = CartService.keyOf(product._id, variant._id, listing?._id, null);
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
        designId: null, // dòng Marketplace: in thiết kế của người bán qua listingId
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
    this.writeLocal(list);
    if (this.owner) {
      clearTimeout(this.syncTimer);
      this.syncTimer = setTimeout(() => {
        this.syncTimer = undefined;
        this.pending = this.push();
      }, 300);
    }
  }

  private writeLocal(list: CartItem[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ owner: this.owner, items: list }));
    } catch {
      /* trình duyệt chặn localStorage */
    }
  }

  /** Gửi cả giỏ, server kiểm tra từng dòng rồi trả giỏ chuẩn */
  private async push(): Promise<void> {
    const accept = this.acceptKeys;
    this.acceptKeys = new Set();
    const body = { items: this._items().map((i) => ({ productId: i.productId, variantId: i.variantId, qty: i.quantity, selected: i.selected,
      designId: i.designId, listingId: i.listingId ?? null, acceptPrice: accept.has(i.key) || undefined })) };
    try {
      const r = await new Promise<{ items: ServerLine[] }>((ok, fail) => this.http.put<{ items: ServerLine[] }>('/api/cart', body, { withCredentials: true }).subscribe({ next: ok, error: fail }));
      this.applyServer(r.items, body.items.length);
    } catch (e) {
      this.api.report(e, 'Không lưu được giỏ hàng.');
    }
  }

  private applyServer(lines: ServerLine[], sent: number): void {
    const local = new Map(this._items().map((i) => [i.key, i]));
    const list = lines.map((l) => {
      const key = CartService.keyOf(l.productId, l.variantId, l.listingId, l.designId);
      const old = local.get(key);
      return {
        key, productId: l.productId, variantId: l.variantId, name: l.name || old?.name || '', slug: l.slug, category: l.category, color: l.color, size: l.size,
        unitPrice: l.unitPrice, quantity: l.qty, imageUrl: old?.imageUrl || resolve(l.imageUrl), stock: l.stock, designId: l.designId, listingId: l.listingId,
        listingTitle: l.listingTitle ?? undefined, designFee: l.designFee, designArtUrl: old?.designArtUrl || (l.listingDesignId ? `/uploads/art/${l.listingDesignId}.png` : undefined),
        selected: l.selected, addedAt: l.addedAt,
      } as CartItem;
    });
    if (sent > list.length) this.api.show('Một số sản phẩm không còn hợp lệ (ngừng bán / thiết kế không thuộc bạn) đã được bỏ khỏi giỏ.');
    this._items.set(list);
    this.writeLocal(list);
  }

  private onUser(id: string | null): void {
    if (id === this.owner) return;
    if (!id) {
      this.owner = null;
      this._items.set([]);
      this.writeLocal([]);
      return;
    }
    const guest = this.owner === null ? this._items() : [];
    this.owner = id;
    this.http.get<{ items: ServerLine[] }>('/api/cart', { withCredentials: true }).subscribe({
      next: (r) => {
        this.applyServer(r.items, r.items.length);
        const have = new Set(this._items().map((i) => i.key));
        const extra = guest.filter((g) => !have.has(g.key));
        if (extra.length) this.save([...extra, ...this._items()]); // gộp giỏ vãng lai vào tài khoản
      },
      error: () => undefined, // chưa có server: giữ giỏ trong trình duyệt
    });
  }

  private load(): CartItem[] {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      const list: CartItem[] = Array.isArray(raw) ? raw : raw.items ?? [];
      return list.map((i) => ({ ...i, key: CartService.keyOf(i.productId, i.variantId, i.listingId, i.designId) }));
    } catch {
      return [];
    }
  }
}

interface ServerLine {
  productId: string; variantId: string; designId: string | null; listingId: string | null; qty: number; selected: boolean; unitPrice: number;
  addedAt: string; name: string; slug: string; category: string; color: string; size: string | null; imageUrl: string; stock: number;
  listingTitle: string | null; listingDesignId: string | null; designFee: number;
}

function resolve(path: string): string {
  if (!path || /^(https?:|data:|blob:|\/)/.test(path)) return path;
  return '/dataset/' + path.replace(/^\.?\/+/, '');
}
