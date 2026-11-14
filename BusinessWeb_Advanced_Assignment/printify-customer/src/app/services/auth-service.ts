import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, map, of, shareReplay } from 'rxjs';
import { PublicUser } from '../models/user.model';

const SESSION_KEY = 'printify_session';

/**
 * Phiên đăng nhập phía khách – bản tối giản cho giai đoạn mock.
 * Trang đăng nhập thật (email/mật khẩu, OTP) thuộc task của Trân Phạm:
 * khi xong chỉ cần gọi login(user) sau khi xác thực thành công.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  private readonly _user = signal<PublicUser | null>(this.restore());
  readonly user = this._user.asReadonly();
  readonly isLoggedIn = computed(() => !!this._user());

  /** Danh sách người dùng công khai (tên người bán, đăng nhập demo) */
  readonly users$: Observable<PublicUser[]> = this.http.get<PublicUser[]>('/dataset/users-public.json').pipe(
    // nhánh khác đặt tên usersInfor.json
    catchError(() => this.http.get<PublicUser[]>('/dataset/usersInfor.json')),
    catchError(() => of([] as PublicUser[])),
    shareReplay(1),
  );

  userName(id: string): Observable<string> {
    return this.users$.pipe(map((list) => list.find((u) => u._id === id)?.name ?? 'Người dùng PrintiFy'));
  }

  login(user: PublicUser): void {
    this._user.set(user);
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    } catch {
      /* trình duyệt chặn lưu trữ: vẫn đăng nhập trong phiên này */
    }
  }

  logout(): void {
    this._user.set(null);
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
      /* bỏ qua */
    }
  }

  private restore(): PublicUser | null {
    try {
      const raw = localStorage.getItem(SESSION_KEY);
      return raw ? (JSON.parse(raw) as PublicUser) : null;
    } catch {
      return null;
    }
  }
}
