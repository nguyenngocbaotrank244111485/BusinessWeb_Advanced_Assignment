/** Trạng thái tin đăng Marketplace (enums: DRAFT|PENDING_REVIEW|APPROVED|REJECTED|UNLISTED) */
export type ListingStatus = 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'UNLISTED';

export const LISTING_STATUS_LABELS: Record<ListingStatus, string> = {
  DRAFT: 'Nháp',
  PENDING_REVIEW: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Bị từ chối',
  UNLISTED: 'Đã gỡ',
};

/**
 * Tin đăng bán quyền sử dụng 1 thiết kế.
 * Nhóm điều chỉnh R14: người mua được chọn in thiết kế lên mọi sản phẩm có vùng in (áo, túi, cốc, sổ...);
 * productId chỉ là sản phẩm hiển thị đầu tiên do người bán chọn khi thiết kế.
 */
export interface Listing {
  _id: string;
  sellerId: string;
  designId: string;
  productId: string; // sản phẩm hiển thị mặc định
  title: string; // ≤ 100 ký tự
  description: string;
  tags: string[];
  sellerPrice: number; // người bán nhận
  platformFee: number; // phí sàn = sellerPrice × platformFeeRate (10%)
  buyerDesignFee: number; // người mua trả = sellerPrice + platformFee, tính 1 lần / dòng đơn
  watermarkUrl: string; // chỉ ảnh xem trước có watermark được công khai
  licenseScope: 'PRINT_ON_FIXED_PRODUCT' | string;
  imageAssetScope: 'WATERMARK_PREVIEW_ONLY' | string;
  acceptedCopyright: boolean;
  status: ListingStatus;
  reviewedAt: string | null;
  reviewNote: string | null;
  createdAt: string;
  updatedAt?: string;
  /** Server gắn thêm khi trả danh sách / chi tiết */
  sellerName?: string;
  soldCount?: number;
}

/** Thiết kế đã lưu từ Editor */
export interface Design {
  _id: string;
  userId: string;
  productId: string;
  previewUrl: string;
  /** khác null = thiết kế dựng từ listing đã mua -> không được đăng bán lại */
  listingId: string | null;
  createdAt: string;
  updatedAt?: string;
}

/** Báo cáo vi phạm bản quyền (copyrightReports) */
export interface CopyrightReport {
  _id: string;
  listingId: string;
  reporterId: string;
  reason: string;
  description: string;
  status: 'OPEN';
  createdAt: string;
}

/** Dữ liệu form đăng / sửa tin */
export interface ListingInput {
  designId: string;
  title: string;
  description: string;
  tags: string[];
  sellerPrice: number;
  acceptedCopyright: boolean;
}

/** Một lượt bán thiết kế (designSales): ghi khi đơn của người mua đã thanh toán */
export interface DesignSale {
  _id: string;
  orderId: string;
  orderItemId: string;
  listingId: string;
  sellerId: string;
  buyerId: string;
  productId?: string; // sản phẩm người mua đã in
  sellerPrice: number;
  platformFee: number;
  buyerDesignFee: number;
  status: 'RECORDED' | 'REVERSED' | string;
  reversedAmount: number;
  reversedAt: string | null;
  recordedAt: string;
}

/** Một dòng trong "My marketplace" (C20): thiết kế nháp hoặc tin đã đăng */
export type MyMarketStatus = 'EDITING' | ListingStatus;

export interface MyMarketItem {
  key: string;
  status: MyMarketStatus;
  design?: Design;
  listing?: Listing;
  title: string;
  imageUrl: string;
  soldCount: number; // số lượt bán (đã trừ lượt bị hoàn)
  earned: number; // tiền người bán đã nhận
  updatedAt: string;
}
