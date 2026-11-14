import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, of } from 'rxjs';
import { AuthService } from './auth-service';

/** notifications.json */
export interface AppNotification {
  _id: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

/** Icon theo loại thông báo */
export const NOTIFICATION_ICONS: Record<string, string> = {
  ORDER_STATUS: '📦',
  ORDER_PAYMENT: '💳',
  ORDER_SHIPPING: '🚚',
  ORDER_COMPLETED: '✅',
  SAMPLE_READY: '🖨️',
  DESIGN_REJECTED: '⚠️',
  RETURN: '↩️',
  LISTING_APPROVED: '🏷️',
  LISTING_REJECTED: '⛔',
  DESIGN_SALE: '💰',
  MEMBERSHIP: '🏅',
  SURVEY: '📝',
};

const API = '/api/notifications';
const _OLD_READ_KEY = 'printify_notifications_read';

/**
 * C19 – Thông báo trong ứng dụng (chuông trên header + trang /account/notifications).
 * Giai đoạn mock: đọc notifications.json, trạng thái "đã đọc" lưu localStorage theo user.
 * Khi có API: GET /api/notifications, PATCH /api/notifications/:id/read, POST /api/notifications/read-all.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private readonly all = signal<AppNotification[]>([]);
  readonly loaded = signal(false);

  /** Thông báo của người đang đăng nhập (server đã lọc theo phiên), mới nhất trước */
  readonly items = computed(() => [...this.all()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  readonly unread = computed(() => this.items().filter((n) => !n.isRead).length);

  constructor() {
    effect(() => {
      const me = this.auth.user()?._id;
      untracked(() => (me ? this.reload() : this.all.set([])));
    });
  }

  /** GET /api/notifications */
  reload(): void {
    this.http.get<{ items: AppNotification[] }>(API, { withCredentials: true }).pipe(catchError(() => of({ items: [] as AppNotification[] })))
      .subscribe((r) => { this.all.set(r.items); this.loaded.set(true); });
  }

  iconOf(type: string): string {
    return NOTIFICATION_ICONS[type] ?? '🔔';
  }

  markRead(id: string): void {
    if (this.all().find((n) => n._id === id)?.isRead) return;
    this.all.update((l) => l.map((n) => (n._id === id ? { ...n, isRead: true } : n)));
    this.http.patch(`${API}/${id}/read`, {}, { withCredentials: true }).subscribe({ error: () => this.reload() });
  }

  markAllRead(): void {
    this.all.update((l) => l.map((n) => ({ ...n, isRead: true })));
    this.http.patch(`${API}/read-all`, {}, { withCredentials: true }).subscribe({ error: () => this.reload() });
  }

  /** Chỉ mở đường dẫn nội bộ (bắt đầu bằng /) */
  safeLink(n: AppNotification): string | null {
    return n.link && n.link.startsWith('/') && !n.link.startsWith('//') ? n.link : null;
  }
}
