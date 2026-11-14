/** Trạng thái tin đăng Marketplace (enums: DRAFT|PENDING_REVIEW|APPROVED|REJECTED|UNLISTED) */
export type ListingStatus = 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED' | 'UNLISTED';

export const LISTING_STATUS_LABELS: Record<ListingStatus, string> = {
  DRAFT: 'Nháp',
  PENDING_REVIEW: 'Chờ duyệt',
  APPROVED: 'Đã duyệt',
  REJECTED: 'Bị từ chối',
  UNLISTED: 'Đã gỡ',
};

/** Tin đăng bán quyền sử dụng 1 thiết kế, gắn cố định với 1 sản phẩm (R14) */
export interface Listing {
  _id: string;
  sellerId: string;
  designId: string;
  productId: string;
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
