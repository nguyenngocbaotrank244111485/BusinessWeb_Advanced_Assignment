import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { Product } from '../../models/product.model';
import { PublicUser } from '../../models/user.model';
import { AuthService } from '../../services/auth-service';
import { MarketService } from '../../services/market-service';
import { ProductService } from '../../services/product-service';

/** C05 – Marketplace: /market?q=&productId=&page= – chỉ hiện tin đã duyệt */
@Component({
  selector: 'app-market-list',
  standalone: false,
  templateUrl: './market-list.html',
  styleUrl: './market-list.css',
})
export class MarketList {
  readonly market = inject(MarketService);
  private readonly ps = inject(ProductService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly pageSize = 12;
  readonly products = toSignal(this.ps.getActiveProducts(), { initialValue: [] as Product[] });
  private readonly users = toSignal(this.auth.users$, { initialValue: [] as PublicUser[] });

  readonly keyword = signal('');
  readonly productId = signal('');
  readonly page = signal(1);
  readonly notFound = signal('');

  readonly productMap = computed(() => new Map(this.products().map((p) => [p._id, p])));
  private readonly userMap = computed(() => new Map(this.users().map((u) => [u._id, u.name])));

  /** Chỉ những sản phẩm đang có thiết kế được bán (bộ lọc theo sản phẩm) */
  readonly productOptions = computed(() => {
    const ids = new Set(this.market.approved().map((l) => l.productId));
    return this.products().filter((p) => ids.has(p._id));
  });

  readonly filtered = computed(() => {
    const kw = this.normalize(this.keyword());
    return this.market.approved().filter((l) => {
      if (this.productId() && l.productId !== this.productId()) return false;
      if (!kw) return true;
      const hay = [l.title, l.description, ...l.tags, this.sellerName(l.sellerId), this.productMap().get(l.productId)?.name ?? ''].join(' ');
      return this.normalize(hay).includes(kw);
    });
  });
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize)));
  readonly paged = computed(() => {
    const start = (Math.min(this.page(), this.totalPages()) - 1) * this.pageSize;
    return this.filtered().slice(start, start + this.pageSize);
  });
  readonly hasFilter = computed(() => !!(this.keyword() || this.productId()));

  private readonly typed$ = new Subject<string>();

  constructor() {
    const destroyRef = inject(DestroyRef);
    this.route.queryParamMap.pipe(takeUntilDestroyed(destroyRef)).subscribe((q) => {
      this.keyword.set(q.get('q') ?? '');
      this.productId.set(q.get('productId') ?? '');
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
  onProduct(id: string): void { this.updateQuery({ productId: id || null, page: null, notfound: null }); }
  onPage(p: number): void {
    this.updateQuery({ page: p > 1 ? p : null });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  clearFilters(): void { this.router.navigate([], { relativeTo: this.route, queryParams: {} }); }

  private updateQuery(params: Record<string, string | number | null>): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: params, queryParamsHandling: 'merge' });
  }

  private normalize(s: string): string {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();
  }
}
