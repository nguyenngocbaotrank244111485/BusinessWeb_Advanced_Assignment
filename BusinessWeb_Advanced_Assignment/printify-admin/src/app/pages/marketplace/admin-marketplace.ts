import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { CopyrightReport, Listing, ListingStatus } from '../../models/admin.models';
import { LISTING_STATUS } from '../../models/labels';
import { AdminAuthService } from '../../services/admin-auth.service';
import { AdminDataService } from '../../services/admin-data.service';

type Tab = 'all' | ListingStatus | 'sales' | 'reports';

/** D7 – Marketplace: /admin/marketplace?tab=all|PENDING_REVIEW|APPROVED|REJECTED|UNLISTED|sales|reports */
@Component({
  selector: 'app-admin-marketplace',
  standalone: false,
  templateUrl: './admin-marketplace.html',
  styleUrl: './admin-marketplace.css',
})
export class AdminMarketplace {
  readonly data = inject(AdminDataService);
  readonly auth = inject(AdminAuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly labels = LISTING_STATUS;
  readonly tab = signal<Tab>('all');
  readonly q = signal('');
  readonly reportFilter = signal<'OPEN' | 'all'>('OPEN');

  readonly tabs = computed(() => {
    const ls = this.data.listings();
    const n = (s: ListingStatus) => ls.filter((l) => l.status === s).length;
    return [
      { key: 'all' as Tab, label: 'Tất cả', count: ls.length },
      { key: 'PENDING_REVIEW' as Tab, label: 'Chờ duyệt', count: n('PENDING_REVIEW') },
      { key: 'APPROVED' as Tab, label: 'Đang bán', count: n('APPROVED') },
      { key: 'REJECTED' as Tab, label: 'Bị từ chối', count: n('REJECTED') },
      { key: 'UNLISTED' as Tab, label: 'Đã gỡ', count: n('UNLISTED') },
      { key: 'sales' as Tab, label: 'Doanh số thiết kế', count: this.data.designSales().length },
      { key: 'reports' as Tab, label: 'Báo cáo vi phạm', count: this.data.reports().filter((r) => r.status === 'OPEN').length },
    ];
  });

  private readonly soldMap = computed(() => {
    const m = new Map<string, number>();
    for (const s of this.data.designSales()) if (s.status !== 'REVERSED') m.set(s.listingId, (m.get(s.listingId) ?? 0) + 1);
    return m;
  });
  private readonly reportMap = computed(() => {
    const m = new Map<string, number>();
    for (const r of this.data.reports()) if (r.status === 'OPEN') m.set(r.listingId, (m.get(r.listingId) ?? 0) + 1);
    return m;
  });

  readonly listings = computed(() => {
    const kw = this.q().trim().toLowerCase();
    return this.data.listings()
      .filter((l) => this.tab() === 'all' || l.status === this.tab())
      .filter((l) => !kw || (l.title + ' ' + this.data.userName(l.sellerId) + ' ' + l._id).toLowerCase().includes(kw))
      .sort((a, b) => (b.status === 'PENDING_REVIEW' ? 1 : 0) - (a.status === 'PENDING_REVIEW' ? 1 : 0) || (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt));
  });

  readonly sales = computed(() => this.data.designSales().slice().sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)));
  readonly salesTotal = computed(() => {
    const s = this.sales().filter((x) => x.status !== 'REVERSED');
    return { seller: s.reduce((a, x) => a + x.sellerPrice, 0), fee: s.reduce((a, x) => a + x.platformFee, 0), buyer: s.reduce((a, x) => a + x.buyerDesignFee, 0) };
  });

  /** Báo cáo gộp theo tin, tin nhiều báo cáo đang mở lên đầu */
  readonly reportGroups = computed(() => {
    const groups = new Map<string, CopyrightReport[]>();
    for (const r of this.data.reports()) {
      if (this.reportFilter() === 'OPEN' && r.status !== 'OPEN') continue;
      groups.set(r.listingId, [...(groups.get(r.listingId) ?? []), r]);
    }
    return [...groups.entries()]
      .map(([listingId, reports]) => ({ listing: this.data.listing(listingId), listingId, reports, open: reports.filter((r) => r.status === 'OPEN').length }))
      .sort((a, b) => b.open - a.open);
  });

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe((m) => this.tab.set((m.get('tab') as Tab) || 'all'));
  }

  setTab(t: Tab): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: { tab: t === 'all' ? null : t } });
  }

  open(l: Listing): void {
    this.router.navigate(['/admin/marketplace/review', l._id]);
  }

  sold(id: string): number {
    return this.soldMap().get(id) ?? 0;
  }

  reportsOf(id: string): number {
    return this.reportMap().get(id) ?? 0;
  }

  productName(id: string): string {
    return this.data.product(id)?.name ?? id;
  }
}
