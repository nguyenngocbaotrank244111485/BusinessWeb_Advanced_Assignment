import { Component, EventEmitter, Output, inject } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';

export interface ReportPayload { reason: string; description: string; }

/** Hộp thoại báo cáo vi phạm bản quyền (Reactive Form) */
@Component({
  selector: 'app-report-dialog',
  standalone: false,
  template: `
    <div class="backdrop" (click)="cancel.emit()"></div>
    <form class="dialog" role="dialog" aria-modal="true" aria-labelledby="report-title" [formGroup]="form" (ngSubmit)="submit()">
      <h2 id="report-title">Báo cáo vi phạm bản quyền</h2>
      <p class="hint">Nhóm kiểm duyệt sẽ xem xét báo cáo của bạn. Tin bị báo cáo đúng sẽ bị tạm ẩn.</p>

      <label for="report-reason">Lý do</label>
      <select id="report-reason" formControlName="reason">
        <option value="" disabled>Chọn lý do</option>
        @for (r of reasons; track r) { <option [value]="r">{{ r }}</option> }
      </select>
      @if (form.controls.reason.touched && form.controls.reason.invalid) { <small class="err">Bạn chọn một lý do nhé.</small> }

      <label for="report-desc">Mô tả chi tiết</label>
      <textarea id="report-desc" rows="4" formControlName="description" placeholder="Ví dụ: thiết kế này giống tác phẩm gốc của tôi đăng tại..."></textarea>
      @if (form.controls.description.touched && form.controls.description.invalid) {
        <small class="err">Mô tả ít nhất 10 ký tự để nhóm kiểm duyệt hiểu rõ.</small>
      }

      <div class="actions">
        <button type="button" class="ghost" (click)="cancel.emit()">Hủy</button>
        <button type="submit" class="primary">Gửi báo cáo</button>
      </div>
    </form>
  `,
  styles: [`
    :host { position: fixed; inset: 0; z-index: 60; display: grid; place-items: center; padding: 16px; }
    .backdrop { position: absolute; inset: 0; background: rgba(46, 37, 56, .45); }
    .dialog { position: relative; width: min(460px, 100%); display: grid; gap: 8px; padding: 22px; border-radius: 20px; background: #fff; box-shadow: 0 30px 60px #2e253855; }
    h2 { margin: 0; font-size: 20px; color: var(--pf-ink); }
    .hint { margin: 0 0 6px; font-size: 13px; color: var(--pf-muted); }
    label { font-size: 13px; font-weight: 700; color: var(--pf-ink); margin-top: 6px; }
    select, textarea { width: 100%; box-sizing: border-box; padding: 10px 12px; border: 1px solid var(--pf-line); border-radius: var(--pf-radius-sm); font: inherit; font-size: 14px; color: var(--pf-ink); background: #fff; }
    select:focus, textarea:focus { outline: 2px solid var(--pf-lilac); border-color: var(--pf-lavender); }
    textarea { resize: vertical; }
    .err { color: var(--pf-danger); font-size: 12px; }
    .actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 10px; }
    button { padding: 11px 16px; border-radius: var(--pf-radius); font: inherit; font-weight: 750; cursor: pointer; }
    .ghost { border: 1px solid var(--pf-line); background: #fff; color: var(--pf-ink); }
    .primary { border: 0; background: var(--pf-danger); color: #fff; }
  `],
})
export class ReportDialog {
  @Output() submitted = new EventEmitter<ReportPayload>();
  @Output() cancel = new EventEmitter<void>();

  readonly reasons = [
    'Sao chép thiết kế của tôi',
    'Dùng hình ảnh có bản quyền của người khác',
    'Logo hoặc thương hiệu không được phép',
    'Nội dung không phù hợp',
  ];

  readonly form = inject(FormBuilder).nonNullable.group({
    reason: ['', Validators.required],
    description: ['', [Validators.required, Validators.minLength(10)]],
  });

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitted.emit(this.form.getRawValue());
  }
}
