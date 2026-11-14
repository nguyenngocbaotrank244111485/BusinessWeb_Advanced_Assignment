import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { Design, Listing } from '../../models/market.model';
import { PrintArea, Product } from '../../models/product.model';
import { AuthService } from '../../services/auth-service';
import { MarketService } from '../../services/market-service';
import { ProductService } from '../../services/product-service';

export const MIN_PRICE = 10000;
export const MAX_PRICE = 2000000;

/**
 * C21 – Đăng / sửa tin: /market/my-listings/new?designId= | /market/my-listings/:listingId/edit (AuthGuard)
 * Chỉ thiết kế do user tự tạo; người mua chọn được mọi sản phẩm có vùng in; gửi xong -> PENDING_REVIEW.
 */
@Component({
  selector: 'app-listing-form',
  standalone: false,
  templateUrl: './listing-form.html',
  styleUrl: './listing-form.css',
})
export class ListingForm {
  readonly market = inject(MarketService);
  private readonly auth = inject(AuthService);
  private readonly ps = inject(ProductService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly minPrice = MIN_PRICE;
  readonly maxPrice = MAX_PRICE;
  readonly editId = this.route.snapshot.paramMap.get('listingId');
  readonly isEdit = !!this.editId;
  private readonly products = toSignal(this.ps.getActiveProducts(), { initialValue: [] as Product[] });

  readonly form = inject(FormBuilder).nonNullable.group({
    designId: ['', Validators.required],
    title: ['', [Validators.required, Validators.maxLength(100)]],
    description: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(500)]],
    tags: [''],
    sellerPrice: [50000, [Validators.required, Validators.min(MIN_PRICE), Validators.max(MAX_PRICE)]],
    acceptedCopyright: [false, Validators.requiredTrue],
  });

  /** Giá trị form (kể cả ô bị khóa) dạng signal để xem trước phí ngay khi gõ */
  private readonly value = toSignal(this.form.valueChanges.pipe(map(() => this.form.getRawValue())), {
    initialValue: this.form.getRawValue(),
  });
  readonly editing = signal<Listing | undefined>(undefined);
  readonly error = signal('');
  readonly saving = signal(false);

  readonly designs = computed<Design[]>(() =>
    this.market.sellableDesigns(this.auth.user()?._id ?? '', this.editing()?.designId),
  );
  readonly selectedDesign = computed(() => this.designs().find((d) => d._id === this.value().designId));
  readonly selectedProduct = computed(() => this.productOf(this.selectedDesign()));
  /** Xem thử thiết kế đang chọn trên vài sản phẩm khác nhau */
  readonly previewProducts = computed(() => {
    const all = this.market.mockupProducts(this.products(), this.selectedDesign()?.productId);
    const seen = new Set<string>();
    return all.filter((p) => !seen.has(p.category) && !!seen.add(p.category)).slice(0, 4);
  });
  readonly printableCount = computed(() => this.market.mockupProducts(this.products()).length);
  readonly fees = computed(() => this.market.calcFees(Number(this.value().sellerPrice) || 0));
  readonly feePercent = computed(() => Math.round(this.market.feeRate() * 100));
  readonly titleLength = computed(() => (this.value().title ?? '').length);

  constructor() {
    // Người dùng sửa form thì ẩn thông báo lỗi chung
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => this.error.set(''));
    // Chờ dữ liệu tải xong rồi điền form (sửa tin) hoặc chọn sẵn thiết kế (?designId=)
    effect(() => {
      if (!this.market.loaded()) return;
      untracked(() => this.prefill());
    });
  }

  areaOf(p: Product): PrintArea {
    return this.market.printAreaOf(p)!;
  }

  productOf(d?: Design): Product | undefined {
    return d ? this.products().find((p) => p._id === d.productId) : undefined;
  }

  pickDesign(d: Design): void {
    if (this.isEdit) return; // sửa tin không đổi thiết kế
    this.form.controls.designId.setValue(d._id);
  }

  goProducts(): void {
    this.router.navigate(['/products']);
  }

  submit(): void {
    this.error.set('');
    if (this.saving()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Bạn kiểm tra lại các ô được đánh dấu đỏ nhé.');
      return;
    }
    const v = this.form.getRawValue();
    const input = {
      designId: v.designId,
      title: v.title,
      description: v.description,
      tags: [...new Set(v.tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 8),
      sellerPrice: Math.round(Number(v.sellerPrice)),
      acceptedCopyright: v.acceptedCopyright,
    };
    const userId = this.auth.user()!._id;
    const req = this.isEdit ? this.market.update(this.editId!, userId, input) : this.market.create(userId, input);
    this.saving.set(true);
    req.subscribe({
      next: () => this.router.navigate(['/market/my-listings'], { queryParams: { saved: this.isEdit ? 'edit' : 'new' } }),
      error: (e) => {
        this.saving.set(false);
        this.error.set(e?.status === 0 || e?.status >= 500 ? 'Không kết nối được máy chủ.' : e?.error?.message || 'Không lưu được tin đăng.');
      },
    });
  }

  private prefill(): void {
    const userId = this.auth.user()?._id;
    if (this.isEdit) {
      const l = this.market.getListing(this.editId!);
      if (!l || l.sellerId !== userId || l.status === 'UNLISTED') {
        this.router.navigate(['/market/my-listings'], { replaceUrl: true });
        return;
      }
      this.editing.set(l);
      this.form.patchValue({
        designId: l.designId,
        title: l.title,
        description: l.description,
        tags: l.tags.join(', '),
        sellerPrice: l.sellerPrice,
        acceptedCopyright: false, // phải cam kết lại mỗi lần gửi duyệt
      });
      this.form.controls.designId.disable();
      return;
    }
    const wanted = this.route.snapshot.queryParamMap.get('designId');
    const first = this.designs().find((d) => d._id === wanted) ?? this.designs()[0];
    if (first) this.form.controls.designId.setValue(first._id);
  }
}
