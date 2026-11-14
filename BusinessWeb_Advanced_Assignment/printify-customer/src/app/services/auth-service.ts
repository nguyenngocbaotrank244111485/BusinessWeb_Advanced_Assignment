
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Service, signal } from '@angular/core';
import {
  Observable,
  catchError,
  map,
  of,
  tap,
  throwError
} from 'rxjs';

import {
  AuthResult,
  CustomerUser,
  LoginRequest,
  RegisterRequest,
  OtpRequestResult
} from '../models/auth.model';

@Service()
export class AuthService {

  private readonly http = inject(HttpClient);
  private readonly apiUrl = '/api/auth';

  readonly currentUser = signal<CustomerUser | null>(null);

  checkSession(): Observable<CustomerUser | null> {
    return this.http.get<AuthResult>(
      `${this.apiUrl}/me`,
      { withCredentials: true }
    ).pipe(
      map(response => response.user),
      tap(user => this.currentUser.set(user)),
      catchError((error: HttpErrorResponse) => {
        if (error.status === 401 || error.status === 403) {
          this.currentUser.set(null);
          return of(null);
        }
        return throwError(() => error);
      })
    );
  }

  login(data: LoginRequest): Observable<CustomerUser> {
    return this.http.post<AuthResult>(
      `${this.apiUrl}/login`,
      data,
      { withCredentials: true }
    ).pipe(
      map(response => response.user),
      tap(user => this.currentUser.set(user))
    );
  }

  requestOtp(
    data: RegisterRequest
  ): Observable<OtpRequestResult> {
    return this.http.post<OtpRequestResult>(
      `${this.apiUrl}/register/request-otp`,
      data,
      { withCredentials: true }
    );
  }

  verifyOtp(
    email: string,
    otp: string
  ): Observable<CustomerUser> {
    return this.http.post<AuthResult>(
      `${this.apiUrl}/register/verify-otp`,
      { email, otp },
      { withCredentials: true }
    ).pipe(
      map(response => response.user),
      tap(user => this.currentUser.set(user))
    );
  }

  logout(): Observable<void> {
    return this.http.post<void>(
      `${this.apiUrl}/logout`,
      {},
      { withCredentials: true }
    ).pipe(
      tap(() => this.currentUser.set(null))
    );
  }
}
