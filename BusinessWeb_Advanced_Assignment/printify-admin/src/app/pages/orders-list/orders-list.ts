import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { Order } from '../../models/admin.models';
import { CONFIRM_SUBS, ConfirmSub, ORDER_TABS, OrderTab, PAYMENT_STATUS, confirmSubOf, hasPendingCancel, orderBadge, tabOf } from '../../models/labels';
import { AdminDataService } from '../../services/admin-data.service';

/** D5 – Danh sách đơn: /admin/orders-list?tab=&sub=&q=&page= (bộ lọc nằm trên URL, D6 bấm Quay lại giữ nguyên) */
@Component({
  selector: 'app-orders-list',
  standalone: false,
  templateUrl: './orders-list.html',
  styleUrl: './orders-list.css',
})
export class OrdersList {
  readonly data = inject(AdminDataService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly tabs = ORDER_TABS;
  readonly subs = CONFIRM_SUBS;
  readonly payLabels = PAYMENT_STATUS;
  readonly pageSize = 10;
  readonly tab = signal<OrderTab>('all');
  readonly sub = signal<ConfirmSub>('all');
  readonly q = signal('');
  readonly page = signal(1);
  readonly sort = signal<'new' | 'old'>('new');
  readonly now = signal(Date.now());

  readonly tabCount = computed(() => {
    const c: Record<string, number> = { all: this.data.orders().length };
    for (const o of this.data.orders()) c[tabOf(o, this.now())] = (c[tabOf(o, this.now())] ?? 0) + 1;
    return c;
  });
  readonly subCount = computed(() => {
    const c: Record<string, number> = { all: 0 };
    for (const o of this.data.orders()) {
      const s = confirmSubOf(o, this.now());
      if (s) { c[s] = (c[s] ?? 0) + 1; c['all']++; }
    }
    return c;
  });

  readonly filtered = computed(() => {
    const kw = this.q().trim().toLowerCase();
    const list = this.data.orders().filter((o) => {
      if (this.tab() !== 'all' && tabOf(o, this.now()) !== this.tab()) return false;
      if (this.tab() === 'confirm' && this.sub() !== 'all' && confirmSubOf(o, this.now()) !== this.sub()) return false;
      if (kw && !(o._id.toLowerCase().includes(kw) || this.data.userName(o.userId).toLowerCase().includes(kw) || o.shippingInfo.phone.includes(kw))) return false;
      return true;
    });
    return list.sort((a, b) => (this.sort() === 'new' ? 1 : -1) * b.createdAt.localeCompare(a.createdAt));
  });
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.filtered().length / this.pageSize)));
  readonly paged = computed(() => {
    const p = Math.min(this.page(), this.totalPages());
    return this.filtered().slice((p - 1) * this.pageSize, p * this.pageSize);
  });

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe((m) => {
      this.tab.set((m.get('tab') as OrderTab) || 'all');
      this.sub.set((m.get('sub') as ConfirmSub) || 'all');
      this.q.set(m.get('q') ?? '');
      this.page.set(Number(m.get('page')) || 1);
      this.sort.set(m.get('sort') === 'old' ? 'old' : 'new');
      this.now.set(Date.now());
    });
  }

  go(params: Record<string, string | number | null>): void {
    this.router.navigate([], { relativeTo: this.route, queryParams: { ...params, page: params['page'] ?? null }, queryParamsHandling: 'merge' });
  }

  setTab(t: OrderTab): void {
    this.go({ tab: t === 'all' ? null : t, sub: null });
  }

  open(o: Order): void {
    this.router.navigate(['/admin/orders-detail', o._id]);
  }

  badge(o: Order) {
    return orderBadge(o, this.now());
  }

  qty(o: Order): number {
    return o.items.reduce((s, i) => s + i.qty, 0);
  }

  cancelPending(o: Order): boolean {
    return hasPendingCancel(o);
  }

  /** Việc tiếp theo Staff cần làm với đơn này */
  next(o: Order): string {
    switch (confirmSubOf(o, this.now()) ?? tabOf(o, this.now())) {
      case 'payment_review': return 'Xác nhận thanh toán';
      case 'design_review': return 'Kiểm tra mẫu in';
      case 'cancel_request': return 'Duyệt yêu cầu hủy';
      case 'sample': return o.orderStatus === 'SAMPLE_PRINTING' ? 'In mẫu thử' : 'Chờ khách duyệt mẫu';
      case 'await_payment': return 'Chờ khách quét QR';
      case 'printing': return 'Hoàn tất in';
      case 'printed': return 'Nhập mã vận đơn';
      case 'shipping': return 'Xác nhận đã giao';
      default: return '—';
    }
  }
}
