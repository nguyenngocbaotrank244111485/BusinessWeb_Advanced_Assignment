import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

// Temporary screen: tests protected routing without pretending Cart/Editor exists.
@Component({
  selector: 'app-protected-feature',
  standalone: true,
  imports: [RouterLink],
  template: `<section class="pf-pending"><p>PrintiFy · Tài khoản khách hàng</p><h1>{{ title }}</h1>
  <div role="status">Bạn đã đăng nhập và có quyền mở trang này. Tính năng đang được phát triển; đây chưa phải giỏ hàng, editor hay trang đơn hàng hoàn chỉnh.</div>
  <a routerLink="/">Về trang chủ</a> · <a routerLink="/survey">Khảo sát TAM</a></section>`,
  styles: [`.pf-pending{min-height:50vh;padding:75px 24px;text-align:center;font-family:Inter,'Segoe UI',sans-serif;color:#2a2544;background:#faf9ff}.pf-pending h1{font-size:34px}.pf-pending div{max-width:650px;margin:25px auto;padding:22px;border:1px solid #ddd7f0;border-radius:12px;background:white}.pf-pending a{color:#6042d9;font-weight:700}`]
})
export class ProtectedFeatureComponent {
  private readonly route = inject(ActivatedRoute);
  get title(): string {
    return (this.route.snapshot.data['title'] as string) || 'Tính năng đang phát triển';
  }
}