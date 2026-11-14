import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { Location } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { OrderItem } from '../../models/admin.models';
import { COLOR_LABELS, ORDER_STATUS, PAYMENT_STATUS, isPaymentExpired, orderBadge, paymentDeadline } from '../../models/labels';
import { ActionResult, AdminDataService } from '../../services/admin-data.service';
import { ToastService } from '../../shared/toast.service';

type Tab = 'overview' | 'payment' | 'design' | 'production' | 'shipping' | 'cancel';
type Ask = { kind: 'approvePay' } | { kind: 'rejectPay' } | { kind: 'rejectDesign'; item: OrderItem } | { kind: 'cancel'; decision: 'APPROVE' | 'REJECT' } | null;

/** D6 – Chi tiết đơn: /admin/orders-detail/:id?tab=... */
@Component({
  selector: 'app-order-detail',
  standalone: false,
  templateUrl: './order-detail.html',
  styleUrl: './order-detail.css',
})
export class OrderDetail {
  readonly data = inject(AdminDataService);
  private readonly toast = inject(ToastService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);

  readonly payLabels = PAYMENT_STATUS;
  readonly statusLabels = ORDER_STATUS as Record<string, { label: string }>;
  readonly tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Tổng quan' },
    { key: 'payment', label: 'Thanh toán' },
    { key: 'design', label: 'Kiểm tra mẫu in' },
    { key: 'production', label: 'Sản xuất' },
    { key: 'shipping', label: 'Giao hàng' },
    { key: 'cancel', label: 'Yêu cầu hủy' },
  ];
  private readonly id = toSignal(this.route.paramMap.pipe(map((m) => m.get('id') ?? '')), { initialValue: '' });
  readonly order = computed(() => this.data.order(this.id()));
  readonly tab = signal<Tab>('overview');
  readonly ask = signal<Ask>(null);
  readonly note = signal('');
  readonly tracking = signal('');
  readonly samplePhoto = signal('');

  readonly badge = computed(() => (this.order() ? orderBadge(this.order()!) : null));
  readonly expired = computed(() => !!this.order() && isPaymentExpired(this.order()!));
  readonly deadline = computed(() => (this.order() ? paymentDeadline(this.order()!) : 0));
  readonly designItems = computed(() => this.order()?.items.filter((i) => !!i.designId) ?? []);
  /** Tab có việc cần làm -> chấm đỏ */
  readonly todo = computed<Record<string, boolean>>(() => {
    const o = this.order();
    if (!o) return {} as Record<string, boolean>;
    return {
      payment: o.paymentStatus === 'WAITING_STAFF' && o.orderStatus === 'PENDING_STAFF_CONFIRMATION',
      design: o.orderStatus === 'DESIGN_REVIEW' && this.designItems().some((i) => i.designReview?.status === 'PENDING' || (i.designReview?.status === 'REJECTED' && !!i.designReview?.resubmittedAt)),
      production: ['SAMPLE_PRINTING', 'PRINT_CONFIRMED'].includes(o.orderStatus),
      shipping: ['PRINT_COMPLETED', 'SHIPPING'].includes(o.orderStatus),
      cancel: o.cancelRequest?.status === 'PENDING',
    };
  });

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe((m) => this.tab.set((m.get('tab') as Tab) || 'overview'));
  }

  setTab(t: Tab): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: { tab: t === 'overview' ? null : t }, replaceUrl: true });
  }

  back(): void {
    if (window.history.length > 1) this.location.back();
    else this.router.navigate(['/admin/orders-list']);
  }

  img(i: OrderItem): string {
    return this.data.itemImage(i);
  }

  variant(i: OrderItem): string {
    const v = this.data.variantOf(i);
    const color = i.color ?? v?.color ?? '';
    return [COLOR_LABELS[color] ?? color, i.size ?? v?.size].filter(Boolean).join(' / ');
  }

  reviewLabel(i: OrderItem): { label: string; tone: string } {
    switch (i.designReview?.status) {
      case 'APPROVED': return { label: 'Đạt', tone: 'ok' };
      case 'ACCEPTED_RISK': return { label: 'Khách chấp nhận rủi ro', tone: 'warn' };
      case 'REJECTED': return i.designReview?.resubmittedAt ? { label: 'Khách đã sửa, chờ kiểm tra lại', tone: 'action' } : { label: 'Chờ khách sửa', tone: 'bad' };
      case 'PENDING': return { label: 'Chờ kiểm tra', tone: 'action' };
      default: return { label: 'Không cần', tone: '' };
    }
  }

  sampleLabel(s?: string): string {
    return ({ WAITING_SAMPLE: 'Chờ in mẫu', SAMPLE_READY: 'Mẫu đã in – chờ khách duyệt', APPROVED: 'Khách đã duyệt mẫu', NOT_REQUIRED: 'Không cần mẫu' } as Record<string, string>)[s ?? ''] ?? (s || '—');
  }

  open(a: Ask): void {
    this.note.set('');
    this.ask.set(a);
  }

  confirm(): void {
    const a = this.ask();
    const o = this.order();
    if (!a || !o) return;
    let r: ActionResult;
    switch (a.kind) {
      case 'approvePay': r = this.data.approvePayment(o._id); break;
      case 'rejectPay': r = this.data.rejectPayment(o._id, this.note()); break;
      case 'rejectDesign': r = this.data.reviewDesign(o._id, a.item.orderItemId, 'REJECT', this.note()); break;
      case 'cancel': r = this.data.resolveCancel(o._id, a.decision, this.note()); break;
    }
    if (this.toast.result(r)) this.ask.set(null);
  }

  approveDesign(i: OrderItem): void {
    this.toast.result(this.data.reviewDesign(this.order()!._id, i.orderItemId, 'APPROVE'));
  }

  startSample(): void {
    this.toast.result(this.data.startSample(this.order()!._id));
  }

  /** Demo: dùng ảnh thiết kế làm ảnh chụp mẫu nếu chưa nhập link */
  completeSample(): void {
    const o = this.order()!;
    const photo = this.samplePhoto().trim() || this.img(o.items.find((i) => i.requiresSample) ?? o.items[0]);
    if (this.toast.result(this.data.completeSample(o._id, photo))) this.samplePhoto.set('');
  }

  completePrint(): void {
    this.toast.result(this.data.completePrint(this.order()!._id));
  }

  ship(): void {
    if (this.toast.result(this.data.ship(this.order()!._id, this.tracking()))) this.tracking.set('');
  }

  suggestTracking(): void {
    this.tracking.set('PF' + Date.now().toString().slice(-8));
  }

  deliver(): void {
    this.toast.result(this.data.deliver(this.order()!._id));
  }
}
