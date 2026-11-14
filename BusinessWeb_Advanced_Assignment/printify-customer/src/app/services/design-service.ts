import { Injectable, effect, inject, signal, untracked } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, ReplaySubject, catchError, firstValueFrom, forkJoin, map, of, shareReplay, take } from 'rxjs';
import { DesignDoc, DesignTemplate, OrderRef, SIDE_LABELS, SampleReprintRequest, SideDef, SideKey } from '../models/design.model';
import { PrintArea, Product } from '../models/product.model';
import { MarketService } from './market-service';
import { AuthService } from './auth-service';
import { OrderService } from './order-service';
import { ApiStatusService } from './api-status-service';

const API = '/api/designs';
/** Vùng in mặc định khi sản phẩm chưa khai báo (tỉ lệ 0–1 trên ảnh) */
const DEFAULT_AREA: PrintArea = { x: 0.3, y: 0.3, width: 0.4, height: 0.4 };

type SideConf = Partial<Record<SideKey, PrintArea | 'auto'>>;
interface PrintSidesFile {
  byCategory?: Record<string, SideConf>;
  byProduct?: Record<string, SideConf>;
}

/**
 * Thiết kế của khách (C10 Editor, C11 Thiết kế của tôi) – giai đoạn mock:
 * đọc designs.json (+ designs-demo.json), thiết kế khách tạo/sửa lưu localStorage, gộp đè theo _id.
 * Khi có API: thay load() bằng GET /api/designs, save() bằng POST/PUT /api/designs.
 */
@Injectable({ providedIn: 'root' })
export class DesignService {
  private readonly http = inject(HttpClient);
  private readonly market = inject(MarketService);
  private readonly auth = inject(AuthService);
  private readonly orders = inject(OrderService);
  private readonly api = inject(ApiStatusService);

  private readonly _designs = signal<DesignDoc[]>([]);
  readonly designs = this._designs.asReadonly();

  private readonly loaded$ = new ReplaySubject<void>(1);
  /** Phát khi đã tải xong thiết kế của tài khoản hiện tại (GET /api/designs) */
  readonly ready$: Observable<void> = this.loaded$.pipe(take(1));

  private readonly templates$: Observable<DesignTemplate[]>;
  private readonly areas$: Observable<Record<string, PrintArea>>;
  private readonly sides$: Observable<PrintSidesFile>;

  constructor() {
    const get = <T>(file: string): Observable<T> =>
      this.http.get<T>('/dataset/' + file).pipe(catchError(() => of([] as unknown as T)));

    effect(() => {
      const me = this.auth.user()?._id;
      untracked(() => {
        if (!me) { this._designs.set([]); this.loaded$.next(); return; }
        this.http.get<{ items: DesignDoc[] }>(API, { withCredentials: true }).subscribe({
          next: (r) => { this._designs.set(r.items); this.loaded$.next(); },
          error: (e) => { this.api.report(e, 'Không tải được thiết kế.'); this.loaded$.next(); },
        });
      });
    });

    this.templates$ = get<DesignTemplate[]>('templates.json').pipe(shareReplay(1));
    // vùng in lấy từ sản phẩm trong database (Admin sửa được); server chưa chạy thì dùng file mẫu
    this.areas$ = this.http.get<Record<string, PrintArea>>('/api/config/print-areas').pipe(
      catchError(() => this.http.get<Record<string, PrintArea>>('/dataset/print-areas.json')),
      catchError(() => of({} as Record<string, PrintArea>)),
      shareReplay(1),
    );
    this.sides$ = this.http.get<PrintSidesFile>('/dataset/print-sides.json').pipe(
      catchError(() => of({} as PrintSidesFile)),
      shareReplay(1),
    );
  }

  // ---------- đọc ----------

  get(id: string): DesignDoc | undefined {
    return this._designs().find((d) => d._id === id);
  }

