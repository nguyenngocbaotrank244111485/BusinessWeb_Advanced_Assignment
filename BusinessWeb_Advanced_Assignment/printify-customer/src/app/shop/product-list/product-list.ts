import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Category, Product } from '../../models/product.model';
import { ProductService } from '../../services/product-service';
import { PriceRange } from '../components/filter-bar/filter-bar';

type SortKey = 'newest' | 'price-asc' | 'price-desc' | 'name';

/** Danh sách sản phẩm /products?category=&q=&min=&max=&sort=&page= (bộ lọc đồng bộ query params – Ch.IV 4.3.4) */
@Component({
  selector: 'app-product-list',
  standalone: false,
  templateUrl: './product-list.html',
  styleUrl: './product-list.css',
})
export class ProductList {
  private readonly ps = inject(ProductService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly pageSize = 12;
  readonly sortOptions: { value: SortKey; label: string }[] = [
    { value: 'newest', label: 'Mới nhất' },
    { value: 'price-asc', label: 'Giá thấp → cao' },
    { value: 'price-desc', label: 'Giá cao → thấp' },
    { value: 'name', label: 'Tên A → Z' },
  ];

  readonly products = signal<Product[]>([]);
  readonly categories = signal<Category[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');

  // Bộ lọc – đọc từ URL
  readonly category = signal('');
  readonly keyword = signal('');
  readonly minPrice = signal<number | null>(null);
  readonly maxPrice = signal<number | null>(null);
  readonly sort = signal<SortKey>('newest');
  readonly page = signal(1);
  /** Bị chuyển về từ trang chi tiết với slug sai / sản phẩm ngừng bán */
  readonly notFound = signal('');

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
  readonly hasFilter = computed(
    () => !!(this.category() || this.keyword() || this.minPrice() != null || this.maxPrice() != null),
  );

  constructor() {
    const destroyRef = inject(DestroyRef);

    this.ps.getActiveProducts().pipe(takeUntilDestroyed(destroyRef)).subscribe({
      next: (list) => { this.products.set(list); this.loading.set(false); },
      error: () => { this.error.set('Không tải được danh sách sản phẩm. Vui lòng thử lại.'); this.loading.set(false); },
    });
    this.ps.getCategories().pipe(takeUntilDestroyed(destroyRef)).subscribe((c) => this.categories.set(c));

    this.route.queryParamMap.pipe(takeUntilDestroyed(destroyRef)).subscribe((q) => {
      this.category.set(q.get('category') ?? '');
      this.keyword.set(q.get('q') ?? '');
      this.minPrice.set(this.toNumber(q.get('min')));
      this.maxPrice.set(this.toNumber(q.get('max')));
      this.sort.set((q.get('sort') as SortKey) || 'newest');
      this.page.set(Number(q.get('page')) || 1);
      this.notFound.set(q.get('notfound') ?? '');
    });
  }

  onSearch(q: string): void { this.updateQuery({ q: q || null, page: null, notfound: null }); }
  onCategory(slug: string): void { this.updateQuery({ category: slug || null, page: null, notfound: null }); }
  onPrice(r: PriceRange): void { this.updateQuery({ min: r.min, max: r.max, page: null, notfound: null }); }
  onSort(value: string): void { this.updateQuery({ sort: value === 'newest' ? null : value, page: null }); }
  onPage(p: number): void {
    this.updateQuery({ page: p > 1 ? p : null });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  clearFilters(): void { this.router.navigate([], { relativeTo: this.route, queryParams: {} }); }

  private updateQuery(params: Record<string, string | number | null>): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: params, queryParamsHandling: 'merge' });
  }

  private toNumber(v: string | null): number | null {
    if (v == null || v.trim() === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
}
