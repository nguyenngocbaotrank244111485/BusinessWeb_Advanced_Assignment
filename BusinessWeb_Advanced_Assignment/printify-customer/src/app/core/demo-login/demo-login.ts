import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { PublicUser } from '../../models/user.model';
import { AuthService } from '../../services/auth-service';

/**
 * Trang đăng nhập TẠM để demo các màn cần đăng nhập (Marketplace, giỏ hàng...).
 * Trang đăng nhập thật (email/mật khẩu, OTP) do Trân Phạm làm sẽ thay route /auth/login.
 */
@Component({
  selector: 'app-demo-login',
  standalone: false,
  template: `
    <main class="wrap">
      <span class="badge">Bản demo</span>
      <h1>Đăng nhập</h1>
      <p class="lead">Chọn một tài khoản mẫu để tiếp tục. Trang đăng nhập bằng email và mật khẩu đang được nhóm hoàn thiện.</p>
      <div class="users">
        @for (u of users(); track u._id) {
          <button type="button" class="user" (click)="choose(u)">
            <span class="avatar" aria-hidden="true">{{ u.name.charAt(0) }}</span>
            <span class="info"><b>{{ u.name }}</b><small>{{ u.email }}</small></span>
            <span class="go" aria-hidden="true">→</span>
          </button>
        } @empty {
          <p class="lead">Đang tải danh sách tài khoản...</p>
        }
      </div>
    </main>
  `,
  styles: [`
    :host { display: block; min-height: calc(100vh - 77px); padding: 56px 16px; background: linear-gradient(140deg, #faf6fe, var(--pf-orchid) 60%, var(--pf-pink-50)); }
    .wrap { box-sizing: border-box; width: min(520px, 100%); margin: 0 auto; padding: 32px 24px; background: #fff; border-radius: 24px; box-shadow: 0 24px 50px #8b57c41a; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 999px; background: var(--pf-pink-50); color: var(--pf-accent); font-size: 12px; font-weight: 750; }
    h1 { margin: 10px 0 6px; font-size: 28px; color: var(--pf-ink); letter-spacing: -.03em; }
    .lead { margin: 0 0 18px; color: var(--pf-muted); font-size: 14px; }
    .users { display: grid; gap: 10px; }
    .user { display: flex; align-items: center; gap: 12px; width: 100%; padding: 12px 14px; border: 1px solid var(--pf-line); border-radius: var(--pf-radius); background: #fff; font: inherit; text-align: left; cursor: pointer; transition: border-color .2s, background .2s; }
    .user:hover, .user:focus-visible { border-color: var(--pf-lavender); background: var(--pf-soft); outline: none; }
    .avatar { flex: 0 0 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; background: var(--pf-gradient); color: #fff; font-weight: 800; }
    .info { flex: 1; min-width: 0; display: grid; }
    .info b { color: var(--pf-ink); }
    .info small { color: var(--pf-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .go { color: var(--pf-primary); font-weight: 800; }
  `],
})
export class DemoLogin {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  /** Chỉ tài khoản đã kích hoạt mới đăng nhập được */
  readonly users = toSignal(this.auth.users$.pipe(map((list) => list.filter((u) => (u.status ?? 'ACTIVE') === 'ACTIVE'))), {
    initialValue: [] as PublicUser[],
  });

  choose(user: PublicUser): void {
    this.auth.loginLocal(user);
    const returnUrl = this.route.snapshot.queryParamMap.get('returnUrl');
    // chỉ chấp nhận đường dẫn nội bộ
    this.router.navigateByUrl(returnUrl && returnUrl.startsWith('/') ? returnUrl : '/');
  }
}