  /** Thiết kế của 1 khách, mới sửa trước */
  byUser(userId: string): DesignDoc[] {
    return this._designs()
      .filter((d) => d.userId === userId)
      .sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt));
  }

  /** Mẫu đang hoạt động của 1 sản phẩm */
  templatesFor(productId: string): Observable<DesignTemplate[]> {
    return this.templates$.pipe(map((list) => list.filter((t) => t.productId === productId && t.status === 'ACTIVE')));
  }

  /** Vùng in: product.printArea > print-areas.json > mặc định */
  printAreaOf(product: Product): Observable<PrintArea> {
    return this.areas$.pipe(map((areas) => product.printArea ?? areas[product._id] ?? DEFAULT_AREA));
  }

  /**
   * Các mặt in của sản phẩm cho Editor (print-sides.json): byProduct > byCategory > 1 mặt theo print-areas.json.
   * Luôn có mặt trước; chỉ có mặt sau khi cấu hình khai báo "back".
   */
  sidesOf(product: Product): Observable<SideDef[]> {
    return forkJoin({ conf: this.sides$, areas: this.areas$ }).pipe(
      map(({ conf, areas }) => {
        const base = product.printArea ?? areas[product._id] ?? DEFAULT_AREA;
        const c = conf.byProduct?.[product._id] ?? conf.byCategory?.[product.category] ?? {};
        const pick = (v: PrintArea | 'auto' | undefined) => (v && v !== 'auto' ? v : base);
        const list: SideDef[] = [{ key: 'front', label: SIDE_LABELS.front, area: pick(c.front) }];
        if (c.back) list.push({ key: 'back', label: SIDE_LABELS.back, area: pick(c.back) });
        return list;
      }),
    );
  }

  findOrder(orderId: string): Observable<OrderRef | undefined> {
    return this.http.get<{ order: OrderRef }>(`/api/orders/${orderId}`, { withCredentials: true }).pipe(
      map((r) => r.order),
      catchError(() => of(undefined)),
    );
  }

  /** Lượt in lại mẫu đã xin (server lưu trong dòng đơn: items[].sampleReprints) */
  reprintsOf(orderId: string, orderItemId: string): SampleReprintRequest[] {
    const item = this.orders.getById(orderId)?.items.find((i) => i.orderItemId === orderItemId) as { sampleReprints?: SampleReprintRequest[] } | undefined;
    return item?.sampleReprints ?? [];
  }

  newId(): string {
    return 'dsg_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // ---------- ghi ----------

  /** PUT /api/designs/:id (tạo mới hoặc ghi đè). false = server từ chối / mất kết nối */
  async save(doc: DesignDoc): Promise<boolean> {
    try {
      const r = await firstValueFrom(this.http.put<{ design: DesignDoc }>(`${API}/${doc._id}`, doc, { withCredentials: true }));
      this._designs.set(this.mergeById([...this._designs(), r.design]));
      this.market.upsertDesign(r.design);
      return true;
    } catch (e) {
      this.api.report(e, 'Không lưu được thiết kế.');
      return false;
    }
  }

  /** "Dùng lại": server tạo bản sao (designId mới, giữ productId) */
  async copy(id: string, _userId?: string): Promise<DesignDoc | null> {
    try {
      const r = await firstValueFrom(this.http.post<{ design: DesignDoc }>(`${API}/${id}/copy`, {}, { withCredentials: true }));
      this._designs.set([...this._designs(), r.design]);
      this.market.upsertDesign(r.design);
      return r.design;
    } catch (e) {
      this.api.report(e, 'Không tạo được bản sao.');
      return null;
    }
  }

  /** DELETE /api/designs/:id – server chặn nếu thiết kế đang đăng bán */
  async remove(id: string, _userId?: string): Promise<boolean> {
    try {
      await firstValueFrom(this.http.delete(`${API}/${id}`, { withCredentials: true }));
      this._designs.set(this._designs().filter((d) => d._id !== id));
      this.market.removeDesign(id);
      return true;
    } catch (e) {
      this.api.report(e, 'Không xóa được thiết kế.');
      return false;
    }
  }

  /** POST /api/orders/:id/items/:itemId/reprints – server tính phí, trừ phôi nếu miễn phí */
  async requestReprint(req: SampleReprintRequest): Promise<boolean> {
    try {
      await firstValueFrom(this.http.post(`/api/orders/${req.orderId}/items/${req.orderItemId}/reprints`, { designId: req.designId }, { withCredentials: true }));
      this.orders.reload();
      return true;
    } catch (e) {
      this.api.report(e, 'Không gửi được yêu cầu in lại mẫu.');
      return false;
    }
  }

  private mergeById<T extends { _id: string }>(items: T[]): T[] {
    return [...new Map(items.map((x) => [x._id, x])).values()];
  }
}
