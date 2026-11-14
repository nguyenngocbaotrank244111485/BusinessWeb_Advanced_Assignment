import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Product } from '../../models/admin.models';
import { CATEGORY_LABELS, COLOR_LABELS } from '../../models/labels';
import { AdminAuthService } from '../../services/admin-auth.service';
import { AdminDataService } from '../../services/admin-data.service';
import { ToastService } from '../../shared/toast.service';

/** D3 – Danh sách sản phẩm: /admin/products-list?q=&category=&status=&stock=&page= */
@Component({
  selector: 'app-products-list',
  standalone: false,
  templateUrl: './products-list.html',
  styleUrl: './products-list.css',
})
export class ProductsList {
  readonly data = inject(AdminDataService);
  readonly auth = inject(AdminAuthService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  readonly categories = Object.entries(CATEGORY_LABELS).map(([slug, label]) => ({ slug, label }));
  readonly colorLabels = COLOR_LABELS;
  readonly pageSize = 12;
  readonly q = signal('');
  readonly category = signal('');
  readonly status = signal<'all' | 'active' | 'inactive'>('all');
  readonly stock = signal<'' | 'low' | 'out'>('');
  readonly page = signal(1);
  readonly showCreate = signal(false);

  readonly filtered = computed(() => {
    const kw = this.norm(this.q());
    return this.data.products().filter((p) => {
      if (kw && !this.norm(p.name + ' ' + p._id).includes(kw)) return false;
      if (this.category() && p.category !== this.category()) return false;
      if (this.status() === 'active' && !p.isActive) return false;
      if (this.status() === 'inactive' && p.isActive) return false;
      const lv = this.data.stockLevel(p);
      if (this.stock() === 'low' && lv === 'ok') return false;
      if (this.stock() === 'out' && lv !== 'out') return false;
      return true;
    });
  });
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize)));
  readonly paged = computed(() => {
    const p = Math.min(this.page(), this.totalPages());
    return this.filtered().slice((p - 1) * this.pageSize, p * this.pageSize);
  });

  readonly form: FormGroup = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    category: ['ao-thun', Validators.required],
    price: [100000, [Validators.required, Validators.min(1000)]],
    description: ['', [Validators.required, Validators.minLength(10)]],
    img_display: ['images/products/placeholder.svg', Validators.required],
    lowStockThreshold: [5, [Validators.required, Validators.min(0)]],
    isActive: [true],
    allowCustomization: [true],
    allowMarketplace: [true],
    printX: [0.3, [Validators.min(0), Validators.max(1)]],
    printY: [0.3, [Validators.min(0), Validators.max(1)]],
    printW: [0.4, [Validators.min(0.05), Validators.max(1)]],
    printH: [0.4, [Validators.min(0.05), Validators.max(1)]],
    variants: this.fb.array([this.variantGroup()]),
  });

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe((m) => {
      this.q.set(m.get('q') ?? '');
      this.category.set(m.get('category') ?? '');
      this.status.set((m.get('status') as 'active' | 'inactive') ?? 'all');
      this.stock.set((m.get('stock') as 'low' | 'out') ?? '');
      this.page.set(Number(m.get('page')) || 1);
    });
  }

  get variants(): FormArray {
    return this.form.get('variants') as FormArray;
  }

  variantGroup(): FormGroup {
    return this.fb.nonNullable.group({
      color: ['white', Validators.required],
      size: [''],
      stock: [0, [Validators.required, Validators.min(0)]],
    });
  }

  setFilter(key: string, value: string | null): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: { [key]: value || null, page: null }, queryParamsHandling: 'merge' });
  }

  goPage(p: number): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: { page: p > 1 ? p : null }, queryParamsHandling: 'merge' });
  }

  clear(): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: {} });
  }

  open(p: Product): void {
    this.router.navigate(['/admin/products-detail', p._id]);
  }

  category_(slug: string): string {
    return CATEGORY_LABELS[slug] ?? slug;
  }

  openCreate(): void {
    this.form.reset();
    this.variants.clear();
    this.variants.push(this.variantGroup());
    this.showCreate.set(true);
  }

  create(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.show('Bạn kiểm tra lại các ô đánh dấu đỏ.', false);
      return;
    }
    const v = this.form.getRawValue();
    const next = Math.max(0, ...this.data.products().map((p) => Number(p._id.replace(/\D/g, '')) || 0)) + 1;
    const id = 'prd' + next;
    const product: Product = {
      _id: id, name: v.name.trim(), category: v.category, price: Math.round(v.price), description: v.description.trim(),
      img_display: v.img_display.trim(), img_detail: [], isActive: v.isActive, allowCustomization: v.allowCustomization, allowMarketplace: v.allowMarketplace,
      lowStockThreshold: Math.round(v.lowStockThreshold), printArea: { x: +v.printX, y: +v.printY, width: +v.printW, height: +v.printH },
      variants: (v.variants as { color: string; size: string; stock: number }[]).map((x) => ({
        _id: [id, x.color, x.size].filter(Boolean).join('-').toLowerCase(), color: x.color.trim(), size: x.size.trim() || null, stock: Math.round(x.stock),
      })),
    };
    const dup = new Set<string>();
    if (product.variants.some((x) => dup.size === dup.add(x._id).size)) {
      this.toast.show('Có 2 biến thể trùng màu và size.', false);
      return;
    }
    if (this.toast.result(this.data.createProduct(product))) {
      this.showCreate.set(false);
      this.router.navigate(['/admin/products-detail', id]);
    }
  }

  bad(name: string): boolean {
    const c = this.form.get(name);
    return !!c && c.touched && c.invalid;
  }

  private norm(s: string): string {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();
  }
}
