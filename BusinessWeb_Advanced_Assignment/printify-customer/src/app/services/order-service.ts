import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, of } from 'rxjs';
import { Order, OrderItem, OrderTotals, PaymentMethod, ShippingInfo } from '../models/order.model';

/** Mốc trên timeline đơn (orders.timeline[]) */
export interface TimelineEntry {
  status: string;
  occurredAt: string;
  actorId: string;
  note: string;
}
type OrderWithTimeline = Order & { timeline?: TimelineEntry[] };

const LOCAL_ORDERS_KEY = 'printify_orders';

/**
 * Đơn hàng – giai đoạn mock: đọc orders.json + đơn tạo mới lưu localStorage.
 * Khi có API: create() = POST /api/orders (kèm idempotencyKey), claimPayment() = POST /api/orders/:id/payment-claim.
 * Không trừ kho khi tạo đơn: kho chỉ trừ khi Staff xác nhận PAID (inventory-policy).
 */
@Injectable({ providedIn: 'root' })
export class OrderService {
  private readonly _orders = signal<Order[]>(this.readLocal());
  readonly orders = this._orders.asReadonly();

  constructor() {
    inject(HttpClient)
      .get<Order[]>('/dataset/orders.json')
      .pipe(catchError(() => of([] as Order[])))
      .subscribe((seed) => {
        const local = this.readLocal();
        const ids = new Set(local.map((o) => o._id));
        this._orders.set([...seed.filter((o) => !ids.has(o._id)), ...local]);
      });
  }

  getById(id: string): Order | undefined {
    return this._orders().find((o) => o._id === id);
  }

  /** Tạo đơn chờ thanh toán. Gửi lại cùng idempotencyKey thì trả về đơn cũ (bấm 2 lần không tạo 2 đơn). */
  create(input: {
    userId: string;
    items: OrderItem[];
    shippingInfo: ShippingInfo;
    totals: OrderTotals;
    idempotencyKey: string;
    paymentMinutes: number;
    paymentMethod: PaymentMethod;
  }): Order {
    const existing = this._orders().find((o) => o.idempotencyKey === input.idempotencyKey);
    if (existing) return existing;
    const now = new Date();
    const order: Order = {
      _id: 'ord_' + now.getTime().toString(36),
      userId: input.userId,
      orderStatus: 'PENDING_PAYMENT',
      paymentStatus: 'PENDING',
      paymentMethod: input.paymentMethod,
      items: input.items,
      shippingInfo: input.shippingInfo,
      totals: input.totals,
      idempotencyKey: input.idempotencyKey,
      paymentOpenedAt: now.toISOString(),
      paymentExpiresAt: new Date(now.getTime() + input.paymentMinutes * 60000).toISOString(),
      paymentClaimedAt: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
    };
    this.saveLocal(order);
    return order;
  }

