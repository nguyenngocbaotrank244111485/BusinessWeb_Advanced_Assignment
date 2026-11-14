import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { Category, Product } from '../models/product.model';
import { ProductService } from '../services/product-service';

type SortKey = 'newest' | 'price-asc' | 'price-desc' | 'name';

/** S02 – Danh sách sản phẩm: /products?category=&q=&min=&max=&sort=&page= */
@Component({
  selector: 'app-product-list',
  standalone: false,
  templateUrl: './product-list.html',
  styleUrl: './product-list.css',
})
export class ProductList {
  readonly ps = inject(ProductService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly pageSize = 8;
  readonly sortOptions: { value: SortKey; label: string }[] = [
    { value: 'newest', label: 'Mới nhất' },
    { value: 'price-asc', label: 'Giá thấp → cao' },
    { value: 'price-desc', label: 'Giá cao → thấp' },
    { value: 'name', label: 'Tên A → Z' },
  ];

  // ----- dữ liệu -----
  readonly products = signal<Product[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');

  // ----- bộ lọc (đồng bộ với query params) -----
  readonly category = signal('');
  readonly keyword = signal('');
  readonly minPrice = signal<number | null>(null);
  readonly maxPrice = signal<number | null>(null);
  readonly sort = signal<SortKey>('newest');
  readonly page = signal(1);
  /** Bị chuyển về từ trang chi tiết với mã sản phẩm không tồn tại */
  readonly notFoundId = signal('');

  /** Kết quả sau khi lọc + sắp xếp */
  readonly filtered = computed(() => {
    const list = this.ps.filterProducts(this.products(), {
      keyword: this.keyword(),
      category: this.category(),
      minPrice: this.minPrice(),
      maxPrice: this.maxPrice(),
    });
    const sorted = [...list];
    switch (this.sort()) {
      case 'price-asc': sorted.sort((a, b) => a.price - b.price); break;
      case 'price-desc': sorted.sort((a, b) => b.price - a.price); break;
      case 'name': sorted.sort((a, b) => a.name.localeCompare(b.name, 'vi')); break;
      default: sorted.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
    }
    return sorted;
  });

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize)));
  readonly paged = computed(() => {
    const start = (Math.min(this.page(), this.totalPages()) - 1) * this.pageSize;
    return this.filtered().slice(start, start + this.pageSize);
  });
  readonly pages = computed(() => Array.from({ length: this.totalPages() }, (_, i) => i + 1));
  readonly hasFilter = computed(
    () => !!(this.category() || this.keyword() || this.minPrice() != null || this.maxPrice() != null),
  );

  /** Ô tìm kiếm: chờ 300ms sau khi ngừng gõ mới lọc */
  private readonly search$ = new Subject<string>();

  constructor() {
    const destroyRef = inject(DestroyRef);

    this.ps.getActiveProducts().pipe(takeUntilDestroyed(destroyRef)).subscribe({
      next: (list) => { this.products.set(list); this.loading.set(false); },
      error: () => { this.error.set('Không tải được danh sách sản phẩm. Vui lòng thử lại.'); this.loading.set(false); },
    });
    this.ps.getCategories().pipe(takeUntilDestroyed(destroyRef)).subscribe((c) => this.categories.set(c));

    // Đọc bộ lọc từ URL (bấm Back vẫn giữ trạng thái)
    this.route.queryParamMap.pipe(takeUntilDestroyed(destroyRef)).subscribe((q) => {
      this.category.set(q.get('category') ?? '');
      this.keyword.set(q.get('q') ?? '');
      this.minPrice.set(this.toNumber(q.get('min')));
      this.maxPrice.set(this.toNumber(q.get('max')));
      this.sort.set((q.get('sort') as SortKey) || 'newest');
      this.page.set(Number(q.get('page')) || 1);
      this.notFoundId.set(q.get('notfound') ?? '');
    });

    this.search$
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(destroyRef))
      .subscribe((q) => this.updateQuery({ q: q.trim() || null, page: null }));
  }

  // ----- thao tác của người dùng -----
  onSearch(value: string): void { this.search$.next(value); }
  selectCategory(slug: string): void { this.updateQuery({ category: slug || null, page: null }); }
  onSort(value: string): void { this.updateQuery({ sort: value === 'newest' ? null : value, page: null }); }
  goPage(p: number): void {
    this.updateQuery({ page: p > 1 ? p : null });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  applyPrice(min: string, max: string): void {
    let lo = this.toNumber(min);
    let hi = this.toNumber(max);
    if (lo != null && hi != null && lo > hi) [lo, hi] = [hi, lo];
    this.updateQuery({ min: lo, max: hi, page: null });
  }

  clearFilters(): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: {} });
  }

  stockLeft(p: Product): number { return this.ps.totalStock(p); }

  private updateQuery(params: Record<string, string | number | null>): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: params, queryParamsHandling: 'merge' });
  }

  private toNumber(v: string | null): number | null {
    if (v == null || v === '') return null;
    const n = Number(String(v).replace(/[^\d]/g, ''));
    return Number.isFinite(n) && String(v).trim() !== '' ? n : null;
  }
}
