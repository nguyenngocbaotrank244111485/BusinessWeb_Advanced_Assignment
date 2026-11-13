import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, shareReplay } from 'rxjs';
import {
  CATEGORY_LABELS,
  COLOR_LABELS,
  Category,
  Product,
  ProductVariant,
} from '../models/product.model';

// Giữ export cũ để các file đang import { Product } từ đây không bị lỗi
export type { Product, ProductVariant, Category } from '../models/product.model';

/** Thư mục chứa dataset (trong public/), ảnh nằm trong dataset/images/... */
const DATASET_BASE = '/dataset/';
export const PLACEHOLDER_IMAGE = `${DATASET_BASE}images/products/placeholder.svg`;

@Injectable({
  providedIn: 'root',
})
export class ProductService {
  private readonly apiUrl = `${DATASET_BASE}products.json`;

  /** Tải 1 lần, các trang dùng chung kết quả */
  private readonly products$: Observable<Product[]>;

  constructor(private http: HttpClient) {
    this.products$ = this.http.get<Partial<Product>[]>(this.apiUrl).pipe(
      map((list) => list.map((raw) => this.normalize(raw))),
      shareReplay(1),
    );
  }

  /** Tất cả sản phẩm (đã chuẩn hoá đường dẫn ảnh và giá trị mặc định) */
  getProducts(): Observable<Product[]> {
    return this.products$;
  }

  /** Chỉ sản phẩm đang bán (isActive) */
  getActiveProducts(): Observable<Product[]> {
    return this.products$.pipe(map((list) => list.filter((p) => p.isActive)));
  }

  getProductById(id: string): Observable<Product | undefined> {
    return this.products$.pipe(map((list) => list.find((p) => p._id === id)));
  }

  /** Danh mục lấy theo dữ liệu thật trong JSON, giữ thứ tự xuất hiện */
  getCategories(): Observable<Category[]> {
    return this.getActiveProducts().pipe(
      map((list) => {
        const counts = new Map<string, number>();
        for (const p of list) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
        return [...counts].map(([slug, count]) => ({
          slug,
          label: this.categoryLabel(slug),
          count,
        }));
      }),
    );
  }

  /** Tìm theo tên + mô tả, lọc theo danh mục và khoảng giá */
  filterProducts(
    list: Product[],
    opts: { keyword?: string; category?: string; minPrice?: number | null; maxPrice?: number | null },
  ): Product[] {
    const kw = this.stripAccents(opts.keyword ?? '').trim();
    return list.filter((p) => {
      if (opts.category && p.category !== opts.category) return false;
      if (opts.minPrice != null && p.price < opts.minPrice) return false;
      if (opts.maxPrice != null && p.price > opts.maxPrice) return false;
      if (kw && !this.stripAccents(`${p.name} ${p.description}`).includes(kw)) return false;
      return true;
    });
  }

  // ---------- Hỗ trợ trang chi tiết ----------

  /** Danh sách màu không trùng của sản phẩm */
  getColors(p: Product): string[] {
    return [...new Set(p.variants.map((v) => v.color))];
  }

  /** Size có của 1 màu (rỗng nếu sản phẩm không có size, vd cốc) */
  getSizes(p: Product, color?: string): string[] {
    const vs = color ? p.variants.filter((v) => v.color === color) : p.variants;
    return [...new Set(vs.map((v) => v.size).filter((s): s is string => !!s))];
  }

  findVariant(p: Product, color: string, size: string | null): ProductVariant | undefined {
    return p.variants.find((v) => v.color === color && (v.size ?? null) === (size ?? null));
  }

  totalStock(p: Product): number {
    return p.variants.reduce((sum, v) => sum + (v.stock ?? 0), 0);
  }

  categoryLabel(slug: string): string {
    return (
      CATEGORY_LABELS[slug] ??
      slug
        .split('-')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')
    );
  }

  colorLabel(color: string): string {
    return COLOR_LABELS[color?.toLowerCase()] ?? color;
  }

  formatPrice(value: number): string {
    return new Intl.NumberFormat('vi-VN').format(value) + 'đ';
  }

  /**
   * Đổi đường dẫn ảnh trong JSON thành URL dùng được trên web.
   *  "images/products/a.webp"          -> "/dataset/images/products/a.webp"
   *  "/images/products/a.webp"         -> "/dataset/images/products/a.webp"
   *  "dataset/images/products/a.webp"  -> "/dataset/images/products/a.webp"
   *  "https://..."                     -> giữ nguyên
   */
  resolveImage(path: string | null | undefined): string {
    if (!path) return PLACEHOLDER_IMAGE;
    const p = path.trim();
    if (/^(https?:|data:|blob:)/i.test(p)) return p;
    const clean = p.replace(/^\.?\/+/, '');
    if (clean.startsWith('dataset/')) return '/' + clean;
    return DATASET_BASE + clean;
  }

  // ---------- nội bộ ----------

  private normalize(raw: Partial<Product>): Product {
    const variants = (raw.variants ?? []).map((v) => ({
      ...v,
      size: v.size ?? null,
      stock: v.stock ?? 0,
      imageUrl: v.imageUrl ? this.resolveImage(v.imageUrl) : undefined,
    }));
    const display = raw.img_display || variants.find((v) => v.imageUrl)?.imageUrl;
    return {
      _id: raw._id ?? '',
      name: raw.name ?? '',
      category: raw.category ?? 'khac',
      price: raw.price ?? 0,
      description: raw.description ?? '',
      img_display: this.resolveImage(display),
      img_detail: (raw.img_detail ?? []).map((src) => this.resolveImage(src)),
      variants,
      // JSON chưa có các trường này => mặc định để sản phẩm vẫn hiện
      isActive: raw.isActive ?? true,
      allowCustomization: raw.allowCustomization ?? true,
      allowMarketplace: raw.allowMarketplace ?? true,
      lowStockThreshold: raw.lowStockThreshold,
      printArea: raw.printArea,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    };
  }

  private stripAccents(s: string): string {
    return s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .toLowerCase();
  }
}
