import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, of } from 'rxjs';
import { Order, OrderItem, OrderTotals, ShippingInfo } from '../models/order.model';

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
  }): Order {
    const existing = this._orders().find((o) => o.idempotencyKey === input.idempotencyKey);
    if (existing) return existing;
    const now = new Date();
    const order: Order = {
      _id: 'ord_' + now.getTime().toString(36),
      userId: input.userId,
      orderStatus: 'PENDING_PAYMENT',
      paymentStatus: 'PENDING',
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
