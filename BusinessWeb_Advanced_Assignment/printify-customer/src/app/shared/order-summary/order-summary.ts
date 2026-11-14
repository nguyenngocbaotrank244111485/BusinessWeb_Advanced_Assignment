import { Component, Input } from '@angular/core';
import { OrderTotals } from '../../models/order.model';

/** Khối tổng tiền dùng chung cho Giỏ hàng (C12) và Checkout (C13). Nút hành động truyền qua <ng-content>. */
@Component({
  selector: 'app-order-summary',
  standalone: false,
  template: `
    <section class="summary" aria-label="Tóm tắt đơn hàng">
      <h2>{{ title }}</h2>
      <div class="row"><span>Tạm tính ({{ itemCount }} sản phẩm)</span><span>{{ totals.productSubtotal | vnd }}</span></div>
      @if (totals.designFees) {
        <div class="row"><span>Phí thiết kế Marketplace</span><span>{{ totals.designFees | vnd }}</span></div>
      }
      <div class="row" [class.good]="totals.discount">
        <span>{{ discountLabel }}</span>
        <span>{{ totals.discount ? '−' + (totals.discount | vnd) : '0đ' }}</span>
      </div>
      @if (discountHint && totals.productSubtotal > 0) {
        <p class="hint">{{ discountHint }}</p>
      }
      <div class="row"><span>Phí giao hàng</span><span>{{ totals.shipping | vnd }}</span></div>
      <div class="row total"><span>Tổng cộng</span><span>{{ totals.total | vnd }}</span></div>
      <p class="note">Đã gồm VAT. Ưu đãi hạng thành viên chỉ tính trên tiền hàng, không áp vào phí thiết kế và phí giao hàng.</p>
      <ng-content></ng-content>
    </section>
  `,
  styles: [`
    .summary { display: grid; gap: 10px; padding: 20px; background: #fff; border: 1px solid var(--pf-line); border-radius: var(--pf-radius-lg); }
    h2 { margin: 0 0 4px; font-size: 17px; color: var(--pf-ink); }
    .row { display: flex; justify-content: space-between; gap: 12px; font-size: 14px; color: var(--pf-muted); font-variant-numeric: tabular-nums; }
    .row.good span:last-child { color: #24734a; font-weight: 700; }
    .hint { margin: -4px 0 0; padding: 8px 10px; border-radius: var(--pf-radius-sm); background: var(--pf-pink-50); color: var(--pf-accent); font-size: 12px; }
    .row.total { padding-top: 10px; border-top: 1px dashed var(--pf-lilac); color: var(--pf-ink); font-weight: 800; font-size: 19px; }
    .row.total span:last-child { color: var(--pf-primary); }
    .note { margin: 0; font-size: 12px; color: var(--pf-muted); line-height: 1.5; }
  `],
})
export class OrderSummary {
  @Input({ required: true }) totals!: OrderTotals;
  @Input() itemCount = 0;
  @Input() title = 'Tóm tắt đơn hàng';
  /** Ví dụ "Ưu đãi hạng Vàng (−5%)" – tính theo hạng thành viên C18 */
  @Input() discountLabel = 'Ưu đãi thành viên';
  @Input() discountHint = '';
}
