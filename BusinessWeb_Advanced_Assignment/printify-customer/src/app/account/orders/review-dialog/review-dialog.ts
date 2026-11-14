import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { Order } from '../../../models/order.model';
import { OrderService } from '../../../services/order-service';

const LABELS = ['', 'Rất tệ', 'Chưa hài lòng', 'Bình thường', 'Hài lòng', 'Tuyệt vời'];

/** Popup đánh giá đơn hàng đã nhận (1–5 sao + nhận xét) */
@Component({
  selector: 'app-review-dialog',
  standalone: false,
  template: `
    <div class="backdrop" (click)="closed.emit()">
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="rv-title" (click)="$event.stopPropagation()">
        <h2 id="rv-title">Đánh giá đơn {{ order._id.toUpperCase() }}</h2>
        <p class="sub">Chất lượng in và sản phẩm có như bạn mong đợi không?</p>
        <div class="stars" role="radiogroup" aria-label="Số sao">
          @for (s of [1, 2, 3, 4, 5]; track s) {
            <button type="button" role="radio" [attr.aria-checked]="rating() === s" [attr.aria-label]="s + ' sao'"
              [class.on]="s <= (hover() || rating())" (mouseenter)="hover.set(s)" (mouseleave)="hover.set(0)" (click)="rating.set(s)">★</button>
          }
        </div>
        <p class="label">{{ labels[hover() || rating()] || 'Chọn số sao' }}</p>
        <textarea rows="4" maxlength="500" placeholder="Chia sẻ cảm nhận về chất lượng in, đóng gói, giao hàng…" [value]="comment()"
          (input)="comment.set($any($event.target).value)"></textarea>
        <small class="count">{{ comment().length }}/500</small>
        <div class="actions">
          <button type="button" class="btn ghost" (click)="closed.emit()">Để sau</button>
          <button type="button" class="btn primary" [disabled]="!rating()" (click)="submit()">Gửi đánh giá</button>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .backdrop { position: fixed; inset: 0; z-index: 130; background: rgba(46, 37, 56, 0.45); display: grid; place-items: center; padding: 16px; }
    .modal { width: min(440px, 100%); background: #fff; border-radius: var(--pf-radius-lg); padding: 24px; text-align: center; font-family: var(--pf-font); box-shadow: 0 20px 50px rgba(46, 37, 56, 0.25); }
    h2 { margin: 0; font-size: 19px; }
    .sub { margin: 6px 0 14px; color: var(--pf-muted); font-size: 14px; }
    .stars { display: flex; justify-content: center; gap: 6px; }
    .stars button { border: none; background: none; font-size: 38px; line-height: 1; color: #ded8e6; cursor: pointer; padding: 0 2px; transition: transform 0.1s, color 0.1s; }
    .stars button.on { color: #f4b400; }
    .stars button:hover { transform: scale(1.12); }
    .label { margin: 6px 0 12px; font-weight: 700; color: var(--pf-ink); min-height: 20px; }
    textarea { width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1px solid var(--pf-line); border-radius: var(--pf-radius-sm); font: 14px var(--pf-font); resize: vertical; }
    textarea:focus { outline: 2px solid var(--pf-lilac); }
    .count { display: block; text-align: right; font-size: 11px; color: var(--pf-muted); }
    .actions { display: flex; justify-content: center; gap: 10px; margin-top: 14px; }
    .btn { height: 42px; padding: 0 20px; border-radius: var(--pf-radius-sm); border: 1px solid transparent; font: 700 14px var(--pf-font); cursor: pointer; }
    .btn:disabled { opacity: 0.45; cursor: not-allowed; }
    .btn.primary { background: var(--pf-gradient); color: #fff; }
    .btn.ghost { background: #fff; border-color: var(--pf-line); }
  `],
})
export class ReviewDialog {
  @Input({ required: true }) order!: Order;
  @Output() done = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();
  private readonly orders = inject(OrderService);

  readonly labels = LABELS;
  readonly rating = signal(0);
  readonly hover = signal(0);
  readonly comment = signal('');

  submit(): void {
    if (!this.rating()) return;
    this.orders.review(this.order._id, this.rating(), this.comment().trim());
    this.done.emit();
  }
}
