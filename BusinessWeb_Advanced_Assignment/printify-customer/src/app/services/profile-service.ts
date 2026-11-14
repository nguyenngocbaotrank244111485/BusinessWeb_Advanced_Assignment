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
    const local = this.readLocal()[me._id];
    if (local) {
      this.profile.set(local);
      return local;
    }
    const users = await firstValueFrom(this.auth.users$ as unknown as Observable<Partial<Profile>[]>);
    const raw: Partial<Profile> = users.find((u) => u._id === me._id) ?? (me as Partial<Profile>);
    const p: Profile = {
      _id: me._id,
      name: raw.name ?? me.name,
      email: raw.email ?? me.email,
      role: raw.role ?? 'CUSTOMER',
      status: raw.status,
      avatar: raw.avatar ?? null,
      nickname: raw.nickname ?? '',
      birthday: raw.birthday ?? null,
      membership: raw.membership ?? { totalSpent: 0, points: 0 },
      addresses: (raw.addresses ?? []).map((a) => ({ ...a })),
      createdAt: raw.createdAt,
    };
    this.profile.set(p);
    return p;
  }

  /** Lưu toàn bộ hồ sơ (PUT /users/me). Email không được đổi. false = bộ nhớ đầy */
  update(changes: Partial<Pick<Profile, 'name' | 'avatar' | 'addresses' | 'nickname' | 'birthday'>>): boolean {
    const cur = this.profile();
    if (!cur) return false;
    const next: Profile = { ...cur, ...changes, email: cur.email, membership: cur.membership };
    const all = this.readLocal();
    all[next._id] = next;
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(all));
    } catch {
      return false;
    }
    this.profile.set(next);
    // cập nhật tên / avatar trên header
    const session = this.auth.user();
    if (session && (session.name !== next.name || session.avatar !== next.avatar)) {
      this.auth.loginLocal({ ...session, name: next.name, avatar: next.avatar });
    }
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

  private readLocal(): Record<string, Profile> {
    try {
      return JSON.parse(localStorage.getItem(LOCAL_KEY) || '{}') as Record<string, Profile>;
    } catch {
      return {};
    }
  }
}
