import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, catchError, forkJoin, map, of, shareReplay } from 'rxjs';
import { DesignDoc, DesignTemplate, OrderRef, SIDE_LABELS, SampleReprintRequest, SideDef, SideKey } from '../models/design.model';
import { PrintArea, Product } from '../models/product.model';
import { MarketService } from './market-service';

export const LOCAL_DESIGNS_KEY = 'printify_designs';
const LOCAL_REPRINTS_KEY = 'printify_sample_reprints';
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

  private readonly _designs = signal<DesignDoc[]>([]);
  readonly designs = this._designs.asReadonly();

  /** Phát 1 lần khi dữ liệu đã sẵn sàng */
  readonly ready$: Observable<void>;

  private readonly templates$: Observable<DesignTemplate[]>;
  private readonly areas$: Observable<Record<string, PrintArea>>;
  private readonly orders$: Observable<OrderRef[]>;
  private readonly sides$: Observable<PrintSidesFile>;

  constructor() {
    const get = <T>(file: string): Observable<T> =>
      this.http.get<T>('/dataset/' + file).pipe(catchError(() => of([] as unknown as T)));

    this.ready$ = forkJoin({
      base: get<DesignDoc[]>('designs.json'),
      demo: get<DesignDoc[]>('designs-demo.json'),
    }).pipe(
      map(({ base, demo }) => {
        this._designs.set(this.mergeById([...base, ...demo, ...this.readLocal<DesignDoc>(LOCAL_DESIGNS_KEY)]));
      }),
      shareReplay(1),
    );
    this.ready$.subscribe();

    this.templates$ = get<DesignTemplate[]>('templates.json').pipe(shareReplay(1));
    this.areas$ = this.http.get<Record<string, PrintArea>>('/dataset/print-areas.json').pipe(
      catchError(() => of({} as Record<string, PrintArea>)),
      shareReplay(1),
    );
    this.orders$ = get<OrderRef[]>('orders.json').pipe(shareReplay(1));
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
    return this.orders$.pipe(map((list) => list.find((o) => o._id === orderId)));
  }

  reprintsOf(orderId: string, orderItemId: string): SampleReprintRequest[] {
    return this.readLocal<SampleReprintRequest>(LOCAL_REPRINTS_KEY).filter(
      (r) => r.orderId === orderId && r.orderItemId === orderItemId,
    );
  }

  newId(): string {
    return 'dsg_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // ---------- ghi ----------

  /** Lưu (tạo mới hoặc ghi đè cùng _id). false = bộ nhớ trình duyệt đầy */
  save(doc: DesignDoc): boolean {
    const local = this.readLocal<DesignDoc>(LOCAL_DESIGNS_KEY).filter((d) => d._id !== doc._id);
    if (!this.writeLocal(LOCAL_DESIGNS_KEY, [...local, doc])) return false;
    this._designs.set(this.mergeById([...this._designs(), doc]));
    this.market.upsertDesign(doc);
    return true;
  }

  /** "Dùng lại": tạo bản sao (designId mới, giữ productId) */
  copy(id: string, userId: string): DesignDoc | null {
    const src = this.get(id);
    if (!src || src.userId !== userId) return null;
    const now = new Date().toISOString();
    const doc: DesignDoc = { ...src, _id: this.newId(), createdAt: now, updatedAt: now };
    return this.save(doc) ? doc : null;
  }

  requestReprint(req: SampleReprintRequest): boolean {
    return this.writeLocal(LOCAL_REPRINTS_KEY, [...this.readLocal<SampleReprintRequest>(LOCAL_REPRINTS_KEY), req]);
  }

  // ---------- nội bộ ----------

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

  private writeLocal(key: string, value: unknown): boolean {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }
}
