import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, forkJoin, map, of } from 'rxjs';
import { CopyrightReport, Design, Listing, ListingInput } from '../models/market.model';
import { PrintArea, Product } from '../models/product.model';

const LOCAL_LISTINGS_KEY = 'printify_market_listings';
const LOCAL_REPORTS_KEY = 'printify_market_reports';
const DEFAULT_FEE_RATE = 0.1; // appConfig.platformFeeRate

/**
 * Marketplace (NV05) – giai đoạn mock:
 * - Đọc listings.json + designs.json (dữ liệu nhóm) và *-demo.json (dữ liệu trình bày).
 * - Tin đăng / sửa / gỡ của người dùng lưu localStorage, gộp đè theo _id.
 * Khi có API chỉ cần thay phần load() và các hàm ghi bằng HTTP (GET/POST/PUT /api/market).
 */
@Injectable({ providedIn: 'root' })
export class MarketService {
  private readonly http = inject(HttpClient);

  private readonly _listings = signal<Listing[]>([]);
  private readonly _designs = signal<Design[]>([]);
  readonly feeRate = signal(DEFAULT_FEE_RATE);
  /** Vùng in (tỉ lệ 0–1 trên ảnh sản phẩm) để ghép mockup: print-areas.json, ưu tiên product.printArea nếu có */
  private readonly printAreas = signal<Record<string, PrintArea>>({});
  readonly loaded = signal(false);
  readonly error = signal('');

  /** Tất cả tin (mọi trạng thái) */
  readonly listings = this._listings.asReadonly();
  /** Chỉ tin đã được duyệt mới hiện công khai */
  readonly approved = computed(() =>
    this._listings()
      .filter((l) => l.status === 'APPROVED')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  );

  constructor() {
    this.load();
  }

  // ---------- đọc ----------

  getListing(id: string): Listing | undefined {
    return this._listings().find((l) => l._id === id);
  }

  getDesign(id: string): Design | undefined {
    return this._designs().find((d) => d._id === id);
  }

