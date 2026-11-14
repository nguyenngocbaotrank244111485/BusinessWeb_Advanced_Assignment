import { ListingStatus, Order, OrderStatus, PaymentStatus } from './admin.models';

export type Tone = 'ok' | 'warn' | 'bad' | 'info' | 'action' | '';

export const ORDER_STATUS: Record<OrderStatus, { label: string; tone: Tone }> = {
  PENDING_PAYMENT: { label: 'Chờ khách thanh toán', tone: '' },
  PENDING_STAFF_CONFIRMATION: { label: 'Chờ xác nhận thanh toán', tone: 'action' },
  DESIGN_REVIEW: { label: 'Chờ kiểm tra mẫu in', tone: 'action' },
  SAMPLE_PRINTING: { label: 'Đang in mẫu thử', tone: 'info' },
  SAMPLE_REVIEW: { label: 'Chờ khách duyệt mẫu', tone: 'warn' },
  PRINT_CONFIRMED: { label: 'Đang in', tone: 'info' },
  PRINT_COMPLETED: { label: 'Đã in xong', tone: 'info' },
  SHIPPING: { label: 'Đang giao', tone: 'info' },
  COMPLETED: { label: 'Đã giao', tone: 'ok' },
  CANCELLED: { label: 'Đã hủy', tone: 'bad' },
};

export const PAYMENT_STATUS: Record<PaymentStatus, { label: string; tone: Tone }> = {
  PENDING: { label: 'Chưa thanh toán', tone: '' },
  WAITING_STAFF: { label: 'Khách báo đã trả', tone: 'action' },
  PAID: { label: 'Đã thanh toán', tone: 'ok' },
  REJECTED: { label: 'Từ chối thanh toán', tone: 'bad' },
  EXPIRED: { label: 'Hết hạn QR', tone: 'bad' },
};

export const LISTING_STATUS: Record<ListingStatus, { label: string; tone: Tone }> = {
  DRAFT: { label: 'Nháp', tone: '' },
  PENDING_REVIEW: { label: 'Chờ duyệt', tone: 'action' },
  APPROVED: { label: 'Đang bán', tone: 'ok' },
  REJECTED: { label: 'Bị từ chối', tone: 'bad' },
  UNLISTED: { label: 'Đã gỡ', tone: '' },
};

export const CATEGORY_LABELS: Record<string, string> = {
  'ao-thun': 'Áo thun & Trang phục',
  'tui-vai': 'Túi vải & Túi cá nhân',
  'binh-nuoc': 'Ly cốc & Bình nước',
  'van-phong-pham': 'Sổ tay & Ấn phẩm',
  'trang-tri': 'Trang trí & Quà tặng',
  'phu-kien': 'Phụ kiện cá nhân',
};

export const COLOR_LABELS: Record<string, string> = {
  white: 'Trắng', black: 'Đen', gray: 'Xám', navy: 'Xanh navy', beige: 'Be', cream: 'Kem', silver: 'Bạc', clear: 'Trong suốt',
  'white-black': 'Trắng viền đen', 'white-blue': 'Trắng xanh', red: 'Đỏ', blue: 'Xanh dương', pink: 'Hồng',
};

export const MOVEMENT_LABELS: Record<string, string> = {
  ORDER_DEDUCTION: 'Trừ kho khi xác nhận thanh toán',
  ORDER_RELEASE: 'Hoàn kho khi hủy đơn đã thanh toán',
  SAMPLE_ADDITIONAL: 'In lại mẫu (trừ thêm)',
  SAMPLE_USE: 'Dùng cho mẫu thử',
  REPRINT: 'In lại',
  INITIAL_STOCK: 'Tồn kho ban đầu',
  ADMIN_ADJUST: 'Điều chỉnh thủ công',
};

export const DIMENSIONS: { key: 'PU' | 'EOU' | 'SAT' | 'PI'; label: string; hint: string }[] = [
  { key: 'PU', label: 'Hữu ích (PU)', hint: 'Perceived Usefulness' },
  { key: 'EOU', label: 'Dễ sử dụng (EOU)', hint: 'Perceived Ease of Use' },
  { key: 'SAT', label: 'Hài lòng (SAT)', hint: 'Satisfaction' },
  { key: 'PI', label: 'Ý định mua (PI)', hint: 'Purchase Intention' },
];

/**
 * Tab D5 theo cách nhóm đã chốt:
 *  Chờ xác nhận (gồm 5 nhóm con) – Đang in – Đã in xong – Đang giao – Đã giao – Hoàn thành – Đã hủy
 */
