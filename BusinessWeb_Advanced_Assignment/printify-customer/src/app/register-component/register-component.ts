
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
  selector: 'app-register-component',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './register-component.html',
  styleUrl: './register-component.css'
})
export class RegisterComponent {

  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.minLength(2),
        Validators.maxLength(100)
      ]
    }),

    email: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.email
      ]
    }),

    password: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.minLength(8)
      ]
    }),

    confirmPassword: new FormControl('', {
      nonNullable: true,
      validators: Validators.required
    })
  });

  readonly otpForm = new FormGroup({
    otpCode: new FormControl('', {
      nonNullable: true,
      validators: [
        Validators.required,
        Validators.pattern(/^[0-9]{6}$/)
      ]
    })
  });

  busy = false;
  submitted = false;
  otpSent = false;
  showPassword = false;

  errorMessage = '';
  otpError = '';
  demoOtp = '';

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

  requestOtp(): void {
    if (this.busy) return;

    this.submitted = true;
    this.errorMessage = '';

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    const {
      name,
      email,
      password,
      confirmPassword
    } = this.form.getRawValue();

    if (password !== confirmPassword) {
      this.errorMessage =
        'Mật khẩu xác nhận không trùng khớp.';
      return;
    }

    this.busy = true;

    this.auth.requestOtp({
      name: name.trim(),
      email: email.trim(),
      password
    })
    .pipe(takeUntilDestroyed(this.destroyRef))
    .subscribe({
      next: (result) => {
        this.busy = false;
        this.otpSent = true;
        this.otpError = '';

        // Chỉ có ở backend demo localhost
        this.demoOtp = result.demoOtp || '';

        this.otpForm.reset();
      },

      error: (error: HttpErrorResponse) => {
        this.busy = false;

        if (error.status === 409) {
          this.errorMessage =
            'Email đã tồn tại. Vui lòng đăng nhập.';
        } else if (error.status === 429) {
          this.errorMessage =
            'Bạn yêu cầu OTP quá nhiều lần. Hãy thử lại sau.';
        } else if (error.status === 503) {
          this.errorMessage =
            'Server chưa cấu hình chức năng gửi OTP.';
        } else {
          this.errorMessage =
            'Không thể gửi OTP. Vui lòng thử lại.';
        }
      }
    });
  }

  verifyOtp(): void {
    if (this.busy || !this.otpSent) return;

    this.otpError = '';

    if (this.otpForm.invalid) {
      this.otpForm.markAllAsTouched();
      return;
    }

    this.busy = true;

    const email = this.form.controls.email.value.trim();
    const otp = this.otpForm.controls.otpCode.value;

    this.auth.verifyOtp(email, otp)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.busy = false;
          this.otpSent = false;
          this.demoOtp = '';

          // Đăng ký thành công: quay về Homepage
          void this.router.navigateByUrl(this.returnUrl);
        },

        error: (error: HttpErrorResponse) => {
          this.busy = false;

          if (error.status === 400) {
            this.otpError =
              'Mã OTP không chính xác hoặc đã hết hạn.';
          } else if (error.status === 429) {
            this.otpError =
              'Bạn nhập sai OTP quá nhiều lần.';
          } else {
            this.otpError =
              'Xác minh thất bại. Vui lòng thử lại.';
          }
        }
      });
  }

  closeOtp(): void {
    this.otpSent = false;
    this.otpError = '';
    this.demoOtp = '';
  }
}
