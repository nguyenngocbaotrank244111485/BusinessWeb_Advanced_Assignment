import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';

/**
 * Trang 404 (wildcard **, Ch.IV 4.3.5).
 * Tạm dùng luôn cho các màn hình chưa xây dựng (truyền data.title trong route).
 */
@Component({
  selector: 'app-not-found',
  standalone: false,
  template: `
    <main class="wrap">
      <span class="icon" aria-hidden="true">{{ title ? '🚧' : '🔎' }}</span>
      <h1>{{ title || 'Không tìm thấy trang' }}</h1>
      <p>{{ title ? 'Trang này đang được nhóm PrintiFy xây dựng. Bạn quay lại sau nhé!' : 'Đường dẫn không tồn tại hoặc đã bị đổi.' }}</p>
      <div class="btns">
        <a routerLink="/products" class="primary">Xem sản phẩm</a>
        <a routerLink="/" class="ghost">Về trang chủ</a>
      </div>
    </main>
  `,
  styles: [`
    :host { display: block; min-height: calc(100vh - 77px); padding: 70px 16px; background: linear-gradient(140deg, #faf6fe, var(--pf-orchid) 60%, var(--pf-pink-50)); }
    .wrap { width: min(560px, 100%); margin: 0 auto; padding: 44px 24px; text-align: center; background: #fff; border-radius: 24px; box-shadow: 0 24px 50px #8b57c41a; }
    .icon { font-size: 48px; }
    h1 { margin: 12px 0 8px; font-size: 26px; color: var(--pf-ink); }
    p { margin: 0; color: var(--pf-muted); }
    .btns { display: flex; justify-content: center; gap: 10px; flex-wrap: wrap; margin-top: 22px; }
    a { padding: 12px 18px; border-radius: var(--pf-radius); font-weight: 750; text-decoration: none; }
    .primary { background: var(--pf-gradient); color: #fff; }
    .ghost { border: 1px solid var(--pf-line); color: var(--pf-ink); }
  `],
})
export class NotFound {
  readonly title: string = inject(ActivatedRoute).snapshot.data['title'] ?? '';
}
