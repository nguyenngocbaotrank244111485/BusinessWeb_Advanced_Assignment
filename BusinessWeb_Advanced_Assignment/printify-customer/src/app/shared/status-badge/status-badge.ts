import { Component, Input } from '@angular/core';

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

/** Nhãn màu trạng thái dùng lại (đơn hàng, yêu cầu, tin đăng...) */
@Component({
  selector: 'app-status-badge',
  standalone: false,
  template: `<span class="badge" [attr.data-tone]="tone"><span class="dot" aria-hidden="true"></span>{{ label }}</span>`,
  styles: [`
    .badge { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 999px; font-size: 12px; font-weight: 750; white-space: nowrap; background: #f1eff4; color: #5d5868; }
    .dot { width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
    [data-tone='info'] { background: #efe8fb; color: #6c42a8; }
    [data-tone='success'] { background: #e3f4ea; color: #24734a; }
    [data-tone='warning'] { background: #fdf0d8; color: #8a5a00; }
    [data-tone='danger'] { background: #fbe4e8; color: #a12a45; }
  `],
})
export class StatusBadge {
  @Input() label = '';
  @Input() tone: BadgeTone = 'neutral';
}
