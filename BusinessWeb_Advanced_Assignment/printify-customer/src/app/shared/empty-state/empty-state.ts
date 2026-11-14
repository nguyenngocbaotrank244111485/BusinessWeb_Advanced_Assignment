import { Component, EventEmitter, Input, Output } from '@angular/core';

/** Khối "không có dữ liệu" dùng lại, có nút hành động tùy chọn */
@Component({
  selector: 'app-empty-state',
  standalone: false,
  template: `
    <div class="state">
      <span class="icon" aria-hidden="true">{{ icon }}</span>
      <h3>{{ title }}</h3>
      @if (message) { <p>{{ message }}</p> }
      @if (actionText) { <button type="button" (click)="action.emit()">{{ actionText }}</button> }
    </div>
  `,
  styles: [`
    .state { padding: 44px 20px; text-align: center; background: #fff; border: 1px solid var(--pf-line); border-radius: var(--pf-radius-lg); color: var(--pf-muted); }
    .icon { font-size: 40px; }
    h3 { margin: 10px 0 4px; color: var(--pf-ink); }
    p { margin: 0; }
    button { margin-top: 14px; padding: 11px 18px; border: 0; border-radius: var(--pf-radius); background: var(--pf-gradient); color: #fff; font: inherit; font-weight: 750; cursor: pointer; }
  `],
})
export class EmptyState {
  @Input() icon = '📭';
  @Input() title = 'Chưa có dữ liệu';
  @Input() message = '';
  @Input() actionText = '';
  @Output() action = new EventEmitter<void>();
}