  /** Khách báo "Tôi đã thanh toán" -> chờ Staff xác nhận (không tự PAID) */
  claimPayment(id: string): Order | undefined {
    const o = this.getById(id);
    if (!o || o.orderStatus !== 'PENDING_PAYMENT') return o;
    const updated: Order = {
      ...o,
      orderStatus: 'PENDING_STAFF_CONFIRMATION',
      paymentStatus: 'CLAIMED',
      paymentClaimedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.saveLocal(updated);
    return updated;
  }

  /** Đơn của 1 khách, mới nhất trước */
  forUser(userId: string): Order[] {
    return this._orders()
      .filter((o) => o.userId === userId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /** Gửi yêu cầu hủy – chờ PrintiFy duyệt (POST /api/orders/:id/cancel) */
  requestCancel(id: string, reason: string, note: string): Order | undefined {
    const now = new Date().toISOString();
    return this.patch(id, { cancelRequest: { reason, note, status: 'PENDING', requestedAt: now, resolvedAt: null, resolveNote: null } }, {
      status: 'CANCEL_REQUESTED',
      note: 'Khách gửi yêu cầu hủy: ' + reason + (note ? ' – ' + note : ''),
    });
  }

  /** Đổi địa chỉ nhận hàng (trước khi in) thay vì hủy đơn */
  changeAddress(id: string, info: ShippingInfo): Order | undefined {
    return this.patch(id, { shippingInfo: info }, { status: 'ADDRESS_CHANGED', note: 'Khách đổi địa chỉ nhận hàng: ' + [info.detail, info.ward, info.province].join(', ') });
  }

  /** Khách xác nhận đã nhận hàng -> Hoàn thành */
  confirmReceived(id: string): Order | undefined {
    return this.patch(id, { receivedAt: new Date().toISOString() }, { status: 'RECEIVED', note: 'Khách xác nhận đã nhận được hàng' });
  }

  review(id: string, rating: number, comment: string): Order | undefined {
    return this.patch(id, { review: { rating, comment, createdAt: new Date().toISOString() } });
  }

  /** Duyệt mẫu 1 dòng; mọi mẫu đã duyệt -> in chính thức (POST /api/orders/:id/approve-samples) */
  approveSample(id: string, orderItemId: string): Order | undefined {
    const o = this.getById(id);
    if (!o || o.orderStatus !== 'SAMPLE_REVIEW') return o;
    const items = o.items.map((i) => (i.orderItemId === orderItemId ? { ...i, sampleStatus: 'APPROVED', editRequest: null } : i));
    const allOk = items.every((i) => !i.requiresSample || i.sampleStatus === 'APPROVED');
    return this.patch(
      id,
      { items, ...(allOk ? { orderStatus: 'PRINT_CONFIRMED' } : {}) },
      allOk ? { status: 'PRINT_CONFIRMED', note: 'Khách duyệt mẫu, bắt đầu in chính thức' } : { status: 'SAMPLE_APPROVED', note: 'Khách duyệt mẫu 1 sản phẩm' },
    );
  }

  /** Mở cửa sổ sửa mẫu 48h cho 1 dòng (POST /api/orders/:id/items/:itemId/edit-request) */
  openEditRequest(id: string, orderItemId: string): Order | undefined {
    const o = this.getById(id);
    if (!o) return o;
    const now = Date.now();
    const items = o.items.map((i) =>
      i.orderItemId === orderItemId && !i.editRequest?.openedAt
        ? { ...i, editRequest: { openedAt: new Date(now).toISOString(), expiresAt: new Date(now + 48 * 3600 * 1000).toISOString() } }
        : i,
    );
    return this.patch(id, { items });
  }

  /** Khách sửa xong mẫu bị trả về -> gửi lại để PrintiFy kiểm tra (miễn phí) */
  resubmitDesign(id: string, orderItemId: string, designId: string): Order | undefined {
    const o = this.getById(id);
    if (!o) return o;
    const now = new Date().toISOString();
    const items = o.items.map((i) =>
      i.orderItemId === orderItemId
        ? { ...i, designId, designReview: { status: 'PENDING' as const, reason: null, reviewedAt: null, resubmittedAt: now } }
        : i,
    );
    return this.patch(id, { items }, { status: 'DESIGN_RESUBMITTED', note: 'Khách sửa và gửi lại mẫu in để kiểm tra' });
  }

  /**
   * Khách vẫn muốn in mẫu bị cảnh báo (tự chịu rủi ro về các lỗi PrintiFy đã nêu).
   * Mọi mẫu đã đạt hoặc được chấp nhận -> chuyển sang in mẫu thử.
   */
  acceptDesignRisk(id: string, orderItemId: string): Order | undefined {
    const o = this.getById(id);
    if (!o || o.orderStatus !== 'DESIGN_REVIEW') return o;
    const now = new Date().toISOString();
    const items = o.items.map((i) =>
      i.orderItemId === orderItemId && i.designReview?.status === 'REJECTED'
        ? { ...i, designReview: { ...i.designReview, status: 'ACCEPTED_RISK' as const, riskAcceptedAt: now } }
        : i,
    );
    const cleared = items.every((i) => !i.designReview || ['APPROVED', 'ACCEPTED_RISK'].includes(i.designReview.status));
    const changes: Partial<Order> = { items, ...(cleared ? { orderStatus: 'SAMPLE_PRINTING' } : {}) };
    return this.patch(id, changes, {
      status: 'DESIGN_RISK_ACCEPTED',
      note: 'Khách chấp nhận in mẫu hiện tại, tự chịu rủi ro về lỗi đã được cảnh báo' + (cleared ? ' · chuyển sang in mẫu thử' : ''),
    });
  }

  timeline(o: Order): TimelineEntry[] {
    return [...((o as OrderWithTimeline).timeline ?? [])].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  }

  private patch(id: string, changes: Partial<Order>, event?: { status: string; note: string }): Order | undefined {
    const o = this.getById(id) as OrderWithTimeline | undefined;
    if (!o) return undefined;
    const now = new Date().toISOString();
    const timeline = event ? [...(o.timeline ?? []), { ...event, occurredAt: now, actorId: o.userId }] : o.timeline;
    const updated = { ...o, ...changes, timeline, updatedAt: now } as Order;
    this.saveLocal(updated);
    return updated;
  }

  private saveLocal(order: Order): void {
    const local = this.readLocal().filter((o) => o._id !== order._id);
    try {
      localStorage.setItem(LOCAL_ORDERS_KEY, JSON.stringify([...local, order]));
    } catch {
      /* bỏ qua: đơn vẫn còn trong phiên hiện tại */
    }
    this._orders.set([...this._orders().filter((o) => o._id !== order._id), order]);
  }

  private readLocal(): Order[] {
    try {
      const raw = localStorage.getItem(LOCAL_ORDERS_KEY);
      return raw ? (JSON.parse(raw) as Order[]) : [];
    } catch {
      return [];
    }
  }
}
