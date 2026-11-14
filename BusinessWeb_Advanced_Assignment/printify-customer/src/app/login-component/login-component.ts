
import { Component, DestroyRef, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';

import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';

import {
  ActivatedRoute,
  Router,
  RouterLink
} from '@angular/router';

import { takeUntilDestroyed }
  from '@angular/core/rxjs-interop';

import { AuthService }
  from '../services/auth-service';

@Component({
  selector: 'app-login-component',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './login-component.html',
  styleUrl: './login-component.css'
})
export class LoginComponent {

  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  readonly form = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.email
      ]
    }),

    password: new FormControl('', {
      nonNullable: true,
      validators: Validators.required
    })
  });

  busy = false;
  submitted = false;
  showPassword = false;
  errorMessage = '';

  // Nhấn Login từ Homepage => '/'
  // Bị Guard chuyển sang Login => quay về trang cần mở
  get returnUrl(): string {
    const url =
      this.route.snapshot.queryParamMap.get('returnUrl') || '/';

    if (
      !url.startsWith('/') ||
      url.startsWith('//') ||
      url.startsWith('/\\') ||
      url.startsWith('/auth/')
    ) {
      return '/';
    }

    return url;
  }

  submit(): void {
    if (this.busy) return;

    this.submitted = true;
    this.errorMessage = '';

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.busy = true;

    const { email, password } = this.form.getRawValue();

    this.auth.login({
      email: email.trim(),
      password
    })
    .pipe(takeUntilDestroyed(this.destroyRef))
    .subscribe({
      next: () => {
        this.busy = false;

        // Mặc định quay về Homepage PrintiFy
        void this.router.navigateByUrl(this.returnUrl);
      },

      error: (error: HttpErrorResponse) => {
        this.busy = false;

        if (error.status === 401) {
          this.errorMessage = 'Email hoặc mật khẩu không đúng.';
        } else if (error.status === 403) {
          this.errorMessage =
            'Tài khoản chưa được kích hoạt hoặc đã bị khóa.';
        } else if (error.status === 429) {
          this.errorMessage =
            'Bạn đăng nhập quá nhiều lần. Vui lòng thử lại sau.';
        } else {
          this.errorMessage =
            'Không thể đăng nhập. Hãy kiểm tra kết nối server.';
        }
      }
    });
  }
}