export type OrderTab = 'all' | 'confirm' | 'printing' | 'printed' | 'shipping' | 'delivered' | 'done' | 'cancelled';
export type ConfirmSub = 'all' | 'await_payment' | 'payment_review' | 'design_review' | 'sample' | 'cancel_request';

export const ORDER_TABS: { key: OrderTab; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'confirm', label: 'Chờ xác nhận' },
  { key: 'printing', label: 'Đang in' },
  { key: 'printed', label: 'Đã in xong' },
  { key: 'shipping', label: 'Đang giao' },
  { key: 'delivered', label: 'Đã giao' },
  { key: 'done', label: 'Hoàn thành' },
  { key: 'cancelled', label: 'Đã hủy' },
];

export const CONFIRM_SUBS: { key: ConfirmSub; label: string; hint: string }[] = [
  { key: 'all', label: 'Tất cả', hint: '' },
  { key: 'await_payment', label: 'Chờ khách thanh toán', hint: 'Khách đã đặt nhưng chưa quét QR (10 phút)' },
  { key: 'payment_review', label: 'Xác nhận thanh toán', hint: 'Khách báo đã trả – đối soát rồi xác nhận, hệ thống trừ kho' },
  { key: 'design_review', label: 'Kiểm tra mẫu in', hint: 'Xem file thiết kế có lỗi (vùng in, độ nét, nội dung) trước khi in mẫu' },
  { key: 'sample', label: 'In mẫu & chờ khách duyệt', hint: 'In mẫu thử, chụp ảnh gửi khách duyệt' },
  { key: 'cancel_request', label: 'Yêu cầu hủy đơn', hint: 'Khách xin hủy trước khi bắt đầu in mẫu' },
];

const DAY = 24 * 60 * 60 * 1000;
/** Đã giao bao lâu thì coi như Hoàn thành (giống C14 phía khách) */
export const AUTO_RECEIVE_MS = 3 * DAY;
export const PAYMENT_MINUTES = 10;

export function paymentDeadline(o: Order): number {
  if (o.paymentExpiresAt) return Date.parse(o.paymentExpiresAt);
  return Date.parse(o.paymentOpenedAt || o.createdAt) + PAYMENT_MINUTES * 60 * 1000;
}

export function isPaymentExpired(o: Order, now = Date.now()): boolean {
  return o.orderStatus === 'PENDING_PAYMENT' && paymentDeadline(o) < now;
}

export function tabOf(o: Order, now = Date.now()): Exclude<OrderTab, 'all'> {
  if (o.orderStatus === 'CANCELLED' || isPaymentExpired(o, now)) return 'cancelled';
  switch (o.orderStatus) {
    case 'PRINT_CONFIRMED': return 'printing';
    case 'PRINT_COMPLETED': return 'printed';
    case 'SHIPPING': return 'shipping';
    case 'COMPLETED': {
      const delivered = o.deliveredAt ? Date.parse(o.deliveredAt) : 0;
      return o.receivedAt || now - delivered > AUTO_RECEIVE_MS ? 'done' : 'delivered';
    }
    default: return 'confirm';
  }
}

/** Nhóm con trong tab "Chờ xác nhận" */
export function confirmSubOf(o: Order, now = Date.now()): Exclude<ConfirmSub, 'all'> | null {
  if (tabOf(o, now) !== 'confirm') return null;
  if (o.cancelRequest?.status === 'PENDING') return 'cancel_request';
  switch (o.orderStatus) {
    case 'PENDING_PAYMENT': return 'await_payment';
    case 'PENDING_STAFF_CONFIRMATION': return 'payment_review';
    case 'DESIGN_REVIEW': return 'design_review';
    default: return 'sample';
  }
}

export function hasPendingCancel(o: Order): boolean {
  return o.cancelRequest?.status === 'PENDING';
}

/** Nhãn hiển thị cho 1 đơn (kể cả trường hợp quá hạn QR chưa được server hủy) */
export function orderBadge(o: Order, now = Date.now()): { label: string; tone: Tone } {
  if (isPaymentExpired(o, now)) return { label: 'Hủy · quá hạn thanh toán', tone: 'bad' };
  if (o.orderStatus === 'COMPLETED') return tabOf(o, now) === 'done' ? { label: 'Hoàn thành', tone: 'ok' } : { label: 'Đã giao', tone: 'ok' };
  return ORDER_STATUS[o.orderStatus] ?? { label: o.orderStatus, tone: '' };
}
