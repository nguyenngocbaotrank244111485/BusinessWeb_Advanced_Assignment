import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, firstValueFrom, map, of, shareReplay } from 'rxjs';
import { AdminUser } from '../models/admin.models';

/** Mật khẩu demo do `npm run seed` đặt cho mọi tài khoản nhân viên (chỉ để điền nhanh trên máy local) */
export const DEMO_PASSWORD = 'Admin@123';
const API = '/api/admin/auth';

/**
 * Đăng nhập Admin (D1) – POST /api/admin/auth/login, phiên lưu ở server (cookie pf.admin.sid, collection adminSessions).
 * Server kiểm tra mật khẩu (hash), khóa 10 phút sau 5 lần sai, chỉ STAFF / SUPERADMIN vào được
 * (tài khoản khách bị từ chối với cùng một câu báo lỗi chung).
 */
@Injectable({ providedIn: 'root' })
export class AdminAuthService {
  private readonly http = inject(HttpClient);

  readonly user = signal<AdminUser | null>(null);
  readonly isSuperadmin = computed(() => this.user()?.role === 'SUPERADMIN');
  /** Tài khoản demo hiện ở màn đăng nhập (server chỉ trả khi chạy local) */
  readonly admins$: Observable<AdminUser[]> = this.http.get<{ items: AdminUser[] }>(`${API}/demo-accounts`).pipe(
    map((r) => r.items),
    catchError(() => of([] as AdminUser[])),
    shareReplay(1),
  );
  /** Xong khi đã hỏi server phiên hiện tại (guard chờ cái này) */
  readonly ready: Promise<void>;

  constructor() {
    this.ready = firstValueFrom(this.http.get<{ user: AdminUser }>(`${API}/me`, { withCredentials: true }))
      .then((r) => this.user.set(r.user))
      .catch(() => this.user.set(null));
  }

  adminName(_id: string): string | undefined {
    return undefined;
  }

  login(email: string, password: string): Observable<{ ok: boolean; message?: string }> {
    return this.http.post<{ user: AdminUser }>(`${API}/login`, { email, password }, { withCredentials: true }).pipe(
      map((r) => {
        this.user.set(r.user);
        return { ok: true };
      }),
      catchError((e: HttpErrorResponse) =>
        of({ ok: false, message: e.status === 0 || e.status >= 500 ? 'Chưa kết nối được server (chạy npm run dev trong printify-server).' : e.error?.message ?? 'Đăng nhập không thành công.' }),
      ),
    );
  }

  logout(): void {
    this.user.set(null);
    this.http.post(`${API}/logout`, {}, { withCredentials: true }).subscribe({ error: () => undefined });
  }
}
