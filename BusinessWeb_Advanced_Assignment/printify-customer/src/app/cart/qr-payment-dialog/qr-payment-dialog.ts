import { Component, DestroyRef, EventEmitter, Input, OnInit, Output, computed, inject, signal } from '@angular/core';
import { Order, PAYMENT_METHODS } from '../../models/order.model';

/**
 * Popup thanh toán QR tĩnh, đếm ngược theo paymentExpiresAt (10 phút từ lúc tạo đơn).
 * "Tôi đã thanh toán" chỉ báo cho Staff kiểm tra, KHÔNG tự đánh dấu PAID.
 */
@Component({
  selector: 'app-qr-payment-dialog',
  standalone: false,
  templateUrl: './qr-payment-dialog.html',
  styleUrl: './qr-payment-dialog.css',
})
export class QrPaymentDialog implements OnInit {
  @Input({ required: true }) order!: Order;
  @Input() qrImageUrl = '/dataset/images/qr/printify-qr.png';
  @Output() claimed = new EventEmitter<void>();
  @Output() closed = new EventEmitter<void>();
  @Output() viewOrder = new EventEmitter<void>();

  private readonly now = signal(Date.now());
  readonly copied = signal('');
  readonly remainingMs = computed(() => Math.max(0, new Date(this.order.paymentExpiresAt).getTime() - this.now()));
  readonly expired = computed(() => this.remainingMs() === 0);
  readonly mmss = computed(() => {
    const s = Math.ceil(this.remainingMs() / 1000);
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  });
  readonly progress = computed(() => {
    const total = new Date(this.order.paymentExpiresAt).getTime() - new Date(this.order.paymentOpenedAt).getTime();
    return total > 0 ? (this.remainingMs() / total) * 100 : 0;
  });

  private readonly destroyRef = inject(DestroyRef);

  ngOnInit(): void {
    const t = setInterval(() => this.now.set(Date.now()), 1000);
    this.destroyRef.onDestroy(() => clearInterval(t));
  }

  get method() {
    return PAYMENT_METHODS[this.order.paymentMethod ?? 'BANK'];
  }

  get transferNote(): string {
    return this.order._id.toUpperCase();
  }

  copy(text: string, what: string): void {
    navigator.clipboard?.writeText(text).then(
      () => this.copied.set(what),
      () => this.copied.set(''),
    );
    setTimeout(() => this.copied.set(''), 2000);
  }
}
