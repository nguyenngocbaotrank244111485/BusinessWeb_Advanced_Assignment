import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { LISTING_STATUS_LABELS, Listing, ListingStatus } from '../../models/market.model';
import { Product } from '../../models/product.model';
import { AuthService } from '../../services/auth-service';
import { MarketService } from '../../services/market-service';
import { ProductService } from '../../services/product-service';
import { BadgeTone } from '../../shared/status-badge/status-badge';

type Filter = 'ALL' | ListingStatus;

/** C20 – Tin đăng của tôi: /market/my-listings (AuthGuard). Seller = Customer đã đăng nhập. */
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

  readonly labels = LISTING_STATUS_LABELS;
  readonly tones: Record<ListingStatus, BadgeTone> = {
    DRAFT: 'neutral', PENDING_REVIEW: 'warning', APPROVED: 'success', REJECTED: 'danger', UNLISTED: 'neutral',
  };
  readonly filters: { value: Filter; label: string }[] = [
    { value: 'ALL', label: 'Tất cả' },
    { value: 'PENDING_REVIEW', label: 'Chờ duyệt' },
    { value: 'APPROVED', label: 'Đã duyệt' },
    { value: 'REJECTED', label: 'Bị từ chối' },
    { value: 'UNLISTED', label: 'Đã gỡ' },
  ];

  private readonly products = toSignal(this.ps.getActiveProducts(), { initialValue: [] as Product[] });
  readonly filter = signal<Filter>('ALL');
  /** Tin đang chờ xác nhận gỡ (xác nhận ngay trên dòng, không dùng confirm()) */
  readonly confirmUnlist = signal<string | null>(null);
  readonly toast = signal('');
  private toastTimer?: ReturnType<typeof setTimeout>;

  readonly mine = computed(() => this.market.myListings(this.auth.user()?._id ?? ''));
  readonly visible = computed(() => (this.filter() === 'ALL' ? this.mine() : this.mine().filter((l) => l.status === this.filter())));
  readonly sellableCount = computed(() => this.market.sellableDesigns(this.auth.user()?._id ?? '').length);

  constructor() {
    const saved = inject(ActivatedRoute).snapshot.queryParamMap.get('saved');
    if (saved) this.showToast(saved === 'new' ? 'Đã gửi tin đăng, chờ PrintiFy duyệt nhé!' : 'Đã lưu thay đổi, tin được gửi duyệt lại.');
  }

  count(f: Filter): number {
    return f === 'ALL' ? this.mine().length : this.mine().filter((l) => l.status === f).length;
  }

  product(l: Listing): Product | undefined {
    return this.products().find((p) => p._id === l.productId);
  }

  canEdit(l: Listing): boolean { return l.status !== 'UNLISTED'; }
  canUnlist(l: Listing): boolean { return l.status === 'PENDING_REVIEW' || l.status === 'APPROVED'; }

  unlist(l: Listing): void {
    this.market.unlist(l._id, this.auth.user()!._id);
    this.confirmUnlist.set(null);
    this.showToast(`Đã gỡ “${l.title}” khỏi Marketplace.`);
  }

  newListing(): void { this.router.navigate(['/market/my-listings/new']); }

  private showToast(text: string): void {
    clearTimeout(this.toastTimer);
    this.toast.set(text);
    this.toastTimer = setTimeout(() => this.toast.set(''), 3500);
  }
}
