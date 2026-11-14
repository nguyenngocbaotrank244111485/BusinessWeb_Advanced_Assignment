import { Design } from './market.model';
import { PrintArea } from './product.model';

/** Mặt in của sản phẩm */
export type SideKey = 'front' | 'back';
export const SIDE_LABELS: Record<SideKey, string> = { front: 'Mặt trước', back: 'Mặt sau' };

export interface SideDef {
  key: SideKey;
  label: string;
  /** Vùng in, tỉ lệ 0–1 trên ảnh sản phẩm */
  area: PrintArea;
}

/** Thiết kế của 1 mặt phụ (mặt trước vẫn nằm ở canvasJSON / previewUrl / printFileUrl cho tương thích) */
export interface DesignSide {
  canvasJSON: CanvasData;
  previewUrl: string;
  printFileUrl: string;
}

/** Dữ liệu canvas Fabric.js (chỉ các object người dùng thêm, không có ảnh nền sản phẩm) */
export interface CanvasData {
  version: string;
  /** Kích thước khung editor lúc lưu (px) */
  width?: number;
  height?: number;
  background?: string;
  objects: Record<string, unknown>[];
}

/** Thiết kế đầy đủ (designs.json) – Design ở market.model chỉ giữ phần Marketplace cần */
export interface DesignDoc extends Design {
  canvasJSON: CanvasData | null;
  /** PNG phần vùng in, nền trong suốt (file in) */
  printFileUrl?: string | null;
  color?: string;
  size?: string | null;
  /** Mặt sau (nếu sản phẩm in 2 mặt và khách có thiết kế mặt sau) */
  sides?: { back?: DesignSide };
}

/** Mẫu thiết kế có sẵn (templates.json) */
export interface DesignTemplate {
  _id: string;
  name: string;
  description: string;
  productId: string;
  status: 'ACTIVE' | 'DRAFT' | string;
  styleTags: string[];
  canvasJSON: CanvasData;
  previewUrl: string;
  usageCount?: number;
}

/** C10 dùng chung 1 component, 3 chế độ */
export type EditorMode = 'NEW' | 'EDIT' | 'SAMPLE_EDIT';

/** Yêu cầu in lại mẫu (orders.items[].sampleReprints) – giai đoạn mock lưu localStorage */
export interface SampleReprintRequest {
  _id: string;
  orderId: string;
  orderItemId: string;
  designId: string;
  /** File in chốt tại thời điểm gửi yêu cầu (bất biến) */
  printFileUrl: string;
  /** Lần 1 miễn phí, lần 2+ = unitPrice snapshot */
  fee: number;
  status: 'REQUESTED' | 'PENDING_PAYMENT';
  createdAt: string;
}

/** Dòng đơn hàng tối giản editor cần (orders.json) */
export interface OrderItemRef {
  orderItemId: string;
  productId: string;
  variantId: string;
  qty: number;
  unitPrice: number;
  designId: string | null;
  requiresSample: boolean;
  sampleStatus: string;
  sampleReprintCount: number;
  editRequest: { openedAt?: string; expiresAt?: string } | null;
}

export interface OrderRef {
  _id: string;
  userId: string;
  orderStatus: string;
  items: OrderItemRef[];
}

/** Thời gian mở cửa sổ chỉnh sửa mẫu (R09) */
export const SAMPLE_EDIT_WINDOW_MS = 48 * 60 * 60 * 1000;