  myListings(userId: string): Listing[] {
    return this._listings()
      .filter((l) => l.sellerId === userId)
      .sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt));
  }

  /**
   * Thiết kế được phép đăng bán: do chính user tạo (không phải thiết kế dựng từ listing đã mua)
   * và chưa có tin nào còn hiệu lực (chờ duyệt / đang bán / bị từ chối -> dùng "Sửa & gửi lại").
   * keepDesignId: giữ lại thiết kế của tin đang sửa.
   */
  sellableDesigns(userId: string, keepDesignId?: string): Design[] {
    const busy = new Set(
      this._listings()
        .filter((l) => l.status !== 'UNLISTED')
        .map((l) => l.designId),
    );
    return this._designs().filter(
      (d) => d.userId === userId && !d.listingId && (!busy.has(d._id) || d._id === keepDesignId),
    );
  }

  /** Vùng in của 1 sản phẩm (undefined = sản phẩm chưa hỗ trợ in mockup) */
  printAreaOf(p: Product): PrintArea | undefined {
    return p.printArea ?? this.printAreas()[p._id];
  }

  /** Sản phẩm in được thiết kế Marketplace, sản phẩm mặc định của tin đứng đầu */
  mockupProducts(products: Product[], firstId?: string): Product[] {
    const list = products.filter((p) => !!this.printAreaOf(p));
    return firstId ? [...list.filter((p) => p._id === firstId), ...list.filter((p) => p._id !== firstId)] : list;
  }

  /** File in nền trong suốt của thiết kế (dùng ghép mockup). Thiếu file thì component tự dùng ảnh xem trước. */
  artUrl(designId: string): string {
    return `/uploads/art/${designId}.png`;
  }

  /** Phí sàn và giá người mua trả (BR16) */
  calcFees(sellerPrice: number): { platformFee: number; buyerDesignFee: number } {
    const price = Math.max(0, Math.round(sellerPrice || 0));
    const platformFee = Math.round(price * this.feeRate());
    return { platformFee, buyerDesignFee: price + platformFee };
  }

  /** Ảnh public dạng "/market/x.png" giữ nguyên; đường dẫn tương đối thì đặt trong /dataset */
  imageUrl(path: string | null | undefined): string {
    if (!path) return '/dataset/images/products/placeholder.svg';
    if (/^(https?:|data:|blob:|\/)/i.test(path)) return path;
    return '/dataset/' + path.replace(/^\.?\/+/, '');
  }

  // ---------- ghi (mock: localStorage) ----------

  create(userId: string, input: ListingInput): Listing {
    const design = this.getDesign(input.designId);
    if (!design) throw new Error('Không tìm thấy thiết kế.');
    const now = new Date().toISOString();
    const listing: Listing = {
      _id: 'lst_' + Date.now().toString(36),
      sellerId: userId,
      designId: design._id,
      productId: design.productId, // gắn cố định với sản phẩm của thiết kế
      title: input.title.trim(),
      description: input.description.trim(),
      tags: input.tags,
      sellerPrice: input.sellerPrice,
      ...this.calcFees(input.sellerPrice),
      watermarkUrl: design.previewUrl, // bản thật: backend tạo ảnh watermark khi tiếp nhận
      licenseScope: 'PRINT_ON_FIXED_PRODUCT',
      imageAssetScope: 'WATERMARK_PREVIEW_ONLY',
      acceptedCopyright: input.acceptedCopyright,
      status: 'PENDING_REVIEW', // không tự hiển thị công khai
      reviewedAt: null,
      reviewNote: null,
      createdAt: now,
      updatedAt: now,
    };
    this.saveLocal(listing);
    return listing;
  }

  /** Sửa tin -> gửi duyệt lại */
  update(id: string, userId: string, input: ListingInput): Listing {
    const old = this.getListing(id);
    if (!old || old.sellerId !== userId) throw new Error('Bạn không có quyền sửa tin này.');
    if (old.status === 'UNLISTED') throw new Error('Tin đã gỡ, không sửa được nữa.');
    const listing: Listing = {
      ...old,
      title: input.title.trim(),
      description: input.description.trim(),
      tags: input.tags,
      sellerPrice: input.sellerPrice,
      ...this.calcFees(input.sellerPrice),
      acceptedCopyright: input.acceptedCopyright,
      status: 'PENDING_REVIEW',
      reviewedAt: null,
      reviewNote: null,
      updatedAt: new Date().toISOString(),
    };
    this.saveLocal(listing);
    return listing;
  }

  unlist(id: string, userId: string): void {
    const old = this.getListing(id);
    if (!old || old.sellerId !== userId) return;
    this.saveLocal({ ...old, status: 'UNLISTED', updatedAt: new Date().toISOString() });
  }

  report(listingId: string, reporterId: string, reason: string, description: string): CopyrightReport {
    const report: CopyrightReport = {
      _id: 'rpt_' + Date.now().toString(36),
      listingId,
      reporterId,
      reason,
      description: description.trim(),
      status: 'OPEN',
      createdAt: new Date().toISOString(),
    };
    const all = this.readLocal<CopyrightReport>(LOCAL_REPORTS_KEY);
    this.writeLocal(LOCAL_REPORTS_KEY, [...all, report]);
    return report;
  }

  hasReported(listingId: string, reporterId: string): boolean {
    return this.readLocal<CopyrightReport>(LOCAL_REPORTS_KEY).some(
      (r) => r.listingId === listingId && r.reporterId === reporterId,
    );
  }

  // ---------- nội bộ ----------

  private load(): void {
    const get = <T>(file: string, fallback?: string): Observable<T[]> =>
      this.http.get<T[]>('/dataset/' + file).pipe(
        catchError(() => (fallback ? this.http.get<T[]>('/dataset/' + fallback) : of([] as T[]))),
        catchError(() => of([] as T[])),
      );

    forkJoin({
      listings: get<Listing>('listings.json', 'market_listings.json'),
      demoListings: get<Listing>('listings-demo.json'),
      designs: get<Design>('designs.json'),
      demoDesigns: get<Design>('designs-demo.json'),
      config: this.http
        .get<{ platformFeeRate?: number }>('/dataset/appConfig.json')
        .pipe(catchError(() => of({} as { platformFeeRate?: number }))),
      areas: this.http
        .get<Record<string, PrintArea>>('/dataset/print-areas.json')
        .pipe(catchError(() => of({} as Record<string, PrintArea>))),
    })
      .pipe(
        map(({ listings, demoListings, designs, demoDesigns, config, areas }) => {
          if (config.platformFeeRate != null) this.feeRate.set(config.platformFeeRate);
          this.printAreas.set(areas);
          return {
            listings: this.mergeById([...listings, ...demoListings, ...this.readLocal<Listing>(LOCAL_LISTINGS_KEY)]),
            designs: this.mergeById([...designs, ...demoDesigns]),
          };
        }),
      )
      .subscribe({
        next: ({ listings, designs }) => {
          this._listings.set(listings);
          this._designs.set(designs);
          this.loaded.set(true);
        },
        error: () => {
          this.error.set('Không tải được dữ liệu Marketplace. Vui lòng thử lại.');
          this.loaded.set(true);
        },
      });
  }

  private saveLocal(listing: Listing): void {
    const local = this.readLocal<Listing>(LOCAL_LISTINGS_KEY).filter((l) => l._id !== listing._id);
    this.writeLocal(LOCAL_LISTINGS_KEY, [...local, listing]);
    this._listings.set(this.mergeById([...this._listings(), listing]));
  }

  /** Gộp theo _id, phần tử sau ghi đè phần tử trước */
  private mergeById<T extends { _id: string }>(items: T[]): T[] {
    return [...new Map(items.map((x) => [x._id, x])).values()];
  }

  private readLocal<T>(key: string): T[] {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T[]) : [];
    } catch {
      return [];
    }
  }

  private writeLocal(key: string, value: unknown): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* bỏ qua: dữ liệu vẫn còn trong phiên hiện tại */
    }
  }
}
