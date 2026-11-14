/** Đơn hàng (orders.json) – phần phía khách cần dùng */
export type OrderStatus =
  | 'PENDING_PAYMENT' | 'PENDING_STAFF_CONFIRMATION' | 'PAID' | 'SAMPLE_PRINTING' | 'SAMPLE_REVIEW'
  | 'PRINTING' | 'SHIPPING' | 'COMPLETED' | 'CANCELLED' | string;

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
  discount: number; // 5% trên productSubtotal khi >= ngưỡng (không áp vào phí thiết kế, ship)
  shipping: number;
  total: number;
}

export interface Order {
  _id: string;
  userId: string;
  orderStatus: OrderStatus;
  paymentStatus: 'PENDING' | 'CLAIMED' | 'PAID' | 'EXPIRED' | string;
  items: OrderItem[];
  shippingInfo: ShippingInfo;
  totals: OrderTotals;
  idempotencyKey: string;
  paymentOpenedAt: string;
  paymentExpiresAt: string;
  paymentClaimedAt: string | null;
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
