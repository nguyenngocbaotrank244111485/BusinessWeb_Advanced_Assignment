// Kiểu dữ liệu sản phẩm, khớp với public/dataset/products.json

export interface ProductVariant {
  _id: string;
  color: string;
  size: string | null; // cốc, bình... không có size => null
  stock: number;
  imageUrl?: string;
}

/** Vùng in, tính theo tỉ lệ 0–1 so với ảnh phôi */
export interface PrintArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Product {
  _id: string;
  name: string;
  category: string;
  price: number;
  description: string;
  img_display: string;
  img_detail: string[];
  variants: ProductVariant[];
  isActive: boolean;
  allowCustomization: boolean;
  allowMarketplace: boolean;
  lowStockThreshold?: number;
  printArea?: PrintArea;
  createdAt?: string;
  updatedAt?: string;
}

export interface Category {
  slug: string; // giá trị "category" trong JSON
  label: string; // tên hiển thị
  count: number; // số sản phẩm thuộc danh mục
}

/**
 * Tên hiển thị cho các slug danh mục đã biết.
 * Danh mục lấy từ products.json; slug nào chưa có ở đây vẫn hiện được (tự đổi slug thành chữ).
 */
export const CATEGORY_LABELS: Record<string, string> = {
  'ao-thun': 'Áo thun & Trang phục',
  'tui-vai': 'Túi vải & Túi cá nhân',
  'coc-su': 'Ly cốc & Bình nước',
  'binh-nuoc': 'Ly cốc & Bình nước',
  'van-phong-pham': 'Sổ tay & Ấn phẩm',
  'trang-tri': 'Trang trí & Quà tặng',
  'phu-kien': 'Phụ kiện cá nhân',
};

/** Tên tiếng Việt cho màu trong variants */
export const COLOR_LABELS: Record<string, string> = {
  white: 'Trắng',
  black: 'Đen',
  navy: 'Xanh navy',
  gray: 'Xám',
  grey: 'Xám',
  red: 'Đỏ',
  blue: 'Xanh dương',
  green: 'Xanh lá',
  yellow: 'Vàng',
  pink: 'Hồng',
  beige: 'Be',
  brown: 'Nâu',
};
