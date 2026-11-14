/** Đơn hàng (orders.json) – phần phía khách cần dùng */

/** Phương thức thanh toán: cả 2 đều quét QR, hiệu lực 10 phút */
export type PaymentMethod = 'BANK' | 'MOMO';
export const PAYMENT_METHODS: Record<PaymentMethod, { label: string; short: string; icon: string; app: string }> = {
  BANK: { label: 'Chuyển khoản ngân hàng', short: 'Ngân hàng', icon: '🏦', app: 'ứng dụng ngân hàng' },
  MOMO: { label: 'Ví MoMo', short: 'MoMo', icon: '🟣', app: 'ứng dụng MoMo' },
};
export type OrderStatus =
  | 'PENDING_PAYMENT' | 'PENDING_STAFF_CONFIRMATION' | 'DESIGN_REVIEW' | 'SAMPLE_PRINTING' | 'SAMPLE_REVIEW'
  | 'PRINT_CONFIRMED' | 'PRINT_COMPLETED' | 'SHIPPING' | 'COMPLETED' | 'CANCELLED' | string;

export interface OrderItem {
  orderItemId: string;
  productId: string;
  productName: string;
  variantId: string;
  color: string;
  size: string | null;
  qty: number;
  unitPrice: number; // snapshot giá phôi lúc đặt
  imageUrl: string;
  designId: string | null;
  listingSnapshot: { listingId: string; title: string; sellerId?: string; buyerDesignFee: number } | null;
  requiresSample: boolean;
  sampleStatus?: 'NOT_REQUIRED' | 'WAITING_SAMPLE' | 'SAMPLE_READY' | 'APPROVED' | string;
  /** Ảnh mẫu in (Staff chụp) để khách duyệt */
  samplePhotoUrl?: string | null;
  sampleReprintCount?: number;
  editRequest?: { openedAt?: string; expiresAt?: string } | null;
  /** PrintiFy kiểm tra file thiết kế trước khi in mẫu (vùng in, độ phân giải, nội dung) */
  designReview?: DesignReview | null;
}

export interface DesignReview {
  /** ACCEPTED_RISK = khách chọn vẫn in mẫu hiện tại dù PrintiFy đã cảnh báo */
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'ACCEPTED_RISK';
  /** Lý do không đạt (bắt buộc khi REJECTED, giữ lại khi ACCEPTED_RISK) */
  reason?: string | null;
  /** Lúc khách xác nhận chấp nhận rủi ro */
  riskAcceptedAt?: string | null;
  reviewedAt?: string | null;
  /** Khách gửi lại mẫu đã sửa */
  resubmittedAt?: string | null;
}

/** Yêu cầu hủy đơn của khách – chờ PrintiFy duyệt */
export interface CancelRequest {
  reason: string;
  note: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedAt: string;
  resolvedAt?: string | null;
  resolveNote?: string | null;
}

/** Đánh giá sau khi nhận hàng */
export interface OrderReview {
  rating: number; // 1..5
  comment: string;
  createdAt: string;
}

/** Thông tin nhận hàng – chốt bộ tên name/detail theo API */
export interface ShippingInfo {
  name: string;
  phone: string;
  province: string;
  ward: string;
  detail: string;
  note: string;
}

export interface OrderTotals {
  productSubtotal: number;
  designFees: number;
  discount: number; // giảm theo hạng thành viên trên productSubtotal (không áp vào phí thiết kế, ship)
  shipping: number;
  total: number;
}

export interface Order {
  _id: string;
  userId: string;
  orderStatus: OrderStatus;
  /** PENDING -> WAITING_STAFF -> PAID | REJECTED; quá hạn -> EXPIRED (xem PAYMENT_STATUS_LABELS) */
  paymentStatus: 'PENDING' | 'WAITING_STAFF' | 'PAID' | 'EXPIRED' | 'REJECTED' | string;
  /** Mặc định BANK cho đơn cũ không có trường này */
  paymentMethod?: PaymentMethod;
  items: OrderItem[];
  shippingInfo: ShippingInfo;
  totals: OrderTotals;
  idempotencyKey: string;
  paymentOpenedAt: string;
  paymentExpiresAt: string;
  paymentClaimedAt: string | null;
  /** Mốc bắt đầu in mẫu đầu tiên – từ đây không được hủy (R13) */
  firstSampleStartedAt?: string | null;
  trackingCode?: string | null;
  shippedAt?: string | null;
  deliveredAt?: string | null;
  /** Khách bấm "Đã nhận được hàng" */
  receivedAt?: string | null;
  cancelRequest?: CancelRequest | null;
  cancelledAt?: string | null;
  cancelReason?: string | null;
  review?: OrderReview | null;
  createdAt: string;
  updatedAt: string;
}

/** Tính tiền đơn (BR: giảm 5% trên tiền hàng từ ngưỡng; phí thiết kế 1 lần/dòng; ship cố định) */
export function calcTotals(
  lines: { unitPrice: number; quantity: number; designFee: number }[],
  cfg: { shippingFeeVnd: number; discountRate: number; discountThresholdVnd: number },
): OrderTotals {
  const productSubtotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const designFees = lines.reduce((s, l) => s + (l.designFee || 0), 0);
  const discount = productSubtotal >= cfg.discountThresholdVnd ? Math.round(productSubtotal * cfg.discountRate) : 0;
  const shipping = lines.length ? cfg.shippingFeeVnd : 0;
  return { productSubtotal, designFees, discount, shipping, total: productSubtotal - discount + designFees + shipping };
}
