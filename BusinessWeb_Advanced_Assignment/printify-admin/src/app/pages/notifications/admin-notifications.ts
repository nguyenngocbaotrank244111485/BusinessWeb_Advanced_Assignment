import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AdminNotification, AdminNotificationService } from '../../services/admin-notification.service';

/** D9 – Thông báo: các việc đang chờ xác nhận / xử lý */
@Component({
  selector: 'app-admin-notifications',
  standalone: false,
  templateUrl: './admin-notifications.html',
  styleUrl: './admin-notifications.css',
})
export class AdminNotifications {
  readonly notes = inject(AdminNotificationService);
  private readonly router = inject(Router);

  readonly filter = signal<'all' | 'unread' | 'read'>('all');
  readonly type = signal<string>('');
  readonly types = [
    { key: '', label: 'Mọi loại' },
    { key: 'PAYMENT', label: '💳 Thanh toán' },
    { key: 'DESIGN', label: '🎨 Mẫu in' },
    { key: 'CANCEL', label: '🛑 Hủy đơn' },
    { key: 'LISTING', label: '🏷️ Tin chờ duyệt' },
    { key: 'REPORT', label: '🚩 Vi phạm' },
    { key: 'STOCK', label: '📦 Tồn kho' },
  ];

  readonly list = computed(() => this.notes.all().filter((n) => {
    if (this.filter() === 'unread' && n.read) return false;
    if (this.filter() === 'read' && !n.read) return false;
    return !this.type() || n.type === this.type();
  }));

  open(n: AdminNotification): void {
    this.notes.markRead(n.id);
    this.router.navigate(n.link, { queryParams: n.query });
  }
}
