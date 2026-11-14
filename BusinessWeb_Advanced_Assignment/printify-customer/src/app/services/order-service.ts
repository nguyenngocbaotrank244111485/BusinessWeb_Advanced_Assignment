import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, tap } from 'rxjs';
import { AuthService } from './auth-service';
import { ApiStatusService } from './api-status-service';
import { Order, OrderItem, OrderTotals, PaymentMethod, ShippingInfo } from '../models/order.model';

/** Mốc trên timeline đơn (orders.timeline[]) */
export interface TimelineEntry {
  status: string;
  occurredAt: string;
  actorId: string;
  note: string;
}
type OrderWithTimeline = Order & { timeline?: TimelineEntry[] };


/**
 * Đơn hàng của khách – dữ liệu từ MongoDB qua /api/orders (server kiểm tra trạng thái, giá, tồn kho).
 * Khi có API: create() = POST /api/orders (kèm idempotencyKey), claimPayment() = POST /api/orders/:id/payment-claim.
 * Không trừ kho khi tạo đơn: kho chỉ trừ khi Staff xác nhận PAID (inventory-policy).
 */
@Injectable({ providedIn: 'root' })
export class OrderService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly api = inject(ApiStatusService);
  private readonly _orders = signal<Order[]>([]);
  readonly orders = this._orders.asReadonly();
  readonly loaded = signal(false);

  constructor() {
    // đơn của người đang đăng nhập: GET /api/orders (tải lại khi đổi tài khoản)
    effect(() => {
      const id = this.auth.user()?._id;
      untracked(() => this.reload(id));
    });
  }

  reload(userId = this.auth.user()?._id): void {
    if (!userId) {
      this._orders.set([]);
      this.loaded.set(true);
      return;
    }
    this.http.get<{ items: Order[] }>('/api/orders', { withCredentials: true }).subscribe({
      next: (r) => { this._orders.set(r.items); this.loaded.set(true); },
      error: () => this.loaded.set(true),
    });
  }

  getById(id: string): Order | undefined {
    return this._orders().find((o) => o._id === id);
  }

  /**
   * Tạo đơn: POST /api/orders. Server lấy các dòng đã chọn trong giỏ (đã lưu trên server), tự tính tiền và ưu đãi hạng,
   * kiểm tra giá / tồn kho (409 nếu đổi), cùng idempotencyKey thì trả lại đơn cũ. KHÔNG trừ kho ở bước này.
   */
  create(input: { shippingInfo: ShippingInfo; idempotencyKey: string; paymentMethod: PaymentMethod }): Observable<Order> {
    return this.http.post<{ order: Order }>('/api/orders', input, { withCredentials: true }).pipe(
      map((r) => r.order),
      tap((o) => this.put(o)),
    );
  }

  /** Khách báo "Tôi đã thanh toán" -> chờ Staff xác nhận (không tự PAID) */
  claimPayment(id: string): Order | undefined {
    const o = this.getById(id);
    if (!o || o.orderStatus !== 'PENDING_PAYMENT') return o;
    const updated: Order = {
      ...o,
      orderStatus: 'PENDING_STAFF_CONFIRMATION',
      paymentStatus: 'WAITING_STAFF',
      paymentClaimedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.saveLocal(updated);
    return this.sync(updated, `/api/orders/${id}/payment-claim`, {});
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
    return this.sync(this.patch(id, { cancelRequest: { reason, note, status: 'PENDING', requestedAt: now, resolvedAt: null, resolveNote: null } }, {
      status: 'CANCEL_REQUESTED',
      note: 'Khách gửi yêu cầu hủy: ' + reason + (note ? ' – ' + note : ''),
    }), `/api/orders/${id}/cancel`, { reason, note });
  }

  /** Đổi địa chỉ nhận hàng (trước khi in) thay vì hủy đơn */
  changeAddress(id: string, info: ShippingInfo): Order | undefined {
    return this.sync(this.patch(id, { shippingInfo: info }, { status: 'ADDRESS_CHANGED', note: 'Khách đổi địa chỉ nhận hàng: ' + [info.detail, info.ward, info.province].join(', ') }), `/api/orders/${id}/address`, { shippingInfo: info }, 'PUT');
  }

  /** Khách xác nhận đã nhận hàng -> Hoàn thành */
  confirmReceived(id: string): Order | undefined {
    return this.sync(this.patch(id, { receivedAt: new Date().toISOString() }, { status: 'RECEIVED', note: 'Khách xác nhận đã nhận được hàng' }), `/api/orders/${id}/received`, {});
  }

  review(id: string, rating: number, comment: string): Order | undefined {
    return this.sync(this.patch(id, { review: { rating, comment, createdAt: new Date().toISOString() } }), `/api/orders/${id}/review`, { rating, comment });
  }

  /** Duyệt mẫu 1 dòng; mọi mẫu đã duyệt -> in chính thức (POST /api/orders/:id/approve-samples) */
  approveSample(id: string, orderItemId: string): Order | undefined {
    const o = this.getById(id);
    if (!o || o.orderStatus !== 'SAMPLE_REVIEW') return o;
    const items = o.items.map((i) => (i.orderItemId === orderItemId ? { ...i, sampleStatus: 'APPROVED', editRequest: null } : i));
    const allOk = items.every((i) => !i.requiresSample || i.sampleStatus === 'APPROVED');
    return this.sync(this.patch(
      id,
      { items, ...(allOk ? { orderStatus: 'PRINT_CONFIRMED' } : {}) },
      allOk ? { status: 'PRINT_CONFIRMED', note: 'Khách duyệt mẫu, bắt đầu in chính thức' } : { status: 'SAMPLE_APPROVED', note: 'Khách duyệt mẫu 1 sản phẩm' },
    ), `/api/orders/${id}/items/${orderItemId}/approve-sample`, {});
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
    return this.sync(this.patch(id, { items }), `/api/orders/${id}/items/${orderItemId}/edit-request`, {});
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
    return this.sync(this.patch(id, { items }, { status: 'DESIGN_RESUBMITTED', note: 'Khách sửa và gửi lại mẫu in để kiểm tra' }), `/api/orders/${id}/items/${orderItemId}/resubmit`, { designId });
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
    return this.sync(this.patch(id, changes, {
      status: 'DESIGN_RISK_ACCEPTED',
      note: 'Khách chấp nhận in mẫu hiện tại, tự chịu rủi ro về lỗi đã được cảnh báo' + (cleared ? ' · chuyển sang in mẫu thử' : ''),
    }), `/api/orders/${id}/items/${orderItemId}/accept-risk`, {});
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

  /** Áp thay đổi ngay trên màn hình rồi gửi server; server trả đơn chuẩn -> thay vào. Lỗi -> tải lại + báo */
  private sync(local: Order | undefined, url: string, body: object, method: 'POST' | 'PUT' = 'POST'): Order | undefined {
    this.http.request<{ order: Order }>(method, url, { body, withCredentials: true }).subscribe({
      next: (r) => this.put(r.order),
      error: (e) => { this.api.report(e, 'Không cập nhật được đơn hàng.'); this.reload(); },
    });
    return local;
  }

  private saveLocal(order: Order): void {
    this.put(order);
  }

  private put(order: Order): void {
    this._orders.set([...this._orders().filter((o) => o._id !== order._id), order]);
  }
}
