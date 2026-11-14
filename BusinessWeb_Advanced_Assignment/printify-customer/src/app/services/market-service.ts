import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, forkJoin, map, of, tap } from 'rxjs';
import { CopyrightReport, Design, DesignSale, Listing, ListingInput, MyMarketItem } from '../models/market.model';
import { PrintArea, Product } from '../models/product.model';
import { AuthService } from './auth-service';
import { ConfigService } from './config-service';

const API = '/api/market';

/** Lượt bán server trả về trong /api/market/mine */
type MineSale = { _id: string; productId: string | null; sellerPrice: number; recordedAt: string };
type MineRow = { key: string; status: MyMarketItem['status']; design: Design | null; listing?: Listing; soldCount: number; earned: number; sales: MineSale[]; updatedAt: string };

/**
 * Marketplace (C05, C06, C20) – dữ liệu từ MongoDB qua /api/market.
 * Giữ dạng "kho" bằng signal (tên hàm như cũ) để Editor, Thiết kế của tôi, Giới thiệu dùng tiếp không phải sửa:
 *  - approved / listings: tin đã duyệt (GET /api/market) + mọi tin của tôi (GET /api/market/mine)
 *  - myMarket(): My marketplace (nháp + tin + lượt bán) do server tính
 * Ghi (đăng / sửa / gỡ / báo cáo) trả Observable – server kiểm tra quyền, giá, trạng thái.
 */
