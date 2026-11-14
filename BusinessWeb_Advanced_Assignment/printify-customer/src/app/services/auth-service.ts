import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, map, of, shareReplay, tap, throwError } from 'rxjs';

import { AuthResult, CustomerUser, LoginRequest, OtpRequestResult, RegisterRequest } from '../models/auth.model';
import { PublicUser } from '../models/user.model';

const SESSION_KEY = 'printify_session';

/** Lỗi do chưa có backend (server tắt / chưa có route) -> dùng phiên lưu cục bộ */
const isBackendMissing = (e: HttpErrorResponse) => e.status === 0 || e.status === 404 || e.status >= 500;

/**
 * Phiên đăng nhập phía khách.
 * - Đăng nhập thật qua API /api/auth (login, OTP đăng ký, me, logout) – nhánh Trân Nguyễn.
 * - Đăng nhập demo bằng dữ liệu mock users-public.json (loginLocal) – nhánh An.
 * Cả hai cùng ghi vào `currentUser` để mọi màn hình dùng chung.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api/auth';

  readonly currentUser = signal<CustomerUser | PublicUser | null>(this.restore());
  /** Bí danh dùng ở navbar/marketplace */
  readonly user = computed(() => this.currentUser());
  readonly isLoggedIn = computed(() => !!this.currentUser());

  /** Danh sách người dùng công khai (tên người bán, đăng nhập demo) */
  readonly users$: Observable<PublicUser[]> = this.http.get<PublicUser[]>('/dataset/users-public.json').pipe(
    catchError(() => this.http.get<PublicUser[]>('/dataset/usersInfor.json')),
    catchError(() => of([] as PublicUser[])),
    shareReplay(1),
  );

  userName(id: string): Observable<string> {
    return this.users$.pipe(map((list) => list.find((u) => u._id === id)?.name ?? 'Người dùng PrintiFy'));
  }

  checkSession(): Observable<CustomerUser | PublicUser | null> {
    return this.http.get<AuthResult>(`${this.apiUrl}/me`, { withCredentials: true }).pipe(
      map((response) => response.user),
      tap((user) => this.setUser(user)),
      catchError((error: HttpErrorResponse) => {
        if (error.status === 401 || error.status === 403) {
          this.setUser(null);
          return of(null);
        }
        if (isBackendMissing(error)) return of(this.currentUser());
        return throwError(() => error);
      }),
    );
  }

  login(data: LoginRequest): Observable<CustomerUser> {
    return this.http
      .post<AuthResult>(`${this.apiUrl}/login`, data, { withCredentials: true })
      .pipe(
        map((response) => response.user),
        tap((user) => this.setUser(user)),
      );
  }

  /** Đăng nhập demo (không qua server) */
  loginLocal(user: PublicUser): void {
    this.setUser(user);
  }

  requestOtp(data: RegisterRequest): Observable<OtpRequestResult> {
    return this.http.post<OtpRequestResult>(`${this.apiUrl}/register/request-otp`, data, { withCredentials: true });
  }

  verifyOtp(email: string, otp: string): Observable<CustomerUser> {
    return this.http
      .post<AuthResult>(`${this.apiUrl}/register/verify-otp`, { email, otp }, { withCredentials: true })
      .pipe(
        map((response) => response.user),
        tap((user) => this.setUser(user)),
      );
  }

  logout(): Observable<void> {
    return this.http.post<void>(`${this.apiUrl}/logout`, {}, { withCredentials: true }).pipe(
      catchError((error: HttpErrorResponse) => (isBackendMissing(error) ? of(undefined) : throwError(() => error))),
      tap(() => this.setUser(null)),
    );
  }

  private setUser(user: CustomerUser | PublicUser | null): void {
    this.currentUser.set(user);
    try {
      if (user) localStorage.setItem(SESSION_KEY, JSON.stringify(user));
      else localStorage.removeItem(SESSION_KEY);
    } catch {
      /* trình duyệt chặn lưu trữ: vẫn giữ phiên trong bộ nhớ */
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
