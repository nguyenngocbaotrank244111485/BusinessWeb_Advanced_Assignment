import { Component, inject } from '@angular/core';
import { Location } from '@angular/common';
import { Router } from '@angular/router';

const STYLES = [`
  :host { display: grid; place-items: center; min-height: 100vh; padding: 24px 16px; background: linear-gradient(140deg, #faf6fe, var(--pf-orchid) 60%, var(--pf-pink-50)); }
  .box { width: min(520px, 100%); padding: 36px 28px; text-align: center; background: #fff; border-radius: 22px; box-shadow: 0 24px 60px #8b57c41f; }
  .code { font-size: 84px; font-weight: 900; line-height: 1; background: var(--pf-gradient); -webkit-background-clip: text; background-clip: text; color: transparent; }
  h1 { margin: 10px 0 6px; font-size: 22px; }
  p { margin: 0 auto; max-width: 400px; color: var(--pf-muted); }
  code { padding: 2px 6px; border-radius: 6px; background: var(--pf-soft); color: var(--pf-primary-dark); word-break: break-all; }
  .row { justify-content: center; margin-top: 20px; }
`];

/** D10 – Không có quyền (403): /admin/forbidden. Không tự đăng xuất. */
@Component({
  selector: 'app-admin-forbidden',
  standalone: false,
  template: `
    <section class="box">
      <div class="code" aria-hidden="true">403</div>
      <h1>Bạn không có quyền truy cập</h1>
      <p>Chức năng này dành cho vai trò khác (ví dụ SUPERADMIN). Bạn vẫn đang đăng nhập, có thể quay lại làm việc tiếp.</p>
      <div class="row">
        <button type="button" class="btn" (click)="back()">← Quay lại</button>
        <a class="btn primary" routerLink="/admin/homepage">Về trang chủ Admin</a>
      </div>
    </section>`,
  styles: STYLES,
})
export class AdminForbidden {
  private readonly location = inject(Location);
  private readonly router = inject(Router);
  back(): void {
    if (window.history.length > 1) this.location.back();
    else this.router.navigate(['/admin/homepage']);
  }
}

/** D11 – Không tìm thấy (404): /admin/** */
@Component({
  selector: 'app-admin-not-found',
  standalone: false,
  template: `
    <section class="box">
      <div class="code" aria-hidden="true">404</div>
      <h1>Không tìm thấy trang</h1>
      <p>Đường dẫn <code>{{ path }}</code> không tồn tại trong trang quản trị.</p>
      <div class="row">
        <button type="button" class="btn" (click)="back()">← Quay lại</button>
        <a class="btn primary" routerLink="/admin/homepage">Về trang chủ Admin</a>
      </div>
    </section>`,
  styles: STYLES,
})
export class AdminNotFound {
  private readonly location = inject(Location);
  private readonly router = inject(Router);
  readonly path = this.router.url.split('?')[0];
  back(): void {
    if (window.history.length > 1) this.location.back();
    else this.router.navigate(['/admin/homepage']);
  }
}
