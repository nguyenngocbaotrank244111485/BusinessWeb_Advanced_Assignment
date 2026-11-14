import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, shareReplay } from 'rxjs';
import { AdminUser } from '../models/admin.models';

const SESSION_KEY = 'pf_admin_session';
const LOCK_KEY = 'pf_admin_lock';
/** Mật khẩu demo chung cho tài khoản Admin (chưa có API). Khi có backend: POST /api/auth/login, mật khẩu hash ở server */
export const DEMO_PASSWORD = 'Admin@123';
const MAX_FAILS = 5;
const LOCK_MINUTES = 10;

/**
 * Đăng nhập Admin (D1) – giai đoạn mock: đọc user-admin.json.
 * Chỉ STAFF / SUPERADMIN vào được; tài khoản khách hàng bị từ chối với cùng một câu báo lỗi chung.
 */
@Injectable({ providedIn: 'root' })
export class AdminAuthService {
  private readonly http = inject(HttpClient);

  readonly user = signal<AdminUser | null>(this.restore());
  readonly isSuperadmin = computed(() => this.user()?.role === 'SUPERADMIN');
  readonly admins$: Observable<AdminUser[]> = this.http.get<AdminUser[]>('/dataset/user-admin.json').pipe(
    catchError(() => of([] as AdminUser[])),
    shareReplay(1),
  );
  private adminList: AdminUser[] = [];

  constructor() {
    this.admins$.subscribe((list) => (this.adminList = list));
  }

  adminName(id: string): string | undefined {
    return this.adminList.find((a) => a._id === id)?.name;
  }

  /** Số phút còn bị khóa (0 = không khóa) */
  lockedMinutes(): number {
    const until = Number(this.read(LOCK_KEY)?.['until'] ?? 0);
    return until > Date.now() ? Math.ceil((until - Date.now()) / 60000) : 0;
  }

  login(email: string, password: string): Observable<{ ok: boolean; message?: string }> {
    return this.admins$.pipe(
      map((list) => {
        if (this.lockedMinutes()) return { ok: false, message: `Đăng nhập sai nhiều lần. Thử lại sau ${this.lockedMinutes()} phút.` };
        const found = list.find((a) => a.email.toLowerCase() === email.trim().toLowerCase());
        if (!found || password !== DEMO_PASSWORD || (found.role !== 'STAFF' && found.role !== 'SUPERADMIN')) {
          const fails = Number(this.read(LOCK_KEY)?.['fails'] ?? 0) + 1;
          this.write(LOCK_KEY, fails >= MAX_FAILS ? { fails: 0, until: Date.now() + LOCK_MINUTES * 60000 } : { fails, until: 0 });
          // không tiết lộ email có tồn tại hay không
          return { ok: false, message: 'Email hoặc mật khẩu không đúng, hoặc tài khoản không có quyền quản trị.' };
        }
        this.write(LOCK_KEY, { fails: 0, until: 0 });
        this.user.set(found);
        this.write(SESSION_KEY, found);
        return { ok: true };
      }),
    );
  }

  logout(): void {
    this.user.set(null);
    try { localStorage.removeItem(SESSION_KEY); } catch { /* bỏ qua */ }
  }

  private restore(): AdminUser | null {
    const u = this.read(SESSION_KEY) as AdminUser | null;
    return u && (u.role === 'STAFF' || u.role === 'SUPERADMIN') ? u : null;
  }

  private read(key: string): Record<string, unknown> | null {
    try {
      return JSON.parse(localStorage.getItem(key) || 'null');
    } catch {
      return null;
    }
  }

  private write(key: string, value: unknown): void {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* bỏ qua */ }
  }
}