@Injectable({ providedIn: 'root' })
export class MarketService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly config = inject(ConfigService);

  private readonly _public = signal<Listing[]>([]);
  private readonly _mine = signal<MineRow[]>([]);
  private readonly reported = signal<Set<string>>(new Set());
  private readonly printAreas = signal<Record<string, PrintArea>>({});
  readonly loaded = signal(false);
  readonly error = signal('');
  readonly feeRate = computed(() => this.config.config().platformFeeRate ?? 0.1);

  /** Mọi tin biết được: tin đang bán + tin của tôi (mọi trạng thái) */
  readonly listings = computed(() => this.mergeById([...this._public(), ...this._mine().flatMap((r) => (r.listing ? [r.listing] : []))]));
  /** Chỉ tin đã được duyệt mới hiện công khai */
  readonly approved = computed(() =>
    this.listings()
      .filter((l) => l.status === 'APPROVED')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  );
  private readonly designs = computed(() => this._mine().flatMap((r) => (r.design ? [r.design] : [])));

  constructor() {
    this.http
      .get<Record<string, PrintArea>>(`${API}/print-areas`)
      .pipe(
        catchError(() => this.http.get<Record<string, PrintArea>>('/dataset/print-areas.json')),
        catchError(() => of({} as Record<string, PrintArea>)),
      )
      .subscribe((a) => this.printAreas.set(a));
    // tải lại khi đăng nhập / đăng xuất / đổi tài khoản
    effect(() => {
      this.auth.user()?._id;
      untracked(() => this.reload());
    });
  }

  // ---------- đọc ----------

  getListing(id: string): Listing | undefined {
    return this.listings().find((l) => l._id === id);
  }

  getDesign(id: string): Design | undefined {
    return this.designs().find((d) => d._id === id);
  }

  /** Lượt bán của tin của tôi (người bán xem danh sách người mua) */
  salesOf(listingId: string): DesignSale[] {
    const row = this._mine().find((r) => r.listing?._id === listingId);
    return (row?.sales ?? []).map((s) => ({
      _id: s._id, orderId: '', orderItemId: '', listingId, sellerId: row?.listing?.sellerId ?? '', buyerId: '', productId: s.productId ?? undefined,
      sellerPrice: s.sellerPrice, platformFee: 0, buyerDesignFee: 0, status: 'RECORDED', reversedAmount: 0, reversedAt: null, recordedAt: s.recordedAt,
    }));
  }

  /** Số lượt bán của 1 tin bất kỳ (server đếm) */
  soldCount(listing: Listing): number {
    return listing.soldCount ?? this.salesOf(listing._id).length;
  }

  /** C20 – My marketplace: thiết kế nháp + tất cả tin của tôi (server tính lượt bán, tiền nhận) */
  myMarket(_userId?: string): MyMarketItem[] {
    return this._mine().map((r) => ({
      key: r.key,
      status: r.status,
      design: r.design ?? undefined,
      listing: r.listing,
      title: r.listing?.title ?? 'Thiết kế chưa đăng bán',
      imageUrl: this.imageUrl(r.listing?.watermarkUrl ?? r.design?.previewUrl),
      soldCount: r.soldCount,
      earned: r.earned,
      updatedAt: r.updatedAt,
    }));
  }

  myListings(userId: string): Listing[] {
    return this.listings()
      .filter((l) => l.sellerId === userId)
      .sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt));
  }

  /** Thiết kế được phép đăng bán = dòng "Đang chỉnh sửa" của My marketplace (+ thiết kế của tin đang sửa) */
  sellableDesigns(_userId: string, keepDesignId?: string): Design[] {
    return this._mine()
      .filter((r) => r.design && (r.status === 'EDITING' || r.design._id === keepDesignId))
      .map((r) => r.design!);
  }

  hasReported(listingId: string, _reporterId?: string): boolean {
    return this.reported().has(listingId);
  }

  /** Hỏi server tin này tôi đã báo cáo chưa (gọi khi mở trang chi tiết) */
  checkReported(listingId: string): void {
    if (!this.auth.user()) return;
    this.http.get<{ hasReported: boolean }>(`${API}/${listingId}`, { withCredentials: true }).subscribe({
      next: (r) => { if (r.hasReported) this.reported.update((s) => new Set(s).add(listingId)); },
      error: () => undefined,
    });
  }

  printAreaOf(p: Product): PrintArea | undefined {
    return p.printArea ?? this.printAreas()[p._id];
  }

  mockupProducts(products: Product[], firstId?: string): Product[] {
    const list = products.filter((p) => !!this.printAreaOf(p));
    return firstId ? [...list.filter((p) => p._id === firstId), ...list.filter((p) => p._id !== firstId)] : list;
  }

  artUrl(designId: string): string {
    return `/uploads/art/${designId}.png`;
  }

  /** Xem trước phí (server tính lại khi lưu) */
  calcFees(sellerPrice: number): { platformFee: number; buyerDesignFee: number } {
    const price = Math.max(0, Math.round(sellerPrice || 0));
    const platformFee = Math.round(price * this.feeRate());
    return { platformFee, buyerDesignFee: price + platformFee };
  }

  imageUrl(path: string | null | undefined): string {
    if (!path) return '/dataset/images/products/placeholder.svg';
    if (/^(https?:|data:|blob:|\/)/i.test(path)) return path;
    return '/dataset/' + path.replace(/^\.?\/+/, '');
  }

  // ---------- ghi (POST / PUT /api/market) ----------

  create(_userId: string, input: ListingInput): Observable<Listing> {
    return this.http.post<{ listing: Listing }>(API, input, { withCredentials: true }).pipe(map((r) => r.listing), tap(() => this.reload()));
  }

  /** Sửa tin -> gửi duyệt lại */
  update(id: string, _userId: string, input: ListingInput): Observable<Listing> {
    return this.http.put<{ listing: Listing }>(`${API}/${id}`, input, { withCredentials: true }).pipe(map((r) => r.listing), tap(() => this.reload()));
  }

  unlist(id: string, _userId?: string): Observable<void> {
    return this.http.post(`${API}/${id}/unlist`, {}, { withCredentials: true }).pipe(map(() => undefined), tap(() => this.reload()));
  }

  report(listingId: string, _reporterId: string, reason: string, description: string): Observable<CopyrightReport> {
    return this.http.post<{ report: CopyrightReport }>(`${API}/${listingId}/reports`, { reason, description }, { withCredentials: true }).pipe(
      map((r) => r.report),
      tap(() => this.reported.update((s) => new Set(s).add(listingId))),
    );
  }

  /** Editor / C11 vừa lưu hoặc xóa thiết kế -> tải lại My marketplace */
  upsertDesign(_design: Design): void {
    this.reloadMine();
  }

  removeDesign(_id: string): void {
    this.reloadMine();
  }

  reload(): void {
    forkJoin({
      pub: this.http.get<{ items: Listing[] }>(API, { params: { limit: 60 }, withCredentials: true }).pipe(map((r) => r.items)),
      mine: this.auth.user()
        ? this.http.get<{ items: MineRow[] }>(`${API}/mine`, { withCredentials: true }).pipe(map((r) => r.items), catchError(() => of([] as MineRow[])))
        : of([] as MineRow[]),
    }).subscribe({
      next: ({ pub, mine }) => {
        this._public.set(pub);
        this._mine.set(mine);
        this.error.set('');
        this.loaded.set(true);
      },
      error: () => this.loadOffline(),
    });
  }

  private reloadMine(): void {
    if (!this.auth.user()) return;
    this.http.get<{ items: MineRow[] }>(`${API}/mine`, { withCredentials: true }).subscribe({ next: (items) => this._mine.set(items.items), error: () => undefined });
  }

  /** Server chưa chạy: chỉ xem tin mẫu trong /dataset (không đăng / sửa được) */
  private loadOffline(): void {
    forkJoin({
      a: this.http.get<Listing[]>('/dataset/listings.json').pipe(catchError(() => of([] as Listing[]))),
      b: this.http.get<Listing[]>('/dataset/listings-demo.json').pipe(catchError(() => of([] as Listing[]))),
    }).subscribe(({ a, b }) => {
      this._public.set(this.mergeById([...a, ...b]).filter((l) => l.status === 'APPROVED'));
      this._mine.set([]);
      this.error.set('');
      this.loaded.set(true);
    });
  }

  private mergeById<T extends { _id: string }>(items: T[]): T[] {
    return [...new Map(items.map((x) => [x._id, x])).values()];
  }
}
