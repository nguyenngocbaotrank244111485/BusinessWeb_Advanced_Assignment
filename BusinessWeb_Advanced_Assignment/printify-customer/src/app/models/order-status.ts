import { Order } from './order.model';

/**
 * Tab trạng thái trên C14 (gộp các OrderStatus của hệ thống thành nhóm khách dễ hiểu)
 *  confirm   Chờ xác nhận : chờ thanh toán, chờ PrintiFy xác nhận, PrintiFy kiểm tra mẫu, in mẫu, chờ khách duyệt mẫu
 *  printing  Đang in ấn   : PRINT_CONFIRMED (in chính thức)
 *  printed   Đã in xong   : PRINT_COMPLETED (đóng gói, chờ giao)
 *  shipping  Đang giao    : SHIPPING
 *  delivered Đã giao      : COMPLETED, khách chưa bấm "Đã nhận hàng" và chưa quá 3 ngày
 *  done      Hoàn thành   : COMPLETED, khách đã xác nhận nhận hàng hoặc sau 3 ngày
 *  cancelled Đã hủy       : CANCELLED hoặc quá hạn thanh toán
 */
export type OrderTab = 'all' | 'confirm' | 'printing' | 'printed' | 'shipping' | 'delivered' | 'done' | 'cancelled';

export const ORDER_TABS: { key: OrderTab; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'confirm', label: 'Chờ xác nhận' },
  { key: 'printing', label: 'Đang in ấn' },
  { key: 'printed', label: 'Đã in xong' },
  { key: 'shipping', label: 'Đang giao' },
  { key: 'delivered', label: 'Đã giao' },
  { key: 'done', label: 'Hoàn thành' },
  { key: 'cancelled', label: 'Đã hủy' },
];

const DAY = 24 * 60 * 60 * 1000;
/** Sau khi giao bao lâu thì tự chuyển "Hoàn thành" */
export const AUTO_RECEIVE_MS = 3 * DAY;

/** Đơn chờ thanh toán đã quá 10 phút (server sẽ hủy; client hiển thị trước) */
export function isPaymentExpired(o: Order, now = Date.now()): boolean {
  if (o.orderStatus !== 'PENDING_PAYMENT') return false;
  return paymentDeadline(o) < now;
}

/** Hạn thanh toán: paymentExpiresAt, đơn cũ chưa có thì = paymentOpenedAt/createdAt + 10 phút */
export function paymentDeadline(o: Order): number {
  if (o.paymentExpiresAt) return Date.parse(o.paymentExpiresAt);
  return Date.parse(o.paymentOpenedAt || o.createdAt) + 10 * 60 * 1000;
}

export function tabOf(o: Order, now = Date.now()): OrderTab {
  if (o.orderStatus === 'CANCELLED' || isPaymentExpired(o, now)) return 'cancelled';
  switch (o.orderStatus) {
    case 'PENDING_PAYMENT':
    case 'PENDING_STAFF_CONFIRMATION':
    case 'DESIGN_REVIEW':
    case 'SAMPLE_PRINTING':
    case 'SAMPLE_REVIEW':
      return 'confirm';
    case 'PRINT_CONFIRMED':
      return 'printing';
    case 'PRINT_COMPLETED':
      return 'printed';
    case 'SHIPPING':
      return 'shipping';
    case 'COMPLETED': {
      const delivered = o.deliveredAt ? Date.parse(o.deliveredAt) : 0;
      return o.receivedAt || now - delivered > AUTO_RECEIVE_MS ? 'done' : 'delivered';
    }
    default:
      return 'confirm';
  }
}

/** Nhãn chi tiết hiện trên thẻ đơn */
export function statusLabel(o: Order, now = Date.now()): { text: string; tone: 'wait' | 'info' | 'ok' | 'bad' | 'action' } {
  if (isPaymentExpired(o, now)) return { text: 'Đã hủy · quá hạn thanh toán', tone: 'bad' };
  switch (o.orderStatus) {
    case 'PENDING_PAYMENT':
      return { text: 'Chờ thanh toán', tone: 'action' };
    case 'PENDING_STAFF_CONFIRMATION':
      return { text: 'Chờ PrintiFy xác nhận thanh toán', tone: 'wait' };
    case 'DESIGN_REVIEW':
      return designRejected(o)
        ? { text: 'Mẫu in cần chỉnh sửa', tone: 'bad' }
        : { text: 'Chờ PrintiFy kiểm tra mẫu in', tone: 'wait' };
    case 'SAMPLE_PRINTING':
      return { text: 'Đang in mẫu thử', tone: 'info' };
    case 'SAMPLE_REVIEW':
      return { text: 'Chờ bạn duyệt mẫu in', tone: 'action' };
    case 'PRINT_CONFIRMED':
      return { text: 'Đang in ấn', tone: 'info' };
    case 'PRINT_COMPLETED':
      return { text: 'Đã in xong · chuẩn bị giao', tone: 'info' };
    case 'SHIPPING':
      return { text: 'Đang giao hàng', tone: 'info' };
    case 'COMPLETED':
      return tabOf(o, now) === 'done' ? { text: 'Hoàn thành', tone: 'ok' } : { text: 'Đã giao hàng', tone: 'ok' };
    case 'CANCELLED':
      return { text: 'Đã hủy', tone: 'bad' };
    default:
      return { text: o.orderStatus, tone: 'info' };
  }
}

/** Được gửi yêu cầu hủy: trước khi bắt đầu in (R13: khóa từ lúc in mẫu đầu tiên) */
export function canCancel(o: Order, now = Date.now()): boolean {
  if (tabOf(o, now) !== 'confirm' || o.cancelRequest?.status === 'PENDING') return false;
  if (['PENDING_PAYMENT', 'PENDING_STAFF_CONFIRMATION', 'DESIGN_REVIEW'].includes(o.orderStatus)) return true;
  return !o.firstSampleStartedAt;
}

/** Hiện nút hủy nhưng khóa (xám): đã bắt đầu in nhưng chưa in xong */
export function cancelLocked(o: Order, now = Date.now()): boolean {
  const tab = tabOf(o, now);
  if (tab === 'printing') return true;
  return tab === 'confirm' && !canCancel(o, now) && o.cancelRequest?.status !== 'PENDING';
}

/** Có dòng thiết kế bị PrintiFy trả về cần sửa */
export function designRejected(o: Order): boolean {
  return o.items.some((i) => i.designReview?.status === 'REJECTED');
}


/** Lý do hủy đơn cho khách chọn */
export const CANCEL_REASONS = [
  'Đặt sai mẫu / sai thiết kế',
  'Đặt sai số lượng',
  'Chọn sai màu hoặc kích thước',
  'Sai địa chỉ giao hàng',
  'Muốn đổi phương thức thanh toán',
  'Thời gian giao hàng quá lâu',
  'Đổi ý, không muốn mua nữa',
  'Lý do khác',
] as const;
export const ADDRESS_REASON = 'Sai địa chỉ giao hàng';

/**
 * Trạng thái thanh toán (dùng chung Customer + Admin):
 * PENDING -> (khách bấm "Tôi đã thanh toán") WAITING_STAFF -> PAID | REJECTED;
 * quá hạn QR mà chưa báo đã trả -> EXPIRED.
 */
export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Chưa thanh toán',
  WAITING_STAFF: 'Chờ PrintiFy xác nhận',
  PAID: 'Đã thanh toán',
  REJECTED: 'Không xác nhận được thanh toán',
  EXPIRED: 'Hết hạn thanh toán',
};
