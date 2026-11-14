import { Component, computed, inject, signal } from '@angular/core';
import { AdminDataService } from '../../services/admin-data.service';
import { COLOR_LABELS, DIMENSIONS, ORDER_STATUS, isPaymentExpired } from '../../models/labels';
import { OrderStatus } from '../../models/admin.models';

const DAY = 86400000;

/**
 * D2 – Dashboard: số liệu tính từ dữ liệu thật (không số giả), lọc theo khoảng ngày.
 * Gồm cả thống kê khảo sát TAM (nhóm chốt gộp vào Dashboard).
 * Khi có backend: GET /api/admin/dashboard?from=&to=
 */
@Component({
  selector: 'app-admin-dashboard',
  standalone: false,
  templateUrl: './admin-dashboard.html',
  styleUrl: './admin-dashboard.css',
})
export class AdminDashboard {
  readonly data = inject(AdminDataService);
  readonly dims = DIMENSIONS;

  readonly from = signal(this.iso(Date.now() - 30 * DAY));
  readonly to = signal(this.iso(Date.now()));
  readonly includeDemo = signal(true);
  readonly fromInput = signal(this.from());
  readonly toInput = signal(this.to());

  private inRange(at: string | null | undefined): boolean {
    if (!at) return false;
    const t = Date.parse(at);
    return t >= Date.parse(this.from()) && t < Date.parse(this.to()) + DAY;
  }

  readonly orders = computed(() => this.data.orders().filter((o) => this.inRange(o.createdAt)));
  readonly paidOrders = computed(() => this.data.orders().filter((o) => o.paymentStatus === 'PAID' && o.orderStatus !== 'CANCELLED' && this.inRange(o.paidAt ?? o.createdAt)));
  readonly revenue = computed(() => {
    const r = { product: 0, design: 0, discount: 0, shipping: 0, total: 0 };
    for (const o of this.paidOrders()) {
      r.product += o.totals.productSubtotal; r.design += o.totals.designFees; r.discount += o.totals.discount; r.shipping += o.totals.shipping; r.total += o.totals.total;
    }
    return r;
  });

  readonly byStatus = computed(() => {
    const counts = new Map<string, number>();
    for (const o of this.orders()) {
      const key = isPaymentExpired(o) ? 'CANCELLED' : o.orderStatus;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const max = Math.max(1, ...counts.values());
    return (Object.keys(ORDER_STATUS) as OrderStatus[]).map((s) => ({ status: s, label: ORDER_STATUS[s].label, value: counts.get(s) ?? 0, pct: ((counts.get(s) ?? 0) / max) * 100 }));
  });

  readonly topProducts = computed(() => {
    const m = new Map<string, { name: string; qty: number; revenue: number }>();
    for (const o of this.paidOrders()) for (const i of o.items) {
      const x = m.get(i.productId) ?? { name: i.productName, qty: 0, revenue: 0 };
      x.qty += i.qty; x.revenue += i.qty * i.unitPrice;
      m.set(i.productId, x);
    }
    const list = [...m.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.qty - a.qty).slice(0, 5);
    const max = Math.max(1, ...list.map((x) => x.qty));
    return list.map((x) => ({ ...x, pct: (x.qty / max) * 100 }));
  });

  readonly stock = computed(() => {
    const low: { id: string; name: string; variant: string; stock: number }[] = [];
    let out = 0, lowCount = 0;
    for (const p of this.data.products()) {
      if (!p.isActive) continue;
      for (const v of p.variants) {
        if (v.stock <= 0) out++;
        else if (v.stock <= p.lowStockThreshold) lowCount++;
        if (v.stock <= p.lowStockThreshold) low.push({ id: p._id, name: p.name, variant: [COLOR_LABELS[v.color] ?? v.color, v.size].filter(Boolean).join(' / '), stock: v.stock });
      }
    }
    return { out, low: lowCount, list: low.sort((a, b) => a.stock - b.stock).slice(0, 6) };
  });

  readonly market = computed(() => {
    const sales = this.data.designSales().filter((s) => s.status !== 'REVERSED' && this.inRange(s.recordedAt));
    return {
      count: sales.length,
      seller: sales.reduce((s, x) => s + x.sellerPrice, 0),
      fee: sales.reduce((s, x) => s + x.platformFee, 0),
      pending: this.data.listings().filter((l) => l.status === 'PENDING_REVIEW').length,
      approved: this.data.listings().filter((l) => l.status === 'APPROVED').length,
      reports: this.data.reports().filter((r) => r.status === 'OPEN').length,
    };
  });

  // ---------- Khảo sát TAM ----------
  readonly responses = computed(() => this.data.surveyResponses().filter((r) => this.includeDemo() || !r.demo));
  readonly demoCount = computed(() => this.data.surveyResponses().filter((r) => r.demo).length);
  readonly tam = computed(() => {
    const rs = this.responses();
    return this.dims.map((d) => {
      const scores = rs.flatMap((r) => r.answers.filter((a) => a.dimension === d.key).map((a) => a.score));
      const avg = scores.length ? scores.reduce((s, x) => s + x, 0) / scores.length : 0;
      return { ...d, avg, n: scores.length, pct: (avg / 5) * 100 };
    });
  });
  readonly distribution = computed(() => {
    const c = [0, 0, 0, 0, 0];
    for (const r of this.responses()) for (const a of r.answers) if (a.score >= 1 && a.score <= 5) c[a.score - 1]++;
    const total = c.reduce((s, x) => s + x, 0) || 1;
    const max = Math.max(1, ...c);
    return c.map((v, i) => ({ score: i + 1, value: v, pct: (v / total) * 100, h: (v / max) * 80 }));
  });
  readonly questions = computed(() => {
    const rs = this.responses();
    return this.data.surveyQuestions().map((q) => {
      const s = rs.flatMap((r) => r.answers.filter((a) => a.questionId === q._id).map((a) => a.score));
      return { ...q, avg: s.length ? s.reduce((a, b) => a + b, 0) / s.length : 0, n: s.length };
    });
  });
  readonly showQuestions = signal(false);

  apply(): void {
    let f = this.fromInput(), t = this.toInput();
    if (f && t && f > t) [f, t] = [t, f];
    this.from.set(f || this.iso(Date.now() - 30 * DAY));
    this.to.set(t || this.iso(Date.now()));
  }

  preset(days: number): void {
    this.fromInput.set(this.iso(Date.now() - days * DAY));
    this.toInput.set(this.iso(Date.now()));
    this.apply();
  }

  /** Xuất CSV phiếu khảo sát để phân tích TAM (không có tên người trả lời) */
  exportCsv(): void {
    const qs = this.data.surveyQuestions();
    const rows = [['responseId', 'submittedAt', 'demo', ...qs.map((q) => q._id)]];
    for (const r of this.responses()) {
      const m = new Map(r.answers.map((a) => [a.questionId, a.score]));
      rows.push([r._id, r.submittedAt, r.demo ? '1' : '0', ...qs.map((q) => String(m.get(q._id) ?? ''))]);
    }
    const blob = new Blob(['﻿' + rows.map((r) => r.join(',')).join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'printify-tam-survey.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  private iso(t: number): string {
    return new Date(t).toISOString().slice(0, 10);
  }
}
