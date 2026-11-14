import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { DesignService } from '../../services/design-service';
import { MarketService } from '../../services/market-service';
import { ProductService } from '../../services/product-service';
import { AuthService } from '../../services/auth-service';
import { CartService } from '../../services/cart-service';
import { DesignDoc } from '../../models/design.model';
import { LISTING_STATUS_LABELS, Listing } from '../../models/market.model';
import { Product } from '../../models/product.model';

/** Nguồn thiết kế: tự thiết kế hay dựng từ tin Marketplace đã mua */
type Source = '' | 'mine' | 'market';
/** Thứ tự theo ngày cập nhật */
type Order = 'newest' | 'oldest';

interface DesignCard {
  doc: DesignDoc;
  product?: Product;
  productName: string;
  /** Thiết kế dựng từ tin Marketplace đã mua -> không được đăng bán lại */
  bought: boolean;
  /** Tin đăng bán của chính mình (nếu có, bỏ qua tin đã gỡ) */
  listing?: Listing;
  twoSided: boolean;
  updatedAt: string;
}

/**
 * C11 – Thiết kế của tôi (/account/designs)
 * Chỉ thiết kế của khách đang đăng nhập. Sửa (EDIT) | Tạo bản sao (cùng sản phẩm) | Đăng bán (C21).
 */
@Component({
  selector: 'app-designs-page',
  standalone: false,
  templateUrl: './designs-page.html',
  styleUrl: './designs-page.css',
})
export class DesignsPage {
  private readonly designs = inject(DesignService);
  private readonly market = inject(MarketService);
  readonly ps = inject(ProductService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly cart = inject(CartService);

  /** Thiết kế đang chờ xác nhận xóa */
  readonly confirmDelete = signal<DesignCard | null>(null);

  readonly statusLabels = LISTING_STATUS_LABELS;
  private readonly products = toSignal(this.ps.getProducts(), { initialValue: [] as Product[] });
  private readonly ready = toSignal(this.designs.ready$, { initialValue: undefined });

  readonly query = signal('');
  readonly productFilter = signal('');
  readonly source = signal<Source>('');
  readonly order = signal<Order>('newest');
  readonly toast = signal<{ type: 'ok' | 'error'; text: string } | null>(null);
  private toastTimer?: ReturnType<typeof setTimeout>;

  readonly loading = computed(() => this.ready() === undefined && !this.designs.designs().length);

  readonly cards = computed<DesignCard[]>(() => {
    const me = this.auth.user()?._id ?? '';
    const products = this.products();
    const mine = this.market.listings().filter((l) => l.sellerId === me && l.status !== 'UNLISTED');
    return this.designs.byUser(me).map((doc) => {
      const product = products.find((p) => p._id === doc.productId);
      const ownListing = mine.find((l) => l.designId === doc._id);
      return {
        doc,
        product,
        productName: product?.name ?? doc.productId,
        bought: !!doc.listingId && doc.listingId !== ownListing?._id,
        listing: ownListing,
        twoSided: !!doc.sides?.back?.canvasJSON?.objects?.length,
        updatedAt: doc.updatedAt ?? doc.createdAt,
      };
    });
  });

  /** Sản phẩm có trong thiết kế của mình (cho bộ lọc) */
  readonly productOptions = computed(() => {
    const map = new Map<string, string>();
    this.cards().forEach((c) => map.set(c.doc.productId, c.productName));
    return [...map].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'vi'));
  });

  readonly visible = computed(() => {
    const q = this.normalize(this.query());
    const pf = this.productFilter();
    const src = this.source();
    const list = this.cards().filter(
      (c) =>
        (!pf || c.doc.productId === pf) &&
        (!src || (src === 'market') === c.bought) &&
        (!q || this.normalize(`${c.productName} ${c.doc._id} ${c.listing?.title ?? ''}`).includes(q)),
    );
    const dir = this.order() === 'newest' ? -1 : 1;
    return list.sort((a, b) => dir * a.updatedAt.localeCompare(b.updatedAt));
  });

  /** Số thiết kế theo nguồn (hiện trong ô lọc) */
  readonly sourceCounts = computed(() => {
    const all = this.cards();
    const market = all.filter((c) => c.bought).length;
    return { all: all.length, mine: all.length - market, market };
  });

  edit(c: DesignCard): void {
    void this.router.navigate(['/editor/designs', c.doc._id]);
  }

  /** Tạo bản sao: designId mới, cùng sản phẩm, rồi mở editor */
  async duplicate(c: DesignCard): Promise<void> {
    const copy = await this.designs.copy(c.doc._id, this.auth.user()?._id ?? '');
    if (!copy) return this.showToast('error', 'Không tạo được bản sao.');
    void this.router.navigate(['/editor/designs', copy._id]);
  }

  /** Tin đang bán / chờ duyệt thì phải gỡ tin trước khi xóa thiết kế */
  blocksDelete(c: DesignCard): boolean {
    return !!c.listing && (c.listing.status === 'APPROVED' || c.listing.status === 'PENDING_REVIEW');
  }

  cartLines(c: DesignCard): number {
    return this.cart.linesWithDesign(c.doc._id);
  }

  askDelete(c: DesignCard): void {
    this.confirmDelete.set(c);
  }

  async doDelete(): Promise<void> {
    const c = this.confirmDelete();
    this.confirmDelete.set(null);
    if (!c || this.blocksDelete(c)) return;
    if (!(await this.designs.remove(c.doc._id, this.auth.user()?._id ?? ''))) {
      return this.showToast('error', 'Không xóa được thiết kế. Vui lòng thử lại.');
    }
    const removed = this.cart.removeByDesign(c.doc._id);
    this.showToast('ok', removed ? `Đã xóa thiết kế và ${removed} sản phẩm dùng thiết kế này trong giỏ.` : 'Đã xóa thiết kế.');
  }

  sell(c: DesignCard): void {
    if (c.listing) {
      void this.router.navigate(['/market/my-listings']);
      return;
    }
    void this.router.navigate(['/market/my-listings/new'], { queryParams: { designId: c.doc._id } });
  }

  viewProduct(c: DesignCard): void {
    if (c.product) void this.router.navigate(['/products', c.product.slug]);
  }

  clearFilters(): void {
    this.query.set('');
    this.productFilter.set('');
    this.source.set('');
  }

  imgFallback(e: Event, c: DesignCard): void {
    const img = e.target as HTMLImageElement;
    const alt = c.product?.img_display;
    if (alt && !img.src.endsWith(alt)) img.src = alt;
  }

  private normalize(s: string): string {
    return s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/gi, 'd')
      .toLowerCase()
      .trim();
  }

  private showToast(type: 'ok' | 'error', text: string): void {
    clearTimeout(this.toastTimer);
    this.toast.set({ type, text });
    this.toastTimer = setTimeout(() => this.toast.set(null), 3500);
  }
}
