import { Component, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AppNotification, NotificationService } from '../../services/notification-service';

type Filter = 'all' | 'unread';

/** C19 – Thông báo (/account/notifications): lọc Tất cả / Chưa đọc, đánh dấu đã đọc, mở link */
@Component({
  selector: 'app-notifications-page',
  standalone: false,
  templateUrl: './notifications-page.html',
  styleUrl: './notifications-page.css',
})
export class NotificationsPage {
  readonly ns = inject(NotificationService);
  private readonly router = inject(Router);

  readonly filter = signal<Filter>('all');
  readonly list = computed(() => (this.filter() === 'unread' ? this.ns.items().filter((n) => !n.isRead) : this.ns.items()));

  open(n: AppNotification): void {
    this.ns.markRead(n._id);
    const link = this.ns.safeLink(n);
    if (link) void this.router.navigateByUrl(link);
  }

  /** "5 phút trước", "2 giờ trước", "3 ngày trước", quá 7 ngày thì hiện ngày */
  ago(iso: string): string {
    const diff = Date.now() - Date.parse(iso);
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'Vừa xong';
    if (m < 60) return `${m} phút trước`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} giờ trước`;
    const d = Math.floor(h / 24);
    if (d <= 7) return `${d} ngày trước`;
    return new Date(iso).toLocaleDateString('vi-VN');
  }
}
