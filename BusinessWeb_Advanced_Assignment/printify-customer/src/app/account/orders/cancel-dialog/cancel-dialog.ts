import { Component, EventEmitter, Input, OnInit, Output, computed, inject, signal } from '@angular/core';
import { Order } from '../../../models/order.model';
import { ADDRESS_REASON, CANCEL_REASONS } from '../../../models/order-status';
import { Address, ProfileService } from '../../../services/profile-service';
import { OrderService } from '../../../services/order-service';

/**
 * Popup hủy đơn: chọn lý do (+ ghi chú). Chọn "Sai địa chỉ giao hàng" thì hiện sổ địa chỉ ngay bên dưới
 * để đổi địa chỉ cho đơn thay vì hủy. Gửi hủy = chờ PrintiFy duyệt, chưa hủy ngay.
 */
@Component({
  selector: 'app-cancel-dialog',
  standalone: false,
  templateUrl: './cancel-dialog.html',
  styleUrl: './cancel-dialog.css',
})
export class CancelDialog implements OnInit {
  @Input({ required: true }) order!: Order;
  /** 'requested' = đã gửi yêu cầu hủy, 'address' = đã đổi địa chỉ */
  @Output() done = new EventEmitter<'requested' | 'address'>();
  @Output() closed = new EventEmitter<void>();

  private readonly profiles = inject(ProfileService);
  private readonly orders = inject(OrderService);

  readonly reasons = CANCEL_REASONS;
  readonly addressReason = ADDRESS_REASON;
  readonly reason = signal('');
  readonly note = signal('');
  readonly pickedAddress = signal<string>('');
  readonly step = signal<'form' | 'confirm'>('form');
  readonly addresses = computed(() =>
    [...(this.profiles.profile()?.addresses ?? [])].sort((a, b) => Number(b.isDefault) - Number(a.isDefault)),
  );
  readonly pickedIsCurrent = computed(() => {
    const a = this.addresses().find((x) => x._id === this.pickedAddress());
    return !!a && this.isCurrent(a);
  });
  readonly isAddress = computed(() => this.reason() === ADDRESS_REASON);
  readonly needNote = computed(() => this.reason() === 'Lý do khác');
  readonly canSubmit = computed(() => !!this.reason() && (!this.needNote() || this.note().trim().length >= 5));

  ngOnInit(): void {
    void this.profiles.load();
  }

  /** Địa chỉ đang dùng cho đơn (so khớp nội dung) */
  isCurrent(a: Address): boolean {
    const s = this.order.shippingInfo;
    return a.phone === s.phone && a.detail === s.detail && a.ward === s.ward && a.province === s.province;
  }

  useAddress(): void {
    const a = this.addresses().find((x) => x._id === this.pickedAddress());
    if (!a) return;
    this.orders.changeAddress(this.order._id, {
      name: a.name,
      phone: a.phone,
      province: a.province,
      ward: a.ward,
      detail: a.detail,
      note: this.order.shippingInfo.note ?? '',
    });
    this.done.emit('address');
  }

  next(): void {
    if (this.canSubmit()) this.step.set('confirm');
  }

  submit(): void {
    if (!this.canSubmit()) return;
    this.orders.requestCancel(this.order._id, this.reason(), this.note().trim());
    this.done.emit('requested');
  }
}
