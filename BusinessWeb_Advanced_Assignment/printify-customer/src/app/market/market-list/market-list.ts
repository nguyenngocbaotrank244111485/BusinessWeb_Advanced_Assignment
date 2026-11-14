import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { Product } from '../../models/product.model';
import { PublicUser } from '../../models/user.model';
import { AuthService } from '../../services/auth-service';
import { MarketService } from '../../services/market-service';
import { ProductService } from '../../services/product-service';

/** C05 – Marketplace: /market?q=&sort=&page= – chỉ hiện tin đã duyệt */
@Component({
  selector: 'app-market-list',
  standalone: false,
  templateUrl: './market-list.html',
  styleUrl: './market-list.css',
})
export class MarketList {
  readonly market = inject(MarketService);
  private readonly ps = inject(ProductService);
  readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly pageSize = 12;
  readonly products = toSignal(this.ps.getActiveProducts(), { initialValue: [] as Product[] });
  private readonly users = toSignal(this.auth.users$, { initialValue: [] as PublicUser[] });

  readonly sortOptions = [
    { value: 'newest', label: 'Mới nhất' },
    { value: 'price-asc', label: 'Phí thiết kế thấp → cao' },
    { value: 'price-desc', label: 'Phí thiết kế cao → thấp' },
  ];
  readonly keyword = signal('');
  readonly sort = signal('newest');
  /** all = thiết kế của mọi người (C06), mine = thiết kế của tôi đang bán (C20) */
  readonly scope = signal<'all' | 'mine'>('all');
  readonly myId = computed(() => this.auth.user()?._id ?? '');
  readonly myCount = computed(() => this.market.approved().filter((l) => l.sellerId === this.myId()).length);
  readonly page = signal(1);
  readonly notFound = signal('');

  private readonly userMap = computed(() => new Map(this.users().map((u) => [u._id, u.name])));
  /** Mỗi thiết kế in được trên mọi sản phẩm có vùng in */
  readonly printableCount = computed(() => this.market.mockupProducts(this.products()).length);

  readonly filtered = computed(() => {
    const kw = this.normalize(this.keyword());
    const list = this.market.approved().filter((l) => {
      if (this.scope() === 'mine' && l.sellerId !== this.myId()) return false;
      if (!kw) return true;
      const hay = [l.title, l.description, ...l.tags, this.sellerName(l.sellerId)].join(' ');
      return this.normalize(hay).includes(kw);
    });
    if (this.sort() === 'price-asc') return [...list].sort((a, b) => a.buyerDesignFee - b.buyerDesignFee);
    if (this.sort() === 'price-desc') return [...list].sort((a, b) => b.buyerDesignFee - a.buyerDesignFee);
    return list;
  });
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize)));
  readonly paged = computed(() => {
    const start = (Math.min(this.page(), this.totalPages()) - 1) * this.pageSize;
    return this.filtered().slice(start, start + this.pageSize);
  });
  readonly hasFilter = computed(() => !!this.keyword());

  private readonly typed$ = new Subject<string>();

  constructor() {
    const destroyRef = inject(DestroyRef);
    this.route.queryParamMap.pipe(takeUntilDestroyed(destroyRef)).subscribe((q) => {
      this.keyword.set(q.get('q') ?? '');
      this.sort.set(q.get('sort') ?? 'newest');
      this.scope.set(q.get('scope') === 'mine' ? 'mine' : 'all');
      this.page.set(Number(q.get('page')) || 1);
      this.notFound.set(q.get('notfound') ?? '');
    });
    this.typed$
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(destroyRef))
      .subscribe((q) => this.updateQuery({ q: q.trim() || null, page: null, notfound: null }));
  }

  sellerName(id: string): string {
    return this.userMap().get(id) ?? '';
  }

  onType(value: string): void { this.typed$.next(value); }
  onScope(scope: 'all' | 'mine'): void { this.updateQuery({ scope: scope === 'mine' ? 'mine' : null, page: null, notfound: null }); }
  onSort(value: string): void { this.updateQuery({ sort: value === 'newest' ? null : value, page: null }); }
  onPage(p: number): void {
    this.updateQuery({ page: p > 1 ? p : null });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  goMine(): void { this.router.navigate(['/market/my-listings']); }
  clearFilters(): void { this.router.navigate([], { relativeTo: this.route, queryParams: {} }); }

  private updateQuery(params: Record<string, string | number | null>): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: params, queryParamsHandling: 'merge' });
  }

  private normalize(s: string): string {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();
  }
}
