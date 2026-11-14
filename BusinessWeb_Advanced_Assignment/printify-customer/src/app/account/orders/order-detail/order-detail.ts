import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { Order, OrderItem } from '../../../models/order.model';
import { canCancel, cancelLocked, PAYMENT_STATUS_LABELS, isPaymentExpired, paymentDeadline, statusLabel, tabOf } from '../../../models/order-status';
import { OrderService, TimelineEntry } from '../../../services/order-service';
import { AuthService } from '../../../services/auth-service';
import { DesignService } from '../../../services/design-service';
import { OrderHelpers } from '../order-helpers';

interface Step {
  key: string;
  label: string;
  icon: string;
}

/** Các bước khách thấy trên thanh tiến độ */
const STEPS: Step[] = [
  { key: 'placed', label: 'Đặt hàng', icon: '🧾' },
  { key: 'paid', label: 'Xác nhận thanh toán', icon: '💳' },
  { key: 'sample', label: 'Kiểm tra & duyệt mẫu', icon: '🔍' },
  { key: 'printing', label: 'Đang in ấn', icon: '🏭' },
  { key: 'printed', label: 'Đã in xong', icon: '📦' },
  { key: 'shipping', label: 'Đang giao', icon: '🚚' },
  { key: 'delivered', label: 'Đã giao', icon: '✅' },
];
const STEP_INDEX: Record<string, number> = {
  PENDING_PAYMENT: 0,
  PENDING_STAFF_CONFIRMATION: 1,
  DESIGN_REVIEW: 2,
  SAMPLE_PRINTING: 2,
  SAMPLE_REVIEW: 2,
  PRINT_CONFIRMED: 3,
  PRINT_COMPLETED: 4,
  SHIPPING: 5,
  COMPLETED: 6,
};

const TIMELINE_LABELS: Record<string, string> = {
  PENDING_PAYMENT: 'Đặt hàng',
  PENDING_STAFF_CONFIRMATION: 'Báo đã thanh toán',
  DESIGN_REVIEW: 'PrintiFy kiểm tra mẫu in',
  DESIGN_REJECTED: 'Mẫu in cần chỉnh sửa',
  DESIGN_RESUBMITTED: 'Gửi lại mẫu đã sửa',
  DESIGN_RISK_ACCEPTED: 'Chấp nhận in mẫu hiện tại',
  SAMPLE_PRINTING: 'Bắt đầu in mẫu thử',
  SAMPLE_REVIEW: 'Mẫu in sẵn sàng',
  SAMPLE_APPROVED: 'Duyệt mẫu',
  PRINT_CONFIRMED: 'Bắt đầu in chính thức',
  PRINT_COMPLETED: 'In xong',
  SHIPPING: 'Giao cho vận chuyển',
  COMPLETED: 'Giao hàng thành công',
  RECEIVED: 'Đã nhận hàng',
  CANCEL_REQUESTED: 'Yêu cầu hủy',
  ADDRESS_CHANGED: 'Đổi địa chỉ',
  CANCELLED: 'Đã hủy',
};

/**
 * C15 – Chi tiết đơn (/account/orders/:orderId): tiến độ, QR thanh toán, duyệt mẫu từng sản phẩm,
 * yêu cầu chỉnh sửa mẫu (→ C10 SAMPLE_EDIT), hủy / đổi địa chỉ, nhận hàng, trả hàng, mua lại, đánh giá.
 */
@Component({
  selector: 'app-order-detail',
  standalone: false,
  templateUrl: './order-detail.html',
  styleUrl: './order-detail.css',
})
export class OrderDetail {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly ordersSvc = inject(OrderService);
  private readonly auth = inject(AuthService);
  private readonly designs = inject(DesignService);
  readonly h = inject(OrderHelpers);

  readonly steps = STEPS;
  private readonly now = signal(Date.now());
  private readonly id = toSignal(this.route.paramMap.pipe(map((p) => p.get('orderId') ?? '')), { initialValue: '' });

  readonly order = computed(() => {
    const o = this.ordersSvc.orders().find((x) => x._id === this.id());
    return o && o.userId === this.auth.user()?._id ? o : null;
  });
  readonly notFound = computed(() => !!this.ordersSvc.orders().length && !this.order());

  readonly tab = computed(() => (this.order() ? tabOf(this.order()!, this.now()) : 'all'));
  readonly label = computed(() => (this.order() ? statusLabel(this.order()!, this.now()) : null));
  readonly cancelled = computed(() => this.tab() === 'cancelled');
  readonly expired = computed(() => !!this.order() && isPaymentExpired(this.order()!, this.now()));
  readonly stepIndex = computed(() => {
    const o = this.order();
    if (!o) return 0;
    if (o.orderStatus === 'COMPLETED') return 6;
    return STEP_INDEX[o.orderStatus] ?? 0;
  });
  readonly canCancel = computed(() => !!this.order() && canCancel(this.order()!, this.now()));
  readonly cancelLocked = computed(() => !!this.order() && cancelLocked(this.order()!, this.now()));
  readonly timeline = computed(() => (this.order() ? [...this.ordersSvc.timeline(this.order()!)].reverse() : []));
  readonly paymentLeft = computed(() => {
    const o = this.order();
    if (!o || o.orderStatus !== 'PENDING_PAYMENT') return '';
    const ms = Math.max(0, paymentDeadline(o) - this.now());
    const s = Math.ceil(ms / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  });

  readonly showQr = signal(false);
  readonly showCancel = signal(false);
  readonly showReview = signal(false);
  readonly photo = signal<string | null>(null);
  readonly toast = signal<{ type: 'ok' | 'error'; text: string } | null>(null);
  private toastTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    const t = setInterval(() => this.now.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(t));
    if (this.route.snapshot.queryParamMap.get('resubmit') === 'sent') {
      this.showToast('ok', 'Đã gửi lại mẫu in. PrintiFy sẽ kiểm tra và thông báo kết quả cho bạn.');
    } else if (this.route.snapshot.queryParamMap.get('reprint') === 'sent') {
      this.showToast('ok', 'Đã gửi yêu cầu in lại mẫu. PrintiFy sẽ in mẫu mới và báo bạn duyệt lại.');
    }
  }

