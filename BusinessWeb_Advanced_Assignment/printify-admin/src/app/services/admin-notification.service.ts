import { Injectable, computed, inject, signal } from '@angular/core';
import { AdminDataService } from './admin-data.service';
import { isPaymentExpired } from '../models/labels';

export interface AdminNotification {
  id: string;
  type: 'PAYMENT' | 'DESIGN' | 'CANCEL' | 'LISTING' | 'REPORT' | 'STOCK';
  icon: string;
  title: string;
  body: string;
  at: string;
  /** Route nội bộ (chỉ các route đã cho phép) */
  link: string[];
  query?: Record<string, string>;
  read: boolean;
  forSuperadmin?: boolean;
}

const READ_KEY = 'pf_admin_read_v1';

/**
 * D9 – Thông báo Admin: sinh từ những việc đang chờ xử lý (không phải toàn bộ thông báo của khách).
 * Khi có backend: GET /api/admin/notifications.
 */
@Injectable({ providedIn: 'root' })
export class AdminNotificationService {
  private readonly data = inject(AdminDataService);
  private readonly readIds = signal<Set<string>>(new Set(this.restore()));

  readonly all = computed<AdminNotification[]>(() => {
    const d = this.data;
    const read = this.readIds();
    const now = Date.now();
    const out: Omit<AdminNotification, 'read'>[] = [];

    for (const o of d.orders()) {
      const who = d.userName(o.userId);
      if (o.paymentStatus === 'WAITING_STAFF' && o.orderStatus === 'PENDING_STAFF_CONFIRMATION') {
        out.push({ id: 'pay:' + o._id, type: 'PAYMENT', icon: '💳', title: 'Khách báo đã thanh toán', body: `${who} báo đã chuyển ${this.vnd(o.totals.total)} cho đơn ${o._id.toUpperCase()}. Cần đối soát và xác nhận.`, at: o.paymentClaimedAt || o.updatedAt || o.createdAt, link: ['/admin/orders-detail', o._id], query: { tab: 'payment' } });
      }
      if (o.orderStatus === 'DESIGN_REVIEW') {
        const pending = o.items.filter((i) => i.designId && (i.designReview?.status === 'PENDING' || (i.designReview?.status === 'REJECTED' && i.designReview?.resubmittedAt)));
        if (pending.length) out.push({ id: 'design:' + o._id + ':' + pending.map((i) => i.designReview?.resubmittedAt ?? '').join(''), type: 'DESIGN', icon: '🎨', title: 'Mẫu in chờ kiểm tra', body: `Đơn ${o._id.toUpperCase()} có ${pending.length} mẫu cần kiểm tra trước khi in mẫu thử.`, at: o.paidAt || o.updatedAt || o.createdAt, link: ['/admin/orders-detail', o._id], query: { tab: 'design' } });
      }
      if (o.cancelRequest?.status === 'PENDING' && !isPaymentExpired(o, now)) {
        out.push({ id: 'cancel:' + o._id, type: 'CANCEL', icon: '🛑', title: 'Yêu cầu hủy đơn', body: `${who} xin hủy đơn ${o._id.toUpperCase()}: ${o.cancelRequest.reason}.`, at: o.cancelRequest.requestedAt, link: ['/admin/orders-detail', o._id], query: { tab: 'cancel' } });
      }
    }
    for (const l of d.listings()) {
      if (l.status === 'PENDING_REVIEW') {
        out.push({ id: 'listing:' + l._id + ':' + (l.updatedAt ?? l.createdAt), type: 'LISTING', icon: '🏷️', title: 'Tin Marketplace chờ duyệt', body: `“${l.title}” của ${d.userName(l.sellerId)} đang chờ duyệt.`, at: l.updatedAt ?? l.createdAt, link: ['/admin/marketplace/review', l._id], forSuperadmin: true });
      }
    }
    for (const r of d.reports()) {
      if (r.status === 'OPEN') {
        const l = d.listing(r.listingId);
        out.push({ id: 'report:' + r._id, type: 'REPORT', icon: '🚩', title: 'Báo cáo vi phạm bản quyền', body: `“${l?.title ?? r.listingId}” bị báo cáo: ${r.reason}.`, at: r.createdAt, link: ['/admin/marketplace/review', r.listingId], query: { tab: 'reports' }, forSuperadmin: true });
      }
    }
    for (const p of d.products()) {
      if (!p.isActive) continue;
      const low = p.variants.filter((v) => v.stock <= p.lowStockThreshold);
      if (low.length) {
        const out0 = low.filter((v) => v.stock <= 0).length;
        out.push({ id: 'stock:' + p._id + ':' + low.map((v) => v._id + v.stock).join(','), type: 'STOCK', icon: '📦', title: out0 ? 'Biến thể hết hàng' : 'Biến thể sắp hết hàng', body: `${p.name}: ${low.length} biến thể${out0 ? `, ${out0} đã hết` : ''} (ngưỡng ${p.lowStockThreshold}).`, at: p.updatedAt ?? p.createdAt ?? '2026-11-01T00:00:00.000Z', link: ['/admin/products-detail', p._id], query: { tab: 'stock' } });
      }
    }
    return out
      .map((n) => ({ ...n, read: read.has(n.id) }))
      .sort((a, b) => b.at.localeCompare(a.at));
  });

  readonly unreadCount = computed(() => this.all().filter((n) => !n.read).length);

  markRead(id: string): void {
    const s = new Set(this.readIds());
    s.add(id);
    this.persist(s);
  }

  markAllRead(): void {
    this.persist(new Set([...this.readIds(), ...this.all().map((n) => n.id)]));
  }

  private persist(s: Set<string>): void {
    this.readIds.set(s);
    try { localStorage.setItem(READ_KEY, JSON.stringify([...s])); } catch { /* bỏ qua */ }
  }

  private restore(): string[] {
    try { return JSON.parse(localStorage.getItem(READ_KEY) || '[]'); } catch { return []; }
  }

  private vnd(n: number): string {
    return new Intl.NumberFormat('vi-VN').format(n) + 'đ';
  }
}
