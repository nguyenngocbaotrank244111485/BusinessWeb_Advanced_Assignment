import { Injectable, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';

/**
 * Báo lỗi chung khi server từ chối / không kết nối được (hiện toast ở góc màn hình, xem app.html).
 * Các service ghi dữ liệu (giỏ, đơn, thiết kế, hồ sơ...) gọi report() khi API lỗi.
 */
@Injectable({ providedIn: 'root' })
export class ApiStatusService {
  readonly message = signal<{ text: string; ok: boolean } | null>(null);
  private timer?: ReturnType<typeof setTimeout>;

  show(text: string, ok = false): void {
    clearTimeout(this.timer);
    this.message.set({ text, ok });
    this.timer = setTimeout(() => this.message.set(null), 4500);
  }

  /** Câu báo lỗi dễ hiểu từ lỗi HTTP */
  text(e: unknown, fallback = 'Không lưu được thay đổi, vui lòng thử lại.'): string {
    const err = e as HttpErrorResponse;
    if (!err || err.status === 0 || err.status === 504 || err.status === 502) return 'Không kết nối được máy chủ. Kiểm tra server (npm run dev) đã chạy chưa.';
    if (err.status === 401) return 'Phiên đăng nhập đã hết, vui lòng đăng nhập lại.';
    return err.error?.message || fallback;
  }

  report(e: unknown, fallback?: string): void {
    this.show(this.text(e, fallback));
  }
}

/** Server chưa chạy (để đọc tạm dữ liệu mẫu trong /dataset khi chỉ xem giao diện) */
export const isServerDown = (e: HttpErrorResponse): boolean => e.status === 0 || e.status === 504 || e.status === 502 || e.status === 500;
