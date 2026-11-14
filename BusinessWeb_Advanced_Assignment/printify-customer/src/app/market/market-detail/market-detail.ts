import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { LISTING_STATUS_LABELS, Listing } from '../../models/market.model';
import { PrintArea, Product } from '../../models/product.model';
import { PublicUser } from '../../models/user.model';
import { AuthService } from '../../services/auth-service';
import { CartService } from '../../services/cart-service';
import { MarketService } from '../../services/market-service';
import { ProductService } from '../../services/product-service';
import { ReportPayload } from '../report-dialog/report-dialog';

/**
 * C06 – Chi tiết thiết kế Marketplace: /market/:listingId
 * Người mua xem thiết kế in thử trên nhiều sản phẩm (mockup) và chọn sản phẩm muốn in.
 */
@Component({
  selector: 'app-market-detail',
  standalone: false,
  templateUrl: './market-detail.html',
  styleUrl: './market-detail.css',
})
export class MarketDetail {
  readonly market = inject(MarketService);
  readonly auth = inject(AuthService);
  readonly ps = inject(ProductService);
  private readonly cart = inject(CartService);
  private readonly router = inject(Router);

  readonly statusLabels = LISTING_STATUS_LABELS;
  private readonly id = toSignal(inject(ActivatedRoute).paramMap.pipe(map((m) => m.get('listingId') ?? '')), { initialValue: '' });
  private readonly products = toSignal(this.ps.getActiveProducts(), { initialValue: [] as Product[] });
  private readonly users = toSignal(this.auth.users$, { initialValue: [] as PublicUser[] });

  readonly showReport = signal(false);
  /** true = xem ảnh thiết kế gốc (watermark), false = xem trên sản phẩm */
  readonly showDesign = signal(false);
  readonly selectedId = signal('');
  readonly category = signal('');
  readonly toast = signal<{ type: 'ok' | 'error'; text: string } | null>(null);
  private toastTimer?: ReturnType<typeof setTimeout>;

  readonly listing = computed<Listing | undefined>(() => this.market.getListing(this.id()));
  readonly isOwner = computed(() => !!this.listing() && this.auth.user()?._id === this.listing()!.sellerId);
  /** Tin chưa duyệt chỉ người đăng xem được (xem trước) */
  readonly visible = computed(() => !!this.listing() && (this.listing()!.status === 'APPROVED' || this.isOwner()));
  readonly sellerName = computed(() => this.users().find((u) => u._id === this.listing()?.sellerId)?.name ?? 'Người dùng PrintiFy');
  readonly feePercent = computed(() => Math.round(this.market.feeRate() * 100));
  readonly soldCount = computed(() => (this.listing() ? this.market.salesOf(this.listing()!._id).length : 0));

  /** Sản phẩm in được thiết kế này */
  readonly printable = computed(() => this.market.mockupProducts(this.products(), this.listing()?.productId));
  readonly categories = computed(() => [...new Set(this.printable().map((p) => p.category))]);
  readonly shownProducts = computed(() =>
    this.category() ? this.printable().filter((p) => p.category === this.category()) : this.printable(),
  );
  readonly selected = computed(() => this.printable().find((p) => p._id === this.selectedId()) ?? this.printable()[0]);
  readonly estimate = computed(() => (this.selected()?.price ?? 0) + (this.listing()?.buyerDesignFee ?? 0));

  readonly moreDesigns = computed(() => {
    const l = this.listing();
    if (!l) return [];
    const others = this.market.approved().filter((x) => x._id !== l._id);
    return [...others.filter((x) => x.sellerId === l.sellerId), ...others.filter((x) => x.sellerId !== l.sellerId)].slice(0, 4);
  });

  constructor() {
    // Dữ liệu tải xong mà không có tin (hoặc tin chưa duyệt của người khác) -> về danh sách kèm thông báo
    effect(() => {
      if (this.market.loaded() && !this.visible()) {
        const id = this.id();
        untracked(() => this.router.navigate(['/market'], { queryParams: { notfound: id }, replaceUrl: true }));
      }
    });
    // Đổi sang tin khác -> chọn lại sản phẩm mặc định
    effect(() => {
      this.id();
      untracked(() => { this.selectedId.set(''); this.category.set(''); this.showDesign.set(false); });
    });
  }

  areaOf(p: Product): PrintArea {
    return this.market.printAreaOf(p)!;
  }

  sellerOf(l: Listing): string {
    return this.users().find((u) => u._id === l.sellerId)?.name ?? '';
  }

  pick(p: Product): void {
    this.selectedId.set(p._id);
    this.showDesign.set(false);
  }

  /** "Dùng thiết kế": cần đăng nhập, mở Editor với sản phẩm đã chọn + listingId */
  useDesign(): void {
    const l = this.listing();
    const p = this.selected();
    if (!l || !p || this.isOwner()) return;
    if (!this.auth.isLoggedIn()) {
      this.router.navigate(['/auth/login'], { queryParams: { returnUrl: this.router.url } });
      return;
    }
    this.router.navigate(['/editor', p._id], { queryParams: { listingId: l._id } });
  }

  /** Thêm vào giỏ bản đặt thiết kế mặc định (đổi màu/size trong giỏ; chỉnh vị trí ở Editor sau) */
  addToCart(): void {
    const l = this.listing();
    const p = this.selected();
    if (!l || !p || this.isOwner()) return;
    if (!this.auth.isLoggedIn()) {
      this.router.navigate(['/auth/login'], { queryParams: { returnUrl: this.router.url } });
      return;
    }
    const v = p.variants.find((x) => x.stock > 0);
    if (!v) return this.showToast('error', `${p.name} đang hết hàng, bạn chọn sản phẩm khác nhé.`);
    const ok = this.cart.addWithListing(p, v, l, this.market.artUrl(l.designId));
    this.showToast(ok ? 'ok' : 'error', ok ? `Đã thêm ${p.name} in “${l.title}” vào giỏ!` : 'Số lượng trong giỏ đã đạt tối đa tồn kho.');
  }

  openReport(): void {
    if (!this.auth.isLoggedIn()) {
      this.router.navigate(['/auth/login'], { queryParams: { returnUrl: this.router.url } });
      return;
    }
    if (this.market.hasReported(this.listing()!._id, this.auth.user()!._id)) {
      this.showToast('error', 'Bạn đã báo cáo thiết kế này rồi, nhóm kiểm duyệt đang xem xét.');
      return;
    }
    this.showReport.set(true);
  }

  onReport(payload: ReportPayload): void {
    this.market.report(this.listing()!._id, this.auth.user()!._id, payload.reason, payload.description);
    this.showReport.set(false);
    this.showToast('ok', 'Đã gửi báo cáo. Cảm ơn bạn đã giúp PrintiFy bảo vệ bản quyền!');
  }

  private showToast(type: 'ok' | 'error', text: string): void {
    clearTimeout(this.toastTimer);
    this.toast.set({ type, text });
    this.toastTimer = setTimeout(() => this.toast.set(null), 3500);
  }
}
