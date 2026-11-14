import { Component, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AdminUser } from '../../models/admin.models';
import { AdminAuthService, DEMO_PASSWORD } from '../../services/admin-auth.service';

/** D1 – Đăng nhập Admin: /admin/login (không có sidebar) */
@Component({
  selector: 'app-admin-login',
  standalone: false,
  templateUrl: './admin-login.html',
  styleUrl: './admin-login.css',
})
export class AdminLogin {
  private readonly auth = inject(AdminAuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly demoPassword = DEMO_PASSWORD;
  readonly admins = toSignal(this.auth.admins$, { initialValue: [] as AdminUser[] });
  readonly showPassword = signal(false);
  readonly loading = signal(false);
  readonly error = signal('');

  readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', Validators.required],
  });

  invalid(name: 'email' | 'password'): boolean {
    const c = this.form.controls[name];
    return c.touched && c.invalid;
  }

  fill(a: AdminUser): void {
    this.form.setValue({ email: a.email, password: DEMO_PASSWORD });
    this.error.set('');
  }

  submit(): void {
    this.error.set('');
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    const { email, password } = this.form.getRawValue();
    this.auth.login(email, password).subscribe((r) => {
      this.loading.set(false);
      if (!r.ok) {
        this.error.set(r.message ?? 'Đăng nhập không thành công.');
        return;
      }
      const back = this.route.snapshot.queryParamMap.get('returnUrl');
      // chỉ quay lại route nội bộ của Admin
      this.router.navigateByUrl(back && back.startsWith('/admin/') && !back.startsWith('/admin/login') ? back : '/admin/homepage');
    });
  }
}
