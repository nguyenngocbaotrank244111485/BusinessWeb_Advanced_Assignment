import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { LISTING_STATUS_LABELS, Listing } from '../../models/market.model';
import { Product } from '../../models/product.model';
import { PublicUser } from '../../models/user.model';
import { AuthService } from '../../services/auth-service';
import { MarketService } from '../../services/market-service';
import { ProductService } from '../../services/product-service';
import { ReportPayload } from '../report-dialog/report-dialog';

/** C06 – Chi tiết thiết kế Marketplace: /market/:listingId */
@Component({
  selector: 'app-market-detail',
  standalone: false,
  templateUrl: './market-detail.html',
  styleUrl: './market-detail.css',
})
export class MarketDetail {
  readonly market = inject(MarketService);
  readonly auth = inject(AuthService);
  private readonly ps = inject(ProductService);
  private readonly router = inject(Router);

  readonly statusLabels = LISTING_STATUS_LABELS;
  private readonly id = toSignal(inject(ActivatedRoute).paramMap.pipe(map((m) => m.get('listingId') ?? '')), { initialValue: '' });
  private readonly products = toSignal(this.ps.getActiveProducts(), { initialValue: [] as Product[] });
  private readonly users = toSignal(this.auth.users$, { initialValue: [] as PublicUser[] });

  readonly showReport = signal(false);
  readonly toast = signal<{ type: 'ok' | 'error'; text: string } | null>(null);
  private toastTimer?: ReturnType<typeof setTimeout>;

  readonly listing = computed<Listing | undefined>(() => this.market.getListing(this.id()));
  readonly isOwner = computed(() => !!this.listing() && this.auth.user()?._id === this.listing()!.sellerId);
  /** Tin chưa duyệt chỉ người đăng xem được (xem trước) */
  readonly visible = computed(() => !!this.listing() && (this.listing()!.status === 'APPROVED' || this.isOwner()));
  readonly product = computed(() => this.products().find((p) => p._id === this.listing()?.productId));
  readonly sellerName = computed(() => this.users().find((u) => u._id === this.listing()?.sellerId)?.name ?? 'Người dùng PrintiFy');
  readonly feePercent = computed(() => Math.round(this.market.feeRate() * 100));
  readonly moreFromProduct = computed(() =>
    this.market.approved().filter((l) => l.productId === this.listing()?.productId && l._id !== this.listing()?._id).slice(0, 4),
  );

  constructor() {
    // Dữ liệu tải xong mà không có tin (hoặc tin chưa duyệt của người khác) -> về danh sách kèm thông báo
    effect(() => {
      if (this.market.loaded() && !this.visible()) {
        const id = this.id();
        untracked(() => this.router.navigate(['/market'], { queryParams: { notfound: id }, replaceUrl: true }));
      }
    });
  }

  sellerOf(l: Listing): string {
    return this.users().find((u) => u._id === l.sellerId)?.name ?? '';
  }

  productOf(l: Listing): Product | undefined {
    return this.products().find((p) => p._id === l.productId);
  }

  /** "Sử dụng thiết kế": cần đăng nhập, mở Editor với sản phẩm cố định + listingId */
  useDesign(): void {
    const l = this.listing();
    if (!l || this.isOwner()) return;
    const target = this.router.createUrlTree(['/editor', l.productId], { queryParams: { listingId: l._id } }).toString();
    if (!this.auth.isLoggedIn()) {
      this.router.navigate(['/auth/login'], { queryParams: { returnUrl: this.router.url } });
      return;
    }
    this.router.navigateByUrl(target);
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
