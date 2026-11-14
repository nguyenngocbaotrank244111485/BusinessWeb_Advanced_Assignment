import { Injectable, signal } from '@angular/core';
import { ActionResult } from '../services/admin-data.service';

/** Thông báo nhỏ góc phải sau mỗi thao tác */
@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toast = signal<{ ok: boolean; text: string } | null>(null);
  private timer?: ReturnType<typeof setTimeout>;

  show(text: string, ok = true): void {
    clearTimeout(this.timer);
    this.toast.set({ ok, text });
    this.timer = setTimeout(() => this.toast.set(null), 3800);
  }

  /** Hiện kết quả của 1 thao tác, trả về true nếu thành công */
  result(r: ActionResult): boolean {
    this.show(r.message, r.ok);
    return r.ok;
  }
}
