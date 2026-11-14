import { Component, inject } from '@angular/core';
import { Location } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';

/**
 * C24 – 404 Không tìm thấy trang (route wildcard **).
 * Route có data.title = màn hình nhóm chưa xây dựng -> hiện "Đang xây dựng" thay vì 404.
 */
@Component({
  selector: 'app-not-found',
  standalone: false,
  template: `
    @if (title) {
      <main class="wrap soon">
        <span class="icon" aria-hidden="true">🚧</span>
        <h1>{{ title }}</h1>
        <p>Trang này đang được nhóm PrintiFy xây dựng. Bạn quay lại sau nhé!</p>
        <div class="btns">
          <a routerLink="/products" class="primary">Xem sản phẩm</a>
          <a routerLink="/" class="ghost">Về trang chủ</a>
        </div>
      </main>
    } @else {
      <main class="wrap">
        <div class="code" aria-hidden="true"><span>4</span><span class="zero">0</span><span>4</span></div>
        <h1>Không tìm thấy trang</h1>
        <p>Đường dẫn <code>{{ path }}</code> không tồn tại hoặc đã bị đổi. Bạn thử tìm sản phẩm hoặc đi tiếp từ các trang dưới đây nhé.</p>

        <form class="search" role="search" (submit)="$event.preventDefault(); search(q.value)">
          <input #q type="search" placeholder="Tìm sản phẩm, ví dụ: áo thun, cốc sứ..." aria-label="Tìm sản phẩm" />
          <button type="submit">Tìm</button>
        </form>

        <div class="btns">
          <a routerLink="/" class="primary">Về trang chủ</a>
          <button type="button" class="ghost" (click)="back()">← Quay lại trang trước</button>
        </div>

        <nav class="links" aria-label="Trang gợi ý">
          <a routerLink="/products"><span aria-hidden="true">👕</span><b>Sản phẩm</b><small>Chọn phôi để thiết kế</small></a>
          <a routerLink="/market"><span aria-hidden="true">🎨</span><b>Marketplace</b><small>Mẫu thiết kế có sẵn</small></a>
          <a routerLink="/cart"><span aria-hidden="true">🛒</span><b>Giỏ hàng</b><small>Xem lại món đã chọn</small></a>
          <a routerLink="/about"><span aria-hidden="true">💜</span><b>Giới thiệu</b><small>Về PrintiFy</small></a>
        </nav>
      </main>
    }
  `,
  styles: [`
    :host { display: block; min-height: calc(100vh - 77px); padding: 56px 16px; background: linear-gradient(140deg, #faf6fe, var(--pf-orchid) 60%, var(--pf-pink-50)); }
    .wrap { box-sizing: border-box; width: min(680px, 100%); margin: 0 auto; padding: 40px 28px; text-align: center; background: #fff; border-radius: 24px; box-shadow: 0 24px 50px #8b57c41a; }
    .soon { width: min(560px, 100%); }
    .icon { font-size: 48px; }
    .code { display: flex; justify-content: center; gap: 4px; font-size: clamp(72px, 16vw, 120px); font-weight: 900; line-height: 1; letter-spacing: -.04em; }
    .code span { background: var(--pf-gradient); -webkit-background-clip: text; background-clip: text; color: transparent; }
    .code .zero { display: inline-block; animation: wobble 3s ease-in-out infinite; }
    @keyframes wobble { 0%, 100% { transform: rotate(0); } 50% { transform: rotate(-10deg) translateY(-4px); } }
    @media (prefers-reduced-motion: reduce) { .code .zero { animation: none; } }
    h1 { margin: 14px 0 8px; font-size: 26px; color: var(--pf-ink); }
    p { margin: 0 auto; max-width: 520px; line-height: 1.6; color: var(--pf-muted); }
    code { padding: 2px 6px; border-radius: 6px; background: var(--pf-soft); color: var(--pf-primary-dark); font-size: 13px; word-break: break-all; }
    .search { display: flex; gap: 8px; max-width: 460px; margin: 22px auto 0; }
    .search input { flex: 1; min-width: 0; height: 46px; padding: 0 14px; border: 1px solid var(--pf-line); border-radius: var(--pf-radius); font: inherit; }
    .search input:focus { outline: 2px solid var(--pf-lilac); border-color: var(--pf-primary); }
    .search button { padding: 0 18px; border: 0; border-radius: var(--pf-radius); background: var(--pf-ink); color: #fff; font: inherit; font-weight: 750; cursor: pointer; }
    .btns { display: flex; justify-content: center; gap: 10px; flex-wrap: wrap; margin-top: 16px; }
    .btns a, .btns button { padding: 12px 18px; border-radius: var(--pf-radius); font: inherit; font-weight: 750; text-decoration: none; cursor: pointer; }
    .primary { border: 0; background: var(--pf-gradient); color: #fff; }
    .ghost { border: 1px solid var(--pf-line); background: #fff; color: var(--pf-ink); }
    .links { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-top: 30px; padding-top: 24px; border-top: 1px solid var(--pf-line); }
    .links a { display: grid; gap: 2px; justify-items: center; padding: 14px 8px; border-radius: var(--pf-radius); text-decoration: none; color: var(--pf-ink); background: var(--pf-soft); transition: transform .15s, background .15s; }
    .links a:hover { transform: translateY(-2px); background: var(--pf-pink-50); }
    .links span { font-size: 24px; }
    .links b { font-size: 14px; }
    .links small { font-size: 12px; color: var(--pf-muted); }
    @media (max-width: 600px) { .links { grid-template-columns: repeat(2, 1fr); } .wrap { padding: 32px 18px; } }
  `],
})
export class NotFound {
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  readonly title: string = inject(ActivatedRoute).snapshot.data['title'] ?? '';
  /** Đường dẫn người dùng gõ sai (bỏ query cho gọn) */
  readonly path = this.router.url.split('?')[0];

  search(q: string): void {
    const kw = q.trim();
    this.router.navigate(['/products'], { queryParams: kw ? { q: kw } : {} });
  }

  /** Không có trang trước (mở thẳng link sai) -> về trang chủ */
  back(): void {
    if (window.history.length > 1) this.location.back();
    else this.router.navigate(['/']);
  }
}
