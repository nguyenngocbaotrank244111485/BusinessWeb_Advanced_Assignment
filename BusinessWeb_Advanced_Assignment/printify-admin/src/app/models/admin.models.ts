/** Kiểu dữ liệu Admin – khớp dữ liệu phía Customer (orders, listings, designs...) */

export type AdminRole = 'STAFF' | 'SUPERADMIN';

export interface AdminUser {
  _id: string;
  name: string;
  email: string;
  admin_code: string;
  role: AdminRole;
}

export interface PublicUser {
  _id: string;
  name: string;
  email: string;
  role?: string;
  status?: string;
}

export interface PrintArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ProductVariant {
  _id: string;
  color: string;
  size: string | null;
  stock: number;
  imageUrl?: string;
}

export interface Product {
  _id: string;
  name: string;
  slug?: string;
  category: string;
  price: number;
  description: string;
  img_display: string;
  img_detail: string[];
  variants: ProductVariant[];
  isActive: boolean;
  allowCustomization: boolean;
  allowMarketplace: boolean;
  lowStockThreshold: number;
  printArea?: PrintArea | null;
  createdAt?: string;
  updatedAt?: string;
}

export type OrderStatus =
  | 'PENDING_PAYMENT' | 'PENDING_STAFF_CONFIRMATION' | 'DESIGN_REVIEW' | 'SAMPLE_PRINTING' | 'SAMPLE_REVIEW'
  | 'PRINT_CONFIRMED' | 'PRINT_COMPLETED' | 'SHIPPING' | 'COMPLETED' | 'CANCELLED';

/** PENDING -> WAITING_STAFF -> PAID | REJECTED; quá hạn QR -> EXPIRED */
export type PaymentStatus = 'PENDING' | 'WAITING_STAFF' | 'PAID' | 'REJECTED' | 'EXPIRED';

export interface DesignReview {
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'ACCEPTED_RISK';
  reason?: string | null;
  reviewedAt?: string | null;
  resubmittedAt?: string | null;
  riskAcceptedAt?: string | null;
}

export interface OrderItem {
  orderItemId: string;
  productId: string;
  productName: string;
  variantId: string;
  color?: string;
  size?: string | null;
  qty: number;
  unitPrice: number;
  imageUrl?: string;
  designId: string | null;
  listingSnapshot: { listingId: string; title: string; buyerDesignFee: number } | null;
  requiresSample: boolean;
  sampleStatus?: string;
  samplePhotoUrl?: string | null;
  designReview?: DesignReview | null;
}

export interface CancelRequest {
  reason: string;
  note: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requestedAt: string;
  resolvedAt?: string | null;
  resolveNote?: string | null;
}

export interface TimelineEntry {
  status: string;
  occurredAt: string;
  actorId?: string;
  note?: string;
}

export interface Order {
  _id: string;
  userId: string;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  paymentMethod?: 'BANK' | 'MOMO';
  items: OrderItem[];
  shippingInfo: { name: string; phone: string; province: string; ward: string; detail: string; note?: string };
  totals: { productSubtotal: number; designFees: number; discount: number; shipping: number; total: number };
  paymentOpenedAt?: string;
  paymentExpiresAt?: string;
  paymentClaimedAt?: string | null;
  paidAt?: string | null;
  paymentRejectedReason?: string | null;
  cancelReason?: string | null;
  cancelledAt?: string | null;
  cancelRequest?: CancelRequest | null;
  stockDeductedAt?: string | null;
  stockRestoredAt?: string | null;
  firstSampleStartedAt?: string | null;
  printCompletedAt?: string | null;
  shippedAt?: string | null;
  deliveredAt?: string | null;
  receivedAt?: string | null;
  trackingCode?: string | null;
  timeline: TimelineEntry[];
  createdAt: string;
  updatedAt?: string;
}

export type ListingStatus = 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'UNLISTED';

export interface Listing {
  _id: string;
  sellerId: string;
  designId: string;
  productId: string;
  title: string;
  description: string;
  tags: string[];
  sellerPrice: number;
  platformFee: number;
  buyerDesignFee: number;
  watermarkUrl: string;
  acceptedCopyright: boolean;
  status: ListingStatus;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  reviewNote?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface Design {
  _id: string;
  userId: string;
  productId: string;
  previewUrl: string;
  listingId: string | null;
}

export interface DesignSale {
  _id: string;
  orderId: string;
  orderItemId: string;
  listingId: string;
  sellerId: string;
  buyerId: string;
  productId?: string;
  sellerPrice: number;
  platformFee: number;
  buyerDesignFee: number;
  status: string;
  reversedAmount: number;
  recordedAt: string;
}

export interface CopyrightReport {
  _id: string;
  listingId: string;
  reporterId: string;
  reason: string;
  description: string;
  status: 'OPEN' | 'RESOLVED' | 'DISMISSED';
  createdAt: string;
  resolvedBy?: string | null;
  resolvedAt?: string | null;
  resolveNote?: string | null;
}

export type MovementType = 'ORDER_DEDUCTION' | 'ORDER_RELEASE' | 'SAMPLE_ADDITIONAL' | 'INITIAL_STOCK' | 'ADMIN_ADJUST' | string;

export interface InventoryMovement {
  _id: string;
  type: MovementType;
  productId: string;
  variantId: string;
  quantityDelta: number;
  originalOrderId?: string | null;
  reason?: string | null;
  actorId: string;
  dedupeKey: string;
  recordedAt: string;
}

export interface SurveyQuestion {
  _id: string;
  dimension: 'PU' | 'EOU' | 'SAT' | 'PI';
  text: string;
  orderIndex: number;
  isActive: boolean;
}

export interface SurveyResponse {
  _id: string;
  userId: string;
  answers: { questionId: string; dimension: string; score: number }[];
  submittedAt: string;
  demo?: boolean;
}

export interface AuditLog {
  _id: string;
  actorId: string;
  action: string;
  targetType: string;
  targetId: string;
  detail: string;
  at: string;
}
