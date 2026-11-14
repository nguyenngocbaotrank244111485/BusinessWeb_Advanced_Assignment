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
  /** Đường dẫn thân thiện: /products/ao-thun-cotton-basic (duy nhất) */
  slug: string;
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
  cream: 'Kem',
  silver: 'Bạc',
  clear: 'Trong suốt',
  'white-black': 'Trắng lòng đen',
  'white-blue': 'Trắng lòng xanh',
};

/**
 * Màu hiển thị cho chấm màu (swatch). Màu nào CSS đã hiểu sẵn (white, black...) thì khỏi khai báo.
 * Màu 2 tông viết dạng "ngoài-trong", ví dụ white-black.
 */
export const COLOR_SWATCHES: Record<string, string> = {
  beige: '#e8dcc4',
  cream: '#f3e9d2',
  gray: '#9a9aa2',
  grey: '#9a9aa2',
  navy: '#1f2a44',
  silver: 'linear-gradient(135deg, #f4f4f6, #b9bbc2)',
  clear: 'repeating-conic-gradient(#e6e1ee 0% 25%, #ffffff 0% 50%) 50% / 8px 8px',
  'white-black': 'linear-gradient(135deg, #ffffff 50%, #1d1d1f 50%)',
  'white-blue': 'linear-gradient(135deg, #ffffff 50%, #3a6fd8 50%)',
};
