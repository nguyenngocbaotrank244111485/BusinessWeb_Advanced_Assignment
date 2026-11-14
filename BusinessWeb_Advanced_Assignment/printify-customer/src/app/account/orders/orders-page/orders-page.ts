import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Order } from '../../../models/order.model';
import {
  ORDER_TABS,
  OrderTab,
  canCancel,
  canReturn,
  cancelLocked,
  designRejected,
  statusLabel,
  tabOf,
} from '../../../models/order-status';
import { OrderService } from '../../../services/order-service';
import { AuthService } from '../../../services/auth-service';
import { OrderHelpers } from '../order-helpers';

/**
 * C14 – Đơn hàng của tôi (/account/orders?tab=)
 * Tab ngang theo trạng thái; mỗi thẻ đơn có nút theo tình huống: Thanh toán, Hủy (chờ duyệt), Đã nhận hàng,
 * Trả hàng/Hoàn tiền, Mua lại, Đánh giá.
 */
@Component({
  selector: 'app-orders-page',
  standalone: false,
  templateUrl: './orders-page.html',
  styleUrl: './orders-page.css',
})
export class OrdersPage {
  private readonly ordersSvc = inject(OrderService);
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly h = inject(OrderHelpers);

  readonly tabs = ORDER_TABS;
  /** Đồng hồ 30s để trạng thái hết hạn thanh toán / tự hoàn thành cập nhật */
  private readonly now = signal(Date.now());
  readonly tab = signal<OrderTab>('all');
  readonly query = signal('');
  readonly order = signal<'newest' | 'oldest'>('newest');

  readonly cancelFor = signal<Order | null>(null);
  readonly reviewFor = signal<Order | null>(null);
  readonly qrFor = signal<Order | null>(null);
  readonly toast = signal<{ type: 'ok' | 'error'; text: string } | null>(null);
  private toastTimer?: ReturnType<typeof setTimeout>;

  readonly mine = computed(() => this.ordersSvc.forUser(this.auth.user()?._id ?? ''));
  readonly counts = computed(() => {
    const now = this.now();
    const c: Record<OrderTab, number> = { all: 0, confirm: 0, printing: 0, printed: 0, shipping: 0, delivered: 0, done: 0, cancelled: 0 };
    for (const o of this.mine()) {
      c.all++;
      c[tabOf(o, now)]++;
    }
    return c;
  });

  readonly list = computed(() => {
    const now = this.now();
    const t = this.tab();
    const q = this.norm(this.query());
    const dir = this.order() === 'newest' ? -1 : 1;
    return this.mine()
      .filter((o) => (t === 'all' || tabOf(o, now) === t) && (!q || this.norm(o._id + ' ' + o.items.map((i) => i.productName).join(' ')).includes(q)))
      .sort((a, b) => dir * a.createdAt.localeCompare(b.createdAt));
  });

  constructor() {
    this.route.queryParamMap.subscribe((q) => {
      const t = q.get('tab') as OrderTab;
      this.tab.set(ORDER_TABS.some((x) => x.key === t) ? t : 'all');
    });
    const timer = setInterval(() => this.now.set(Date.now()), 30_000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  setTab(t: OrderTab): void {
    void this.router.navigate([], { queryParams: { tab: t === 'all' ? null : t }, replaceUrl: true });
  }

  // ---------- trạng thái cho template ----------
  tabOf(o: Order): OrderTab {
    return tabOf(o, this.now());
  }
  label(o: Order) {
    return statusLabel(o, this.now());
  }
  canCancel(o: Order): boolean {
    return canCancel(o, this.now());
  }
  cancelLocked(o: Order): boolean {
    return cancelLocked(o, this.now());
  }
  canReturn(o: Order): boolean {
    return canReturn(o, this.now());
  }
  rejected(o: Order): boolean {
    return o.orderStatus === 'DESIGN_REVIEW' && designRejected(o);
  }
  itemCount(o: Order): number {
    return o.items.reduce((n, i) => n + i.qty, 0);
  }

  // ---------- thao tác ----------
  open(o: Order): void {
    void this.router.navigate(['/account/orders', o._id]);
  }

  pay(o: Order): void {
    this.qrFor.set(o);
  }

  claim(): void {
    const o = this.qrFor();
    if (!o) return;
    const updated = this.ordersSvc.claimPayment(o._id);
    if (updated) this.qrFor.set(updated);
  }

  onCancelDone(kind: 'requested' | 'address'): void {
    this.cancelFor.set(null);
    this.showToast(
      'ok',
      kind === 'address' ? 'Đã đổi địa chỉ nhận hàng cho đơn.' : 'Đã gửi yêu cầu hủy. PrintiFy sẽ xem xét và thông báo cho bạn.',
    );
  }

  received(o: Order): void {
    this.ordersSvc.confirmReceived(o._id);
    this.showToast('ok', 'Cảm ơn bạn! Đơn đã chuyển sang Hoàn thành. Hãy để lại đánh giá nhé.');
  }

  returnOrder(o: Order): void {
    void this.router.navigate(['/account/orders', o._id, 'return']);
  }

  rebuy(o: Order): void {
    const r = this.h.rebuy(o);
    if (!r.added) return this.showToast('error', 'Các sản phẩm trong đơn hiện đã hết hàng hoặc ngừng bán.');
    if (r.skipped.length) this.showToast('error', 'Không thêm được: ' + r.skipped.join(', ') + ' (hết hàng).');
    void this.router.navigate(['/cart']);
  }

  onReviewed(): void {
    this.reviewFor.set(null);
    this.showToast('ok', 'Cảm ơn bạn đã đánh giá!');
  }

  private norm(s: string): string {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().trim();
  }

  private showToast(type: 'ok' | 'error', text: string): void {
    clearTimeout(this.toastTimer);
    this.toast.set({ type, text });
    this.toastTimer = setTimeout(() => this.toast.set(null), 3500);
  }
}