  timelineLabel(e: TimelineEntry): string {
    return TIMELINE_LABELS[e.status] ?? e.status;
  }

  /** Thiết kế của chính khách -> có link mở lại trong editor */
  ownDesign(i: OrderItem): boolean {
    return !!i.designId && this.designs.get(i.designId)?.userId === this.auth.user()?._id;
  }

  sampleText(i: OrderItem): string {
    switch (i.sampleStatus) {
      case 'WAITING_SAMPLE':
        return 'Chờ in mẫu';
      case 'SAMPLE_READY':
        return 'Mẫu đã in – chờ bạn duyệt';
      case 'APPROVED':
        return 'Đã duyệt mẫu';
      default:
        return '';
    }
  }

  /** Mẫu bị PrintiFy trả về -> cho sửa lại */
  canFixDesign(i: OrderItem): boolean {
    return this.order()?.orderStatus === 'DESIGN_REVIEW' && i.designReview?.status === 'REJECTED';
  }

  readonly rejected = computed(() => this.order()?.orderStatus === 'DESIGN_REVIEW' && this.order()!.items.some((i) => i.designReview?.status === 'REJECTED'));

  fixDesign(i: OrderItem): void {
    const o = this.order();
    if (o) void this.router.navigate(['/account/orders', o._id, 'items', i.orderItemId, 'edit']);
  }

  /** Dòng đang chờ khách xác nhận "vẫn in" */
  readonly riskFor = signal<OrderItem | null>(null);
  readonly riskAgree = signal(false);

  askAcceptRisk(i: OrderItem): void {
    this.riskAgree.set(false);
    this.riskFor.set(i);
  }

  acceptRisk(): void {
    const o = this.order();
    const i = this.riskFor();
    if (!o || !i || !this.riskAgree()) return;
    const updated = this.ordersSvc.acceptDesignRisk(o._id, i.orderItemId);
    this.riskFor.set(null);
    this.showToast(
      'ok',
      updated?.orderStatus === 'SAMPLE_PRINTING'
        ? 'Đã ghi nhận. PrintiFy sẽ in mẫu thử theo thiết kế hiện tại.'
        : 'Đã ghi nhận lựa chọn in mẫu hiện tại cho sản phẩm này.',
    );
  }

  scrollToItems(): void {
    document.getElementById('order-items')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  canReviewSample(i: OrderItem): boolean {
    return this.order()?.orderStatus === 'SAMPLE_REVIEW' && i.requiresSample && i.sampleStatus === 'SAMPLE_READY';
  }

  approve(i: OrderItem): void {
    const o = this.order();
    if (!o || !confirm(`Duyệt mẫu "${i.productName}"? Sau khi tất cả mẫu được duyệt, đơn sẽ chuyển sang in chính thức.`)) return;
    const updated = this.ordersSvc.approveSample(o._id, i.orderItemId);
    this.showToast('ok', updated?.orderStatus === 'PRINT_CONFIRMED' ? 'Đã duyệt mẫu. Đơn bắt đầu in chính thức!' : 'Đã duyệt mẫu sản phẩm này.');
  }

  /** Mở cửa sổ sửa 48h rồi đi tới C10 (SAMPLE_EDIT) */
  requestEdit(i: OrderItem): void {
    const o = this.order();
    if (!o) return;
    this.ordersSvc.openEditRequest(o._id, i.orderItemId);
    void this.router.navigate(['/account/orders', o._id, 'items', i.orderItemId, 'edit']);
  }

  claim(): void {
    const o = this.order();
    if (o) this.ordersSvc.claimPayment(o._id);
  }

  onCancelDone(kind: 'requested' | 'address'): void {
    this.showCancel.set(false);
    this.showToast('ok', kind === 'address' ? 'Đã đổi địa chỉ nhận hàng.' : 'Đã gửi yêu cầu hủy, vui lòng chờ PrintiFy duyệt.');
  }

  received(): void {
    const o = this.order();
    if (!o) return;
    this.ordersSvc.confirmReceived(o._id);
    this.showToast('ok', 'Cảm ơn bạn! Hãy để lại đánh giá cho đơn hàng nhé.');
  }

  paymentLabel(s: string): string {
    return PAYMENT_STATUS_LABELS[s] ?? s;
  }

  rebuy(): void {
    const o = this.order();
    if (!o) return;
    const r = this.h.rebuy(o);
    if (!r.added) return this.showToast('error', 'Các sản phẩm trong đơn hiện đã hết hàng hoặc ngừng bán.');
    void this.router.navigate(['/cart']);
  }

  onReviewed(): void {
    this.showReview.set(false);
    this.showToast('ok', 'Cảm ơn bạn đã đánh giá!');
  }

  stars(n: number): string {
    return '★'.repeat(n) + '☆'.repeat(5 - n);
  }

  private showToast(type: 'ok' | 'error', text: string): void {
    clearTimeout(this.toastTimer);
    this.toast.set({ type, text });
    this.toastTimer = setTimeout(() => this.toast.set(null), 4000);
  }
}

