import { ApiStatusService } from '../../services/api-status-service';
import { Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Order, OrderItem, PAYMENT_METHODS, PaymentMethod, calcTotals } from '../../models/order.model';
import { Product } from '../../models/product.model';
import { SavedAddress } from '../../models/user.model';
import { AuthService } from '../../services/auth-service';
import { CartService } from '../../services/cart-service';
import { ConfigService } from '../../services/config-service';
import { OrderService } from '../../services/order-service';
import { ProductService } from '../../services/product-service';
import { ProfileService } from '../../services/profile-service';
import { tierDiscount } from '../../models/membership.model';

/** SĐT Việt Nam (BR09): 0 hoặc +84, đầu số di động 3/5/7/8/9, tổng 10 số */
export const PHONE_VN = /^(0|\+84)(3|5|7|8|9)\d{8}$/;

/**
 * C13 – Checkout: /checkout (CustomerGuard). Trái: địa chỉ nhận hàng + thanh toán; phải: sản phẩm đã chọn + tổng tiền.
 * Bấm Thanh toán một lần (idempotencyKey) -> tạo đơn PENDING_PAYMENT -> mở QR 10 phút. Giá đổi / hết kho -> về giỏ.
 */
@Component({
  selector: 'app-checkout-page',
  standalone: false,
  templateUrl: './checkout-page.html',
  styleUrl: './checkout-page.css',
})
export class CheckoutPage {
  private readonly cart = inject(CartService);
  readonly auth = inject(AuthService);
  readonly ps = inject(ProductService);
  readonly cfg = inject(ConfigService).config;
  private readonly orders = inject(OrderService);
  private readonly router = inject(Router);
  private readonly api = inject(ApiStatusService);

  private readonly profiles = inject(ProfileService);
  /** 34 tỉnh/thành (dùng chung với sổ địa chỉ C18) */
  private readonly provinceList = toSignal(this.profiles.provinces$, { initialValue: [] as string[] });
  get provinces(): string[] {
    return this.provinceList();
  }
  private readonly products = toSignal(this.ps.getProducts(), { initialValue: undefined });
  /** Mỗi lần mở trang Checkout = 1 khóa; bấm Thanh toán nhiều lần cũng chỉ tạo 1 đơn */
  private readonly idempotencyKey = 'chk_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  /** Sổ địa chỉ của tài khoản (C18), chưa tải xong thì dùng địa chỉ trong phiên đăng nhập */
  readonly addresses = computed<SavedAddress[]>(
    () =>
      (this.profiles.profile()?.addresses as SavedAddress[] | undefined) ??
      (this.auth.user() as { addresses?: SavedAddress[] } | null)?.addresses ??
      [],
  );
  /** Giảm giá theo hạng thành viên (C18) */
  readonly discount = computed(() => tierDiscount(this.profiles.membership()));
  readonly paymentMethods = PAYMENT_METHODS;
  readonly methodKeys: PaymentMethod[] = ['BANK', 'MOMO'];
  readonly paymentMethod = signal<PaymentMethod>('BANK');
  readonly addressChoice = signal<string>(''); // _id địa chỉ đã lưu hoặc 'new'
  readonly submitting = signal(false);
  readonly error = signal('');
  readonly order = signal<Order | null>(null);
  readonly showQr = signal(false);

  readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(60)]],
    phone: ['', [Validators.required, Validators.pattern(PHONE_VN)]],
    province: ['', Validators.required],
    ward: ['', Validators.required],
    detail: ['', [Validators.required, Validators.minLength(5)]],
    note: ['', Validators.maxLength(200)],
  });

  /** Dòng đã chọn trong giỏ kèm giá/tồn kho mới nhất */
  readonly lines = computed(() => {
    const map = new Map((this.products() ?? []).map((p) => [p._id, p]));
    return this.cart.selectedItems().map((item) => {
      const product = map.get(item.productId);
      const variant = product?.variants.find((v) => v._id === item.variantId);
      return { item, product, variant, price: product?.price ?? item.unitPrice };
    });
  });
  readonly totals = computed(() =>
    calcTotals(
      this.lines().map((l) => ({ unitPrice: l.price, quantity: l.item.quantity, designFee: l.item.designFee ?? 0 })),
      { ...this.cfg(), discountRate: this.discount().rate, discountThresholdVnd: 0 },
    ),
  );
  readonly qty = computed(() => this.lines().reduce((s, l) => s + l.item.quantity, 0));

  constructor() {
    void this.profiles.load();
    effect(() => {
      if (!this.profiles.profile()) return; // chờ tải sổ địa chỉ rồi mới chọn mặc định
      const list = this.addresses();
      untracked(() => {
        if (this.addressChoice()) return;
        const def = list.find((a) => a.isDefault) ?? list[0];
        def ? this.useAddress(def) : this.addressChoice.set('new');
      });
    });
    // Không còn gì để thanh toán (và chưa tạo đơn) -> về giỏ
    effect(() => {
      if (this.products() !== undefined && !this.lines().length && !this.order()) {
        untracked(() => this.router.navigate(['/cart'], { replaceUrl: true }));
      }
    });
  }

  useAddress(a: SavedAddress): void {
    this.addressChoice.set(a._id);
    this.form.patchValue({ name: a.name, phone: a.phone, province: a.province, ward: a.ward, detail: a.detail });
  }

  newAddress(): void {
    this.addressChoice.set('new');
    this.form.patchValue({ name: this.auth.user()?.name ?? '', phone: '', province: '', ward: '', detail: '' });
  }

  variantText(color: string, size: string | null): string {
    return this.ps.colorLabel(color) + (size ? ' / ' + size : '');
  }

  async pay(): Promise<void> {
    if (this.submitting() || this.order()) return;
    this.error.set('');
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.error.set('Bạn kiểm tra lại thông tin nhận hàng được đánh dấu đỏ nhé.');
      return;
    }
    // Kiểm tra lại giá và tồn kho ngay trước khi tạo đơn (PRICE_CHANGED / INSUFFICIENT_STOCK)
    const bad = this.lines().some(
      (l) => !l.product || !l.variant || l.price !== l.item.unitPrice || l.item.quantity > l.variant.stock,
    );
    if (bad) {
      this.router.navigate(['/cart'], { queryParams: { issue: 1 } });
      return;
    }
    this.submitting.set(true);
    const v = this.form.getRawValue();
    const shippingInfo = { name: v.name.trim(), phone: v.phone.trim(), province: v.province.trim(), ward: v.ward.trim(), detail: v.detail.trim(), note: v.note.trim() };
    // Đẩy giỏ lên server trước, server tự lấy giá / tồn kho / giảm giá hạng thành viên để tạo đơn
    await this.cart.flush();
    this.orders.create({ shippingInfo, idempotencyKey: this.idempotencyKey, paymentMethod: this.paymentMethod() }).subscribe({
      next: (order) => {
        this.order.set(order);
        this.cart.removeMany(this.lines().map((l) => l.item.key));
        this.submitting.set(false);
        this.showQr.set(true);
      },
      error: (e) => {
        this.submitting.set(false);
        if (e?.status === 409) {
          this.cart.reload();
          this.router.navigate(['/cart'], { queryParams: { issue: 1 } });
        } else this.api.report(e, 'Không tạo được đơn hàng, thử lại sau.');
      },
    });
  }

  claim(): void {
    const o = this.order();
    if (!o) return;
    const updated = this.orders.claimPayment(o._id);
    if (updated) this.order.set(updated);
    // đơn chuẩn từ server sẽ cập nhật qua orders.get

  }

  viewOrder(): void {
    const o = this.order();
    if (o) this.router.navigate(['/account/orders', o._id]);
  }

  /** Dùng trong template để báo lỗi từng ô */
  invalid(name: keyof typeof this.form.controls): boolean {
    const c = this.form.controls[name];
    return c.touched && c.invalid;
  }

  productOf(id: string): Product | undefined {
    return this.products()?.find((p) => p._id === id);
  }
}
