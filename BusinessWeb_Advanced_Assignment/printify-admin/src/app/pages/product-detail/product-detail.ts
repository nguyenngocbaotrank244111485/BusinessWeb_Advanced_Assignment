import { Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { PrintArea, ProductVariant } from '../../models/admin.models';
import { CATEGORY_LABELS, COLOR_LABELS, MOVEMENT_LABELS } from '../../models/labels';
import { AdminAuthService } from '../../services/admin-auth.service';
import { AdminDataService } from '../../services/admin-data.service';
import { ToastService } from '../../shared/toast.service';

type Tab = 'info' | 'stock' | 'print' | 'history';

/** D4 – Chi tiết sản phẩm: /admin/products-detail/:id?tab=info|stock|print|history */
@Component({
  selector: 'app-product-detail',
  standalone: false,
  templateUrl: './product-detail.html',
  styleUrl: './product-detail.css',
})
export class ProductDetail {
  readonly data = inject(AdminDataService);
  readonly auth = inject(AdminAuthService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  readonly categories = Object.entries(CATEGORY_LABELS).map(([slug, label]) => ({ slug, label }));
  readonly movementLabels = MOVEMENT_LABELS;
  readonly tabs: { key: Tab; label: string }[] = [
    { key: 'info', label: 'Thông tin' },
    { key: 'stock', label: 'Biến thể & kho' },
    { key: 'print', label: 'Vùng in' },
    { key: 'history', label: 'Lịch sử kho' },
  ];
  private readonly id = toSignal(this.route.paramMap.pipe(map((m) => m.get('id') ?? '')), { initialValue: '' });
  readonly tab = signal<Tab>('info');
  readonly product = computed(() => this.data.product(this.id()));
  readonly history = computed(() => this.data.movements().filter((m) => m.productId === this.id()));
  readonly editing = signal(false);

  /** Hộp thoại điều chỉnh kho */
  readonly adjustFor = signal<ProductVariant | null>(null);
  readonly delta = signal(0);
  readonly reason = signal('');

  /** Vùng in đang chỉnh (xem trước ngay) */
  readonly area = signal<PrintArea>({ x: 0.3, y: 0.3, width: 0.4, height: 0.4 });

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(120)]],
    category: ['', Validators.required],
    price: [0, [Validators.required, Validators.min(1000)]],
    description: ['', [Validators.required, Validators.minLength(10)]],
    lowStockThreshold: [5, [Validators.required, Validators.min(0)]],
    isActive: [true],
    allowCustomization: [true],
    allowMarketplace: [true],
  });

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe((m) => this.tab.set((m.get('tab') as Tab) || 'info'));
    // dữ liệu tải xong / đổi sản phẩm -> điền form + vùng in
    effect(() => {
      const p = this.product();
      untracked(() => {
        if (!p) return;
        this.form.reset({ name: p.name, category: p.category, price: p.price, description: p.description, lowStockThreshold: p.lowStockThreshold,
          isActive: p.isActive, allowCustomization: p.allowCustomization, allowMarketplace: p.allowMarketplace });
        this.area.set({ ...(this.data.printAreaOf(p) ?? { x: 0.3, y: 0.3, width: 0.4, height: 0.4 }) });
      });
    });
  }

  setTab(t: Tab): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: { tab: t === 'info' ? null : t }, replaceUrl: true });
  }

  colorLabel(c: string): string {
    return COLOR_LABELS[c] ?? c;
  }

  categoryLabel(c: string): string {
    return CATEGORY_LABELS[c] ?? c;
  }

  startEdit(): void {
    this.editing.set(true);
  }

  cancelEdit(): void {
    const p = this.product();
    if (p) this.form.reset({ name: p.name, category: p.category, price: p.price, description: p.description, lowStockThreshold: p.lowStockThreshold,
      isActive: p.isActive, allowCustomization: p.allowCustomization, allowMarketplace: p.allowMarketplace });
    this.editing.set(false);
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    if (this.toast.result(this.data.updateProduct(this.id(), { ...v, name: v.name.trim(), description: v.description.trim(), price: Math.round(v.price) }))) this.editing.set(false);
  }

  toggleActive(): void {
    const p = this.product();
    if (p) this.toast.result(this.data.updateProduct(p._id, { isActive: !p.isActive }));
  }

  openAdjust(v: ProductVariant): void {
    this.adjustFor.set(v);
    this.delta.set(0);
    this.reason.set('');
  }

  confirmAdjust(): void {
    const v = this.adjustFor();
    if (!v) return;
    if (this.toast.result(this.data.adjustStock(this.id(), v._id, Math.round(Number(this.delta())), this.reason()))) this.adjustFor.set(null);
  }

  setArea(key: keyof PrintArea, value: string): void {
    const n = Math.min(1, Math.max(0, Number(value) || 0));
    this.area.update((a) => ({ ...a, [key]: n }));
  }

  saveArea(): void {
    const a = this.area();
    if (a.x + a.width > 1.001 || a.y + a.height > 1.001) {
      this.toast.show('Vùng in vượt ra ngoài ảnh (X + Rộng và Y + Cao phải ≤ 1).', false);
      return;
    }
    this.toast.result(this.data.updateProduct(this.id(), { printArea: { ...a } }));
  }

  variantText(variantId: string): string {
    const v = this.product()?.variants.find((x) => x._id === variantId);
    return v ? [this.colorLabel(v.color), v.size].filter(Boolean).join(' / ') : variantId;
  }
}
