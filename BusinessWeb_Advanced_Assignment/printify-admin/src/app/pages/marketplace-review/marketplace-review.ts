import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { CopyrightReport } from '../../models/admin.models';
import { LISTING_STATUS } from '../../models/labels';
import { AdminAuthService } from '../../services/admin-auth.service';
import { AdminDataService } from '../../services/admin-data.service';
import { ToastService } from '../../shared/toast.service';

type Ask = { kind: 'REJECT' | 'UNLIST' } | { kind: 'TAKEDOWN' | 'DISMISS'; report: CopyrightReport } | null;

/** D8 – Duyệt tin Marketplace: /admin/marketplace/review/:id (STAFF xem, SUPERADMIN duyệt / gỡ) */
@Component({
  selector: 'app-marketplace-review',
  standalone: false,
  templateUrl: './marketplace-review.html',
  styleUrl: './marketplace-review.css',
})
export class MarketplaceReview {
  readonly data = inject(AdminDataService);
  readonly auth = inject(AdminAuthService);
  private readonly toast = inject(ToastService);
  private readonly router = inject(Router);

  readonly labels = LISTING_STATUS;
  private readonly id = toSignal(inject(ActivatedRoute).paramMap.pipe(map((m) => m.get('id') ?? '')), { initialValue: '' });
  readonly listing = computed(() => this.data.listing(this.id()));
  readonly design = computed(() => this.data.design(this.listing()?.designId));
  readonly product = computed(() => (this.listing() ? this.data.product(this.listing()!.productId) : undefined));
  readonly reports = computed(() => this.data.reports().filter((r) => r.listingId === this.id()).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  readonly openReports = computed(() => this.reports().filter((r) => r.status === 'OPEN'));
  readonly sales = computed(() => this.data.designSales().filter((s) => s.listingId === this.id() && s.status !== 'REVERSED'));
  readonly ask = signal<Ask>(null);
  readonly note = signal('');
  readonly artFailed = signal(false);

  /** File in nền trong suốt (giống Customer); thiếu thì dùng ảnh watermark */
  readonly art = computed(() => (this.artFailed() || !this.listing() ? this.data.img(this.listing()?.watermarkUrl) : `/uploads/art/${this.listing()!.designId}.png`));

  /** Xem thử trên sản phẩm mặc định + 3 sản phẩm khác danh mục có vùng in */
  readonly mockups = computed(() => {
    const l = this.listing();
    if (!l) return [];
    const all = this.data.products().filter((p) => p.isActive && p.allowMarketplace && !!this.data.printAreaOf(p));
    const first = all.filter((p) => p._id === l.productId);
    const seen = new Set(first.map((p) => p.category));
    const others = all.filter((p) => p._id !== l.productId && !seen.has(p.category) && !!seen.add(p.category));
    return [...first, ...others].slice(0, 4).map((p) => ({ p, a: this.data.printAreaOf(p)! }));
  });

  /** Kiểm tra tự động trước khi duyệt */
  readonly checks = computed(() => {
    const l = this.listing(), d = this.design(), p = this.product();
    if (!l) return [];
    return [
      { ok: !!d, text: 'Thiết kế tồn tại trong hệ thống' },
      { ok: !!d && d.userId === l.sellerId, text: 'Thiết kế do chính người bán tạo' },
      { ok: !!d && !d.listingId, text: 'Không phải thiết kế mua lại từ Marketplace' },
      { ok: !!d && d.productId === l.productId, text: 'Sản phẩm của tin khớp sản phẩm của thiết kế' },
      { ok: !!p && p.isActive && p.allowMarketplace, text: 'Sản phẩm đang bán và cho phép Marketplace' },
      { ok: l.sellerPrice >= 10000 && l.sellerPrice <= 2000000, text: 'Giá người bán trong khoảng 10.000đ – 2.000.000đ' },
      { ok: l.acceptedCopyright, text: 'Người bán đã cam kết bản quyền' },
      { ok: this.openReports().length === 0, text: 'Không có báo cáo vi phạm đang mở' },
    ];
  });

  approve(): void {
    this.toast.result(this.data.reviewListing(this.id(), 'APPROVE', ''));
  }

  open(a: Ask): void {
    this.note.set('');
    this.ask.set(a);
  }

  confirm(): void {
    const a = this.ask();
    if (!a) return;
    const r = 'report' in a
      ? this.data.resolveReport(a.report._id, a.kind, this.note())
      : this.data.reviewListing(this.id(), a.kind, this.note());
    if (this.toast.result(r)) this.ask.set(null);
  }

  back(): void {
    this.router.navigate(['/admin/marketplace'], { queryParams: this.listing()?.status === 'PENDING_REVIEW' ? { tab: 'PENDING_REVIEW' } : {} });
  }
}
