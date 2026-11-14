import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { LISTING_STATUS_LABELS, MyMarketItem, MyMarketStatus } from '../../models/market.model';
import { Product } from '../../models/product.model';
import { AuthService } from '../../services/auth-service';
import { MarketService } from '../../services/market-service';
import { ProductService } from '../../services/product-service';
import { BadgeTone } from '../../shared/status-badge/status-badge';

/** Bộ lọc: theo trạng thái, riêng SOLD = tin có ít nhất 1 lượt bán */
type Filter = 'ALL' | 'SOLD' | MyMarketStatus;

/**
 * C20 – My marketplace: /market/my-listings (AuthGuard)
 * Thiết kế đang chỉnh sửa (nháp) + tin chờ duyệt / đang bán / bị từ chối (kèm lý do) / đã gỡ,
 * kèm số lượt bán và tiền đã nhận. Form đăng / sửa tin là một phần của màn này.
 */
@Component({
  selector: 'app-my-listings',
  standalone: false,
  templateUrl: './my-listings.html',
  styleUrl: './my-listings.css',
})
export class MyListings {
  readonly market = inject(MarketService);
  private readonly auth = inject(AuthService);
  private readonly ps = inject(ProductService);
  private readonly router = inject(Router);

  readonly labels: Record<MyMarketStatus, string> = { ...LISTING_STATUS_LABELS, EDITING: 'Đang chỉnh sửa', APPROVED: 'Đang bán' };
  readonly tones: Record<MyMarketStatus, BadgeTone> = {
    EDITING: 'info', DRAFT: 'info', PENDING_REVIEW: 'warning', APPROVED: 'success', REJECTED: 'danger', UNLISTED: 'neutral',
  };
  readonly filters: { value: Filter; label: string }[] = [
    { value: 'ALL', label: 'Tất cả' },
    { value: 'EDITING', label: 'Đang chỉnh sửa' },
    { value: 'PENDING_REVIEW', label: 'Chờ duyệt' },
    { value: 'APPROVED', label: 'Đang bán' },
    { value: 'SOLD', label: 'Đã bán' },
    { value: 'REJECTED', label: 'Bị từ chối' },
    { value: 'UNLISTED', label: 'Đã gỡ' },
  ];

  private readonly products = toSignal(this.ps.getActiveProducts(), { initialValue: [] as Product[] });
  readonly filter = signal<Filter>('ALL');
  /** Tin đang chờ xác nhận gỡ (xác nhận ngay trên dòng, không dùng confirm()) */
  readonly confirmUnlist = signal<string | null>(null);
  /** Tin đang mở danh sách người mua */
  readonly openSales = signal<string | null>(null);
  readonly toast = signal('');
  private toastTimer?: ReturnType<typeof setTimeout>;

  readonly items = computed(() => this.market.myMarket(this.auth.user()?._id ?? ''));
  readonly visible = computed(() => this.items().filter((i) => this.match(i, this.filter())));
  readonly totalSold = computed(() => this.items().reduce((s, i) => s + i.soldCount, 0));
  readonly totalEarned = computed(() => this.items().reduce((s, i) => s + i.earned, 0));

  constructor() {
    const saved = inject(ActivatedRoute).snapshot.queryParamMap.get('saved');
    if (saved) this.showToast(saved === 'new' ? 'Đã gửi tin đăng, chờ PrintiFy duyệt nhé!' : 'Đã lưu thay đổi, tin được gửi duyệt lại.');
  }

  count(f: Filter): number {
    return this.items().filter((i) => this.match(i, f)).length;
  }

  productName(id?: string): string {
    return this.products().find((p) => p._id === id)?.name ?? '';
  }

  buyerSales(i: MyMarketItem) {
    return i.listing ? this.market.salesOf(i.listing._id) : [];
  }

  canEdit(i: MyMarketItem): boolean { return !!i.listing && i.status !== 'UNLISTED'; }
  canUnlist(i: MyMarketItem): boolean { return i.status === 'PENDING_REVIEW' || i.status === 'APPROVED'; }

  continueEditing(i: MyMarketItem): void {
    if (i.design) this.router.navigate(['/editor/designs', i.design._id]);
  }

  sell(i: MyMarketItem): void {
    this.router.navigate(['/market/my-listings/new'], { queryParams: { designId: i.design?._id } });
  }

  unlist(i: MyMarketItem): void {
    if (!i.listing) return;
    this.market.unlist(i.listing._id, this.auth.user()!._id);
    this.confirmUnlist.set(null);
    this.showToast(`Đã gỡ “${i.listing.title}” khỏi Marketplace.`);
  }

  private match(i: MyMarketItem, f: Filter): boolean {
    if (f === 'ALL') return true;
    if (f === 'SOLD') return i.soldCount > 0;
    return i.status === f;
  }

  private showToast(text: string): void {
    clearTimeout(this.toastTimer);
    this.toast.set(text);
    this.toastTimer = setTimeout(() => this.toast.set(''), 3500);
  }
}
