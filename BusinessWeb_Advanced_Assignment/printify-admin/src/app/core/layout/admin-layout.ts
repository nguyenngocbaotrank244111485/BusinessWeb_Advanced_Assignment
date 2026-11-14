import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AdminAuthService } from '../../services/admin-auth.service';
import { AdminDataService } from '../../services/admin-data.service';
import { AdminNotification, AdminNotificationService } from '../../services/admin-notification.service';
import { ToastService } from '../../shared/toast.service';
import { confirmSubOf } from '../../models/labels';

/** Bố cục dùng chung D0, D2–D9: sidebar + header (chuông thông báo, tài khoản) */
@Component({
  selector: 'app-admin-layout',
  standalone: false,
  templateUrl: './admin-layout.html',
  styleUrl: './admin-layout.css',
})
export class AdminLayout {
  readonly auth = inject(AdminAuthService);
  readonly data = inject(AdminDataService);
  readonly notes = inject(AdminNotificationService);
  readonly toast = inject(ToastService).toast;
  private readonly router = inject(Router);

  readonly bellOpen = signal(false);
  readonly menuOpen = signal(false);
  readonly latest = computed(() => this.notes.all().slice(0, 5));

  /** Số việc chờ hiện trên sidebar */
  readonly waitingOrders = computed(() => this.data.orders().filter((o) => {
    const s = confirmSubOf(o);
    return s === 'payment_review' || s === 'design_review' || s === 'cancel_request';
  }).length);
  readonly pendingListings = computed(() => this.data.listings().filter((l) => l.status === 'PENDING_REVIEW').length + this.data.reports().filter((r) => r.status === 'OPEN').length);

  readonly nav = [
    { link: '/admin/homepage', icon: '🏠', label: 'Trang chủ', code: 'D0' },
    { link: '/admin/dashboard', icon: '📊', label: 'Dashboard', code: 'D2' },
    { link: '/admin/products-list', icon: '👕', label: 'Sản phẩm', code: 'D3' },
    { link: '/admin/orders-list', icon: '📦', label: 'Đơn hàng', code: 'D5' },
    { link: '/admin/marketplace', icon: '🎨', label: 'Marketplace', code: 'D7' },
    { link: '/admin/notifications', icon: '🔔', label: 'Thông báo', code: 'D9' },
  ];

  badgeFor(code: string): number {
    if (code === 'D5') return this.waitingOrders();
    if (code === 'D7') return this.pendingListings();
    if (code === 'D9') return this.notes.unreadCount();
    return 0;
  }

  open(n: AdminNotification): void {
    this.notes.markRead(n.id);
    this.bellOpen.set(false);
    this.router.navigate(n.link, { queryParams: n.query });
  }

  logout(): void {
    this.auth.logout();
    this.router.navigate(['/admin/login']);
  }
}
