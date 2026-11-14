import { ApiStatusService } from './api-status-service';
import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, firstValueFrom, map, of, shareReplay } from 'rxjs';
import { AuthService } from './auth-service';
import { MembershipInfo, membershipOf } from '../models/membership.model';

/** Địa chỉ nhận hàng (users.addresses[] – Data Dictionary V4.2) */
export interface Address {
  _id: string;
  name: string; // 2..100 ký tự
  phone: string; // ^0\d{9}$
  province: string;
  ward: string;
  detail: string; // 1..200 ký tự
  isDefault: boolean;
}

export interface Profile {
  _id: string;
  name: string;
  email: string;
  role: string;
  status?: string;
  avatar: string | null;
  /** Biệt danh hiển thị (tùy chọn, ≤ 30 ký tự) */
  nickname?: string;
  /** Ngày sinh yyyy-MM-dd */
  birthday?: string | null;
  /** Tổng chi tiêu + điểm -> hạng thành viên (chỉ đọc, do hệ thống tính) */
  membership?: { totalSpent: number; points?: number };
  addresses: Address[];
  createdAt?: string;
}

export const MAX_ADDRESSES = 5;
const LOCAL_KEY = 'printify_profiles';

/**
 * C18 – Hồ sơ & sổ địa chỉ.
 * Giai đoạn mock: đọc users-public.json, thay đổi lưu localStorage theo userId (ghi đè cả profile,
 * đúng tinh thần PUT /api/users/me gửi toàn bộ mảng addresses).
 * Khi có API: thay load() = GET /api/users/me, update() = PUT /api/users/me.
 */
@Injectable({ providedIn: 'root' })
export class ProfileService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly api = inject(ApiStatusService);

  readonly profile = signal<Profile | null>(null);
  /** Hạng thành viên của người đang đăng nhập (null = chưa đăng nhập / chưa tải) */
  readonly membership = computed<MembershipInfo | null>(() => {
    const p = this.profile();
    if (!p || p._id !== this.auth.user()?._id) return null;
    return membershipOf(p.membership?.totalSpent ?? 0, p.membership?.points ?? 0);
  });
  readonly provinces$: Observable<string[]> = this.http
    .get<string[]>('/dataset/vn-provinces.json')
    .pipe(catchError(() => of([] as string[])), shareReplay(1));

  /** Tải hồ sơ người đang đăng nhập */
  async load(): Promise<Profile | null> {
    const me = this.auth.user();
    if (!me) {
      this.profile.set(null);
      return null;
    }
    try {
      const r = await firstValueFrom(this.http.get<{ profile: Profile }>('/api/users/me', { withCredentials: true }));
      this.profile.set(r.profile);
      return r.profile;
    } catch {
      this.profile.set(null);
      return null;
    }
  }

  /**
   * PUT /api/users/me (gửi cả mảng addresses). Hiện ngay trên màn hình, server kiểm tra lại;
   * server từ chối -> tải lại hồ sơ thật + báo lỗi.
   */
  update(changes: Partial<Pick<Profile, 'name' | 'avatar' | 'addresses' | 'nickname' | 'birthday'>>): boolean {
    const cur = this.profile();
    if (!cur) return false;
    this.profile.set({ ...cur, ...changes, email: cur.email, membership: cur.membership });
    this.http.put<{ profile: Profile }>('/api/users/me', changes, { withCredentials: true }).subscribe({
      next: (r) => {
        this.profile.set(r.profile);
        const session = this.auth.user();
        if (session && (session.name !== r.profile.name || session.avatar !== r.profile.avatar)) {
          this.auth.loginLocal({ ...session, name: r.profile.name, avatar: r.profile.avatar });
        }
      },
      error: (e) => { this.api.report(e, 'Không lưu được hồ sơ.'); this.load(); },
    });
    return true;
  }

  newAddressId(): string {
    return 'adr_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  }

  /**
   * Đổi mật khẩu: PUT /api/users/me/password.
   * Chưa có server thì báo rõ là chế độ demo, không giả vờ đã đổi thành công.
   */
  changePassword(currentPassword: string, newPassword: string): Observable<'OK' | 'WRONG' | 'NO_SERVER'> {
    return this.http
      .put('/api/users/me/password', { currentPassword, newPassword }, { withCredentials: true })
      .pipe(
        map(() => 'OK' as const),
        catchError((e: HttpErrorResponse) => {
          if (e.status === 400 || e.status === 401 || e.status === 403) return of('WRONG' as const);
          return of('NO_SERVER' as const);
        }),
      );
  }
}
