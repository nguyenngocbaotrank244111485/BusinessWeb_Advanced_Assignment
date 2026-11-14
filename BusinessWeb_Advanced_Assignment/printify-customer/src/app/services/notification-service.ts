import { Injectable, computed, effect, inject, signal } from '@angular/core';
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

const READ_KEY = 'printify_notifications_read';

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
  private readonly readIds = signal<Set<string>>(new Set());
  readonly loaded = signal(false);

  /** Thông báo của người đang đăng nhập, mới nhất trước */
  readonly items = computed(() => {
    const me = this.auth.user()?._id;
    const read = this.readIds();
    return this.all()
      .filter((n) => n.userId === me)
      .map((n) => ({ ...n, isRead: n.isRead || read.has(n._id) }))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  });
  readonly unread = computed(() => this.items().filter((n) => !n.isRead).length);

  constructor() {
    this.http
      .get<AppNotification[]>('/dataset/notifications.json')
      .pipe(catchError(() => of([] as AppNotification[])))
      .subscribe((list) => {
        this.all.set(list);
        this.loaded.set(true);
      });
    // đổi tài khoản -> đọc lại trạng thái đã đọc của tài khoản đó
    effect(() => this.readIds.set(new Set(this.readStore()[this.auth.user()?._id ?? ''] ?? [])));
  }

  iconOf(type: string): string {
    return NOTIFICATION_ICONS[type] ?? '🔔';
  }

  markRead(id: string): void {
    if (this.readIds().has(id)) return;
    this.persist(new Set([...this.readIds(), id]));
  }

  markAllRead(): void {
    this.persist(new Set([...this.readIds(), ...this.items().map((n) => n._id)]));
  }

  /** Chỉ mở đường dẫn nội bộ (bắt đầu bằng /) */
  safeLink(n: AppNotification): string | null {
    return n.link && n.link.startsWith('/') && !n.link.startsWith('//') ? n.link : null;
  }

  private persist(ids: Set<string>): void {
    this.readIds.set(ids);
    const me = this.auth.user()?._id;
    if (!me) return;
    const store = this.readStore();
    store[me] = [...ids];
    try {
      localStorage.setItem(READ_KEY, JSON.stringify(store));
    } catch {
      /* bỏ qua: vẫn đúng trong phiên hiện tại */
    }
  }

  private readStore(): Record<string, string[]> {
    try {
      return JSON.parse(localStorage.getItem(READ_KEY) || '{}') as Record<string, string[]>;
    } catch {
      return {};
    }
  }
}
