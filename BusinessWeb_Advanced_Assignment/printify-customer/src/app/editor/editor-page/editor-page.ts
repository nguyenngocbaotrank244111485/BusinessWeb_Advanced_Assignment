import {
  AfterViewInit,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  NgZone,
  OnDestroy,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Location } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, firstValueFrom } from 'rxjs';
import { Canvas, Circle, FabricImage, FabricObject, Path, PencilBrush, Point, Rect, StaticCanvas, Textbox, util } from 'fabric';

import { Product, PrintArea, ProductVariant } from '../../models/product.model';
import { Listing } from '../../models/market.model';
import {
  CanvasData,
  DesignDoc,
  DesignTemplate,
  EditorMode,
  OrderItemRef,
  SAMPLE_EDIT_WINDOW_MS,
  SideDef,
  SideKey,
} from '../../models/design.model';
import { SHAPES, ShapeDef } from './shapes';
import { ProductService } from '../../services/product-service';
import { DesignService } from '../../services/design-service';
import { CartService } from '../../services/cart-service';
import { AuthService } from '../../services/auth-service';
import { MarketService } from '../../services/market-service';

type Tab = 'design' | 'product' | 'layers' | 'templates';
interface LayerItem {
  obj: FabricObject;
  label: string;
  icon: string;
}
interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Draft {
  sides: Partial<Record<SideKey, string>>;
  color: string;
  size: string | null;
  savedAt: string;
}
/** Trạng thái của mặt đang không hiển thị */
interface SideState {
  objects: string;
  history: string[];
  redo: string[];
}
interface SideExport {
  objects: Record<string, unknown>[];
  preview: string;
  print: string;
  outOfBounds: boolean;
}

/** Kích thước khung thiết kế (px, ở mức zoom 100%) */
const STAGE = 560;
const MAX_UPLOAD = 5 * 1024 * 1024;
const UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const HISTORY_LIMIT = 30;
const AUTOSAVE_MS = 30_000;
/** Thuộc tính riêng cần giữ khi xuất JSON */
const EXTRA_PROPS = ['name'];

/** Màu phôi tối -> chữ mặc định màu trắng */
const DARK_COLORS = ['black', 'navy', 'gray', 'grey', 'brown', 'green', 'red', 'blue'];

export const FONTS = ['Arial', 'Inter', 'Times New Roman', 'Georgia', 'Courier New', 'Verdana', 'Impact', 'Comic Sans MS'];

/**
 * C10 – Design Editor: 1 component, 3 chế độ
 *  NEW         /editor/:productId?color&size&templateId&listingId
 *  EDIT        /editor/designs/:designId
 *  SAMPLE_EDIT /account/orders/:orderId/items/:itemId/edit  (chỉ khi cửa sổ sửa mẫu 48h còn hiệu lực)
 * Port từ editor.html (Fabric.js) của đồ án cũ.
 */
@Component({
  selector: 'app-editor-page',
  standalone: false,
  templateUrl: './editor-page.html',
  styleUrl: './editor-page.css',
})
export class EditorPage implements AfterViewInit, OnDestroy {
  @ViewChild('canvasEl') private canvasEl!: ElementRef<HTMLCanvasElement>;
  @ViewChild('fileInput') private fileInput!: ElementRef<HTMLInputElement>;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly zone = inject(NgZone);
  private readonly destroyRef = inject(DestroyRef);
  readonly ps = inject(ProductService);
  private readonly designs = inject(DesignService);
  private readonly cart = inject(CartService);
  private readonly auth = inject(AuthService);
  private readonly market = inject(MarketService);
  private readonly marketLoaded$ = toObservable(this.market.loaded);

  readonly fonts = FONTS;
  readonly shapes = SHAPES;

  // ---------- trạng thái trang ----------
  readonly mode = signal<EditorMode>('NEW');
  readonly loading = signal(true);
  readonly fatal = signal('');
  readonly product = signal<Product | null>(null);
  readonly color = signal('');
  readonly size = signal<string | null>(null);
  readonly qty = signal(1);
  readonly designId = signal<string | null>(null);
  readonly listing = signal<Listing | null>(null);
  readonly orderId = signal('');
  readonly orderItem = signal<OrderItemRef | null>(null);
  readonly templates = signal<DesignTemplate[]>([]);
  readonly tab = signal<Tab>('design');

  // ---------- trạng thái canvas ----------
  readonly zoom = signal(1);
  readonly selected = signal<FabricObject | null>(null);
  /** Tăng mỗi khi thuộc tính object đổi để form bên phải đọc lại */
  readonly selTick = signal(0);
  readonly layers = signal<LayerItem[]>([]);
  readonly canUndo = signal(false);
  readonly canRedo = signal(false);
  readonly outOfBounds = signal(false);
  readonly dirty = signal(false);
  readonly busy = signal(false);
  /** Bút vẽ tự do */
  readonly drawing = signal(false);
  readonly brushColor = signal('#8b57c4');
  readonly brushWidth = signal(6);
  /** Menu chọn hình khối */
  readonly shapeMenu = signal(false);
  /** Mặt in: trước / sau */
  readonly sides = signal<SideDef[]>([]);
  readonly side = signal<SideKey>('front');
  /** Số đối tượng trên từng mặt (hiện trên nút chuyển mặt) */
  readonly sideCounts = signal<Record<SideKey, number>>({ front: 0, back: 0 });

  // ---------- popup ----------
  readonly preview = signal<{ label: string; src: string }[] | null>(null);
  readonly confirmCart = signal(false);
  readonly leavePrompt = signal(false);
  readonly draftOffer = signal<Draft | null>(null);
  readonly toast = signal<{ type: 'ok' | 'error' | 'warn'; text: string } | null>(null);

  // ---------- suy ra ----------
  readonly colors = computed(() => {
    const p = this.product();
    return p ? this.ps.getColors(p) : [];
  });
  readonly sizes = computed(() => {
    const p = this.product();
    return p ? this.ps.getSizes(p, this.color()) : [];
  });
  readonly variant = computed<ProductVariant | undefined>(() => {
    const p = this.product();
    if (!p) return undefined;
    if (this.sizes().length && !this.size()) return undefined;
    return this.ps.findVariant(p, this.color(), this.sizes().length ? this.size() : null);
  });
  readonly stock = computed(() => this.variant()?.stock ?? 0);
  readonly designFee = computed(() => this.listing()?.buyerDesignFee ?? 0);
  readonly total = computed(() => (this.product()?.price ?? 0) * this.qty() + this.designFee());
  /** Thiết kế dựng từ listing người khác -> không được đăng bán lại */
  readonly canPublish = computed(
    () => this.mode() !== 'SAMPLE_EDIT' && !this.listing() && !this.designs.get(this.designId() ?? '')?.listingId,
  );
  readonly reprintFee = computed(() => {
    const item = this.orderItem();
    if (!item) return 0;
    const used = item.sampleReprintCount + this.designs.reprintsOf(this.orderId(), item.orderItemId).length;
    return used >= 1 ? item.unitPrice : 0;
  });

  /** Thuộc tính object đang chọn cho panel bên phải */
  readonly props = computed(() => {
    this.selTick();
    const o = this.selected();
    if (!o) return null;
    const isText = o instanceof Textbox;
    const t = o as Textbox;
    return {
      x: Math.round(o.left ?? 0),
      y: Math.round(o.top ?? 0),
      angle: Math.round(o.angle ?? 0),
      opacity: Math.round((o.opacity ?? 1) * 100),
      fill: typeof o.fill === 'string' ? o.fill : '#000000',
      isText,
      isShape: this.isShape(o),
      isPath: o instanceof Path && !this.isShape(o),
      stroke: typeof o.stroke === 'string' ? o.stroke : '#000000',
      strokeWidth: o.strokeWidth ?? 1,
      fontFamily: isText ? t.fontFamily : '',
      fontSize: isText ? t.fontSize : 0,
      bold: isText && (t.fontWeight === 'bold' || t.fontWeight === 700),
      italic: isText && t.fontStyle === 'italic',
      underline: isText && !!t.underline,
      textAlign: isText ? t.textAlign : 'left',
    };
  });

  private canvas!: Canvas;
  /** Vùng in tính theo px trên khung (zoom 100%) */
  private areaPx: Box = { x: 0, y: 0, w: STAGE, h: STAGE };
  private area: PrintArea = { x: 0.3, y: 0.3, width: 0.4, height: 0.4 };
  /** Mặt đang không hiển thị: giữ objects + lịch sử riêng */
  private store: Partial<Record<SideKey, SideState>> = {};
  private history: string[] = [];
  private redoStack: string[] = [];
  private current = '[]';
  private restoring = false;
  private exporting = false;
  private toastTimer?: ReturnType<typeof setTimeout>;
  private autosaveTimer?: ReturnType<typeof setInterval>;
  private leaveResolve?: (ok: boolean) => void;

  // =====================================================================
  // Khởi tạo
  // =====================================================================

  ngAfterViewInit(): void {
    // Fabric tự xử lý chuột liên tục -> chạy ngoài Angular, chỉ quay lại zone khi cập nhật UI
    this.zone.runOutsideAngular(() => {
      this.canvas = new Canvas(this.canvasEl.nativeElement, {
        width: STAGE,
        height: STAGE,
        backgroundColor: '#ffffff',
        preserveObjectStacking: true,
      });
    });
    this.bindCanvasEvents();
    void this.init();
    this.autosaveTimer = setInterval(() => this.autosaveDraft(), AUTOSAVE_MS);
  }

  ngOnDestroy(): void {
    clearInterval(this.autosaveTimer);
    clearTimeout(this.toastTimer);
    void this.canvas?.dispose();
  }

  private async init(): Promise<void> {
    try {
      await firstValueFrom(this.designs.ready$);
      const pm = this.route.snapshot.paramMap;
      const qm = this.route.snapshot.queryParamMap;
      const me = this.auth.user()?._id ?? '';
      let doc: DesignDoc | undefined;
      let productId = pm.get('productId') ?? '';
      let presetVariantId = '';

      if (pm.get('orderId')) {
        // ----- SAMPLE_EDIT -----
        this.mode.set('SAMPLE_EDIT');
        const order = await firstValueFrom(this.designs.findOrder(pm.get('orderId')!));
        const item = order?.items.find((i) => i.orderItemId === pm.get('itemId'));
        if (!order || !item || !item.designId) return this.fail('Không tìm thấy dòng đơn hàng cần sửa mẫu.');
        if (order.userId !== me) return this.fail('Bạn không có quyền sửa mẫu của đơn hàng này.');
        if (order.orderStatus !== 'SAMPLE_REVIEW' || !item.requiresSample || item.sampleStatus === 'APPROVED')
          return this.fail('Đơn hàng không ở bước duyệt mẫu nên chưa thể chỉnh sửa thiết kế.');
        const opened = item.editRequest?.openedAt ? Date.parse(item.editRequest.openedAt) : Date.now();
        if (Date.now() - opened > SAMPLE_EDIT_WINDOW_MS)
          return this.fail('Cửa sổ chỉnh sửa mẫu 48 giờ đã hết hạn. Hãy mở lại yêu cầu ở trang chi tiết đơn.');
        this.orderId.set(order._id);
        this.orderItem.set(item);
        this.qty.set(item.qty);
        doc = this.designs.get(item.designId);
        productId = item.productId;
        presetVariantId = item.variantId;
      } else if (pm.get('designId')) {
        // ----- EDIT -----
        this.mode.set('EDIT');
        doc = this.designs.get(pm.get('designId')!);
        if (!doc) return this.fail('Không tìm thấy thiết kế này.');
        if (doc.userId !== me) return this.fail('Bạn chỉ có thể sửa thiết kế của chính mình.');
        productId = doc.productId;
      }

      const product = await firstValueFrom(this.ps.getProductById(productId));
      if (!product || !product.isActive) return this.fail('Sản phẩm không tồn tại hoặc đã ngừng bán.');
      if (!product.allowCustomization) return this.fail('Sản phẩm này không hỗ trợ tự thiết kế.');
      this.product.set(product);

      // màu / size: query > thiết kế đã lưu > biến thể của đơn > màu đầu tiên còn hàng
      const colors = this.ps.getColors(product);
      const preset = product.variants.find((v) => v._id === presetVariantId);
      const wantColor = qm.get('color') || doc?.color || preset?.color || '';
      this.color.set(colors.includes(wantColor) ? wantColor : colors[0] ?? '');
      const wantSize = qm.get('size') || doc?.size || preset?.size || null;
      this.size.set(wantSize && this.sizes().includes(wantSize) ? wantSize : null);

      const sides = await firstValueFrom(this.designs.sidesOf(product));
      this.sides.set(sides);
      this.area = sides[0].area;
      this.templates.set(await firstValueFrom(this.designs.templatesFor(product._id)));
      await this.renderBackground();

      if (doc) {
        this.designId.set(doc._id);
        if (doc.listingId) this.listing.set((await this.findListing(doc.listingId)) ?? null);
        if (doc.canvasJSON?.objects?.length) await this.loadObjects(doc.canvasJSON.objects);
      } else if (qm.get('listingId')) {
        await this.startFromListing(qm.get('listingId')!);
      } else if (qm.get('templateId')) {
        const t = this.templates().find((x) => x._id === qm.get('templateId'));
        if (t) await this.loadObjects(t.canvasJSON.objects);
      }

      this.resetHistory();
      const back = doc?.sides?.back;
      if (back?.canvasJSON?.objects?.length && sides.some((x) => x.key === 'back')) {
        this.store.back = { objects: JSON.stringify(back.canvasJSON.objects), history: [], redo: [] };
      }
      this.updateSideCounts();
      this.offerDraft(doc);
    } catch {
      this.fail('Không tải được trình thiết kế. Vui lòng thử lại.');
    } finally {
      this.loading.set(false);
    }
  }

  private fail(msg: string): void {
    this.fatal.set(msg);
  }

  private async findListing(id: string): Promise<Listing | undefined> {
    await firstValueFrom(this.marketLoaded$.pipe(filter(Boolean)));
    return this.market.getListing(id);
  }

  /** Dùng thiết kế mua từ Marketplace (C06 -> C10) */
  private async startFromListing(listingId: string): Promise<void> {
    const l = await this.findListing(listingId);
    if (!l || l.status !== 'APPROVED') {
      this.showToast('warn', 'Tin đăng không còn hiệu lực, bạn có thể tự thiết kế.');
      return;
    }
    this.listing.set(l);
    const src = this.designs.get(l.designId);
    if (src?.canvasJSON?.objects?.length) {
      await this.loadObjects(src.canvasJSON.objects);
    } else if (src?.previewUrl || l.watermarkUrl) {
      await this.addImageFromUrl(src?.previewUrl || l.watermarkUrl, false);
    }
  }

  // =====================================================================
  // Canvas: nền sản phẩm, vùng in, sự kiện
  // =====================================================================

  private sideDef(key: SideKey): SideDef {
    return this.sides().find((x) => x.key === key) ?? { key, label: '', area: this.area };
  }

  /** Ảnh phôi theo màu đang chọn + vùng in (px) của 1 mặt. Mặt sau dùng ảnh lật ngang (dữ liệu chưa có ảnh mặt sau). */
  private async loadBackground(key: SideKey): Promise<{ img?: FabricImage; areaPx: Box }> {
    const p = this.product();
    let box: Box = { x: 0, y: 0, w: STAGE, h: STAGE };
    let img: FabricImage | undefined;
    if (p) {
      const v = p.variants.find((x) => x.color === this.color() && x.imageUrl);
      try {
        img = await FabricImage.fromURL(this.ps.resolveImage(v?.imageUrl || p.img_display), { crossOrigin: 'anonymous' });
        const sc = Math.min(STAGE / img.width, STAGE / img.height);
        box = { x: (STAGE - img.width * sc) / 2, y: (STAGE - img.height * sc) / 2, w: img.width * sc, h: img.height * sc };
        img.set({
          originX: 'left',
          originY: 'top',
          left: box.x,
          top: box.y,
          scaleX: sc,
          scaleY: sc,
          flipX: key === 'back',
          selectable: false,
          evented: false,
        });
      } catch {
        img = undefined;
      }
    }
    const a = this.sideDef(key).area;
    return { img, areaPx: { x: box.x + a.x * box.w, y: box.y + a.y * box.h, w: a.width * box.w, h: a.height * box.h } };
  }

  private async renderBackground(): Promise<void> {
    if (!this.product()) return;
    const { img, areaPx } = await this.loadBackground(this.side());
    if (!img) this.showToast('warn', 'Không tải được ảnh sản phẩm, vẫn có thể thiết kế trong vùng in.');
    this.canvas.backgroundImage = img;
    this.areaPx = areaPx;
    this.canvas.requestRenderAll();
    this.checkBounds();
  }

  private bindCanvasEvents(): void {
    const c = this.canvas;
    // Viền vùng in vẽ đè sau mỗi lần render (không phải object, không bị xuất ra file)
    c.on('after:render', (e) => {
      if (this.exporting) return;
      const ctx = (e as { ctx?: CanvasRenderingContext2D }).ctx ?? c.getContext();
      const z = this.zoom();
      const b = this.areaPx;
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = this.outOfBounds() ? '#b22e4e' : '#8b57c4';
      ctx.strokeRect(b.x * z, b.y * z, b.w * z, b.h * z);
      ctx.setLineDash([]);
      ctx.font = '600 11px Inter, Arial, sans-serif';
      ctx.fillStyle = ctx.strokeStyle;
      const label = this.sides().length > 1 ? 'Vùng in · ' + this.sideDef(this.side()).label : 'Vùng in';
      ctx.fillText(label, b.x * z + 5, b.y * z + 14);
      ctx.restore();
    });

    const changed = () => {
      if (!this.restoring) this.zone.run(() => this.commit());
    };
    c.on('object:added', changed);
    c.on('object:removed', changed);
    c.on('object:modified', changed);
    c.on('text:changed', () => this.zone.run(() => this.refreshLayers()));

    const live = () => this.zone.run(() => {
      this.checkBounds();
      this.selTick.update((n) => n + 1);
    });
    c.on('object:moving', live);
    c.on('object:scaling', live);
    c.on('object:rotating', live);

    const sel = () => this.zone.run(() => {
      const active = c.getActiveObjects();
      this.selected.set(active.length === 1 ? active[0] : null);
      if (active.length === 1 && this.tab() !== 'layers') this.tab.set('design');
    });
    c.on('selection:created', sel);
    c.on('selection:updated', sel);
    c.on('selection:cleared', sel);
  }

  private objects(): FabricObject[] {
    return this.canvas.getObjects();
  }

  private snapshot(): string {
    return JSON.stringify(this.objects().map((o) => o.toObject(EXTRA_PROPS)));
  }

  private async loadObjects(objs: Record<string, unknown>[], replace = false): Promise<void> {
    this.restoring = true;
    try {
      if (replace) this.canvas.remove(...this.objects());
      const live = (await util.enlivenObjects(objs)) as FabricObject[];
      live.forEach((o) => this.canvas.add(o));
    } finally {
      this.restoring = false;
    }
    this.canvas.discardActiveObject();
    this.canvas.requestRenderAll();
    this.refreshLayers();
    this.checkBounds();
    this.updateSideCounts();
  }

  // =====================================================================
  // Lịch sử: undo / redo
  // =====================================================================

  private resetHistory(): void {
    this.history = [];
    this.redoStack = [];
    this.current = this.snapshot();
    this.dirty.set(false);
    this.syncHistoryButtons();
    this.refreshLayers();
  }

  private commit(): void {
    const next = this.snapshot();
    if (next === this.current) return;
    this.history.push(this.current);
    if (this.history.length > HISTORY_LIMIT) this.history.shift();
    this.redoStack = [];
    this.current = next;
    this.dirty.set(true);
    this.syncHistoryButtons();
    this.refreshLayers();
    this.checkBounds();
    this.updateSideCounts();
    this.selTick.update((n) => n + 1);
  }

  async undo(): Promise<void> {
    if (!this.history.length) return;
    this.redoStack.push(this.current);
    this.current = this.history.pop()!;
    await this.loadObjects(JSON.parse(this.current), true);
    this.dirty.set(true);
    this.syncHistoryButtons();
  }

  async redo(): Promise<void> {
    if (!this.redoStack.length) return;
    this.history.push(this.current);
    this.current = this.redoStack.pop()!;
    await this.loadObjects(JSON.parse(this.current), true);
    this.dirty.set(true);
    this.syncHistoryButtons();
  }

  private syncHistoryButtons(): void {
    this.canUndo.set(this.history.length > 0);
    this.canRedo.set(this.redoStack.length > 0);
  }

  // =====================================================================
  // Mặt trước / mặt sau
  // =====================================================================

  async switchSide(key: SideKey): Promise<void> {
    if (key === this.side() || this.loading()) return;
    this.stopDraw();
    this.shapeMenu.set(false);
    this.canvas.discardActiveObject();
    this.store[this.side()] = { objects: this.current, history: this.history, redo: this.redoStack };
    this.side.set(key);
    this.area = this.sideDef(key).area;
    await this.renderBackground();
    const st = this.store[key];
    this.history = st?.history ?? [];
    this.redoStack = st?.redo ?? [];
    this.current = st?.objects ?? '[]';
    await this.loadObjects(JSON.parse(this.current), true);
    this.syncHistoryButtons();
  }

  /** JSON objects của 1 mặt (mặt đang mở lấy trực tiếp từ canvas) */
  private objectsOf(key: SideKey): string {
    return key === this.side() ? this.snapshot() : this.store[key]?.objects ?? '[]';
  }

  private updateSideCounts(): void {
    const count = (k: SideKey) => (JSON.parse(this.objectsOf(k)) as unknown[]).length;
    this.sideCounts.set({ front: count('front'), back: this.sides().some((x) => x.key === 'back') ? count('back') : 0 });
  }

  // =====================================================================
  // Công cụ bên trái
  // =====================================================================

  pickImage(): void {
    this.stopDraw();
    this.fileInput.nativeElement.value = '';
    this.fileInput.nativeElement.click();
  }

  onFile(event: Event): void {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!UPLOAD_TYPES.includes(file.type)) return this.showToast('error', 'Chỉ nhận ảnh JPG, PNG hoặc WebP.');
    if (file.size > MAX_UPLOAD) return this.showToast('error', 'Ảnh vượt quá 5 MB.');
    const reader = new FileReader();
    reader.onload = () => void this.addImageFromUrl(reader.result as string, true);
    reader.onerror = () => this.showToast('error', 'Không đọc được file ảnh.');
    reader.readAsDataURL(file);
  }

  private async addImageFromUrl(url: string, checkDpi: boolean): Promise<void> {
    try {
      const img = await FabricImage.fromURL(url, { crossOrigin: 'anonymous' });
      const b = this.areaPx;
      const s = Math.min((b.w * 0.8) / img.width, (b.h * 0.8) / img.height);
      img.set({ scaleX: s, scaleY: s, left: b.x + (b.w - img.width * s) / 2, top: b.y + (b.h - img.height * s) / 2 });
      this.canvas.add(img);
      this.canvas.setActiveObject(img);
      this.canvas.requestRenderAll();
      // BR05: ảnh nhỏ hơn vùng in sẽ bị phóng to khi in -> mờ
      if (checkDpi && img.width < b.w * 1.5) {
        this.showToast('warn', 'Ảnh có độ phân giải thấp, bản in có thể bị mờ.');
      }
    } catch {
      this.showToast('error', 'Không tải được ảnh.');
    }
  }

  // ---------- Bút vẽ ----------

  toggleDraw(on = !this.drawing()): void {
    this.drawing.set(on);
    if (on) {
      const brush = new PencilBrush(this.canvas);
      brush.color = this.brushColor();
      brush.width = this.brushWidth();
      brush.decimate = 2;
      this.canvas.freeDrawingBrush = brush;
      this.canvas.discardActiveObject();
      this.tab.set('design');
    }
    this.canvas.isDrawingMode = on;
    this.canvas.requestRenderAll();
  }

  setBrush(key: 'color' | 'width', value: string | number): void {
    if (key === 'color') this.brushColor.set(String(value));
    else {
      const n = Number(value);
      if (!Number.isFinite(n)) return;
      this.brushWidth.set(Math.min(60, Math.max(1, n)));
    }
    const b = this.canvas.freeDrawingBrush;
    if (b) {
      b.color = this.brushColor();
      b.width = this.brushWidth();
    }
  }

  /** Thoát chế độ vẽ trước khi dùng công cụ khác */
  private stopDraw(): void {
    if (this.drawing()) this.toggleDraw(false);
  }

  addText(): void {
    this.stopDraw();
    const b = this.areaPx;
    const width = Math.min(b.w - 20, 240);
    const t = new Textbox('Nhập chữ', {
      left: b.x + (b.w - width) / 2,
      top: b.y + b.h / 2 - 18,
      width,
      fontSize: 30,
      fontFamily: 'Arial',
      fill: DARK_COLORS.includes(this.color()) ? '#ffffff' : '#2e2538',
      textAlign: 'center',
    });
    this.canvas.add(t);
    this.canvas.setActiveObject(t);
    this.canvas.requestRenderAll();
  }

  toggleShapeMenu(): void {
    this.stopDraw();
    this.shapeMenu.update((v) => !v);
  }

  /** Thêm hình khối (mọi hình là Path 100×100, đổi màu / co giãn tự do) */
  addShape(def: ShapeDef): void {
    this.stopDraw();
    this.shapeMenu.set(false);
    const b = this.areaPx;
    const shape = new Path(def.d, { fill: def.fill, strokeWidth: 0 });
    const size = Math.min(120, b.w * 0.5, b.h * 0.5);
    shape.scaleToWidth(size);
    if (shape.getScaledHeight() > size) shape.scaleToHeight(size);
    (shape as unknown as { name: string }).name = 'shape:' + def.key;
    shape.setPositionByOrigin(new Point(b.x + b.w / 2, b.y + b.h / 2), 'center', 'center');
    this.canvas.add(shape);
    this.canvas.setActiveObject(shape);
    this.canvas.requestRenderAll();
  }

  private nameOf(o: FabricObject): string {
    return (o as unknown as { name?: string }).name ?? '';
  }

  private isShape(o: FabricObject): boolean {
    return o instanceof Rect || o instanceof Circle || this.nameOf(o).startsWith('shape:');
  }

  deleteSelected(): void {
    const active = this.canvas.getActiveObjects();
    if (!active.length) return;
    this.restoring = true;
    this.canvas.remove(...active);
    this.restoring = false;
    this.canvas.discardActiveObject();
    this.canvas.requestRenderAll();
    this.commit();
  }

  clearAll(): void {
    if (!this.objects().length) return;
    if (!confirm('Xóa toàn bộ thiết kế trên sản phẩm?')) return;
    this.restoring = true;
    this.canvas.remove(...this.objects());
    this.restoring = false;
    this.canvas.discardActiveObject();
    this.canvas.requestRenderAll();
    this.commit();
  }

  // =====================================================================
  // Panel thuộc tính
  // =====================================================================

  setProp(key: 'left' | 'top' | 'angle' | 'opacity' | 'fill', raw: string | number): void {
    const o = this.selected();
    if (!o) return;
    let value: string | number = raw;
    if (key !== 'fill') {
      value = Number(raw);
      if (!Number.isFinite(value)) return;
      if (key === 'opacity') value = Math.min(100, Math.max(0, value)) / 100;
    }
    if (key === 'angle') o.rotate(value as number);
    else o.set(key, value);
    o.setCoords();
    this.canvas.requestRenderAll();
    this.commit();
  }

  /** Đổi màu / độ dày của nét vẽ đã có */
  setStroke(key: 'stroke' | 'strokeWidth', value: string | number): void {
    const o = this.selected();
    if (!(o instanceof Path)) return;
    if (key === 'strokeWidth') {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 1 || n > 60) return;
      o.set('strokeWidth', n);
    } else o.set('stroke', String(value));
    o.setCoords();
    this.canvas.requestRenderAll();
    this.commit();
  }

  setText(key: 'fontFamily' | 'fontSize' | 'fill' | 'textAlign', value: string | number): void {
    const o = this.selected();
    if (!(o instanceof Textbox)) return;
    if (key === 'fontSize') {
      const n = Number(value);
      if (!Number.isFinite(n) || n < 8 || n > 200) return;
      value = n;
    }
    o.set(key, value);
    o.setCoords();
    this.canvas.requestRenderAll();
    this.commit();
  }

  toggleText(style: 'bold' | 'italic' | 'underline'): void {
    const o = this.selected();
    if (!(o instanceof Textbox)) return;
    if (style === 'bold') o.set('fontWeight', o.fontWeight === 'bold' ? 'normal' : 'bold');
    if (style === 'italic') o.set('fontStyle', o.fontStyle === 'italic' ? 'normal' : 'italic');
    if (style === 'underline') o.set('underline', !o.underline);
    this.canvas.requestRenderAll();
    this.commit();
  }

  centerSelected(): void {
    const o = this.selected();
    if (!o) return;
    const b = this.areaPx;
    o.setPositionByOrigin(new Point(b.x + b.w / 2, b.y + b.h / 2), 'center', 'center');
    o.setCoords();
    this.canvas.requestRenderAll();
    this.commit();
  }

  // =====================================================================
  // Layers
  // =====================================================================

  private refreshLayers(): void {
    const label = (o: FabricObject): [string, string] => {
      if (o instanceof Textbox) return ['T', 'Chữ: ' + (o.text || '').slice(0, 18)];
      if (o instanceof FabricImage) return ['🖼', 'Ảnh'];
      const shape = SHAPES.find((x) => 'shape:' + x.key === this.nameOf(o));
      if (shape) return ['◆', shape.label];
      if (o instanceof Path) return ['✎', 'Nét vẽ'];
      if (o instanceof Circle) return ['○', 'Hình tròn'];
      if (o instanceof Rect) return ['▭', 'Hình chữ nhật'];
      return ['◆', 'Đối tượng'];
    };
    this.layers.set(
      [...this.objects()].reverse().map((obj) => {
        const [icon, text] = label(obj);
        return { obj, icon, label: text };
      }),
    );
  }

  selectLayer(o: FabricObject): void {
    this.canvas.setActiveObject(o);
    this.canvas.requestRenderAll();
    this.selected.set(o);
  }

  moveLayer(o: FabricObject, dir: 'up' | 'down'): void {
    if (dir === 'up') this.canvas.bringObjectForward(o);
    else this.canvas.sendObjectBackwards(o);
    this.canvas.requestRenderAll();
    this.commit();
  }

  toggleVisible(o: FabricObject): void {
    o.set('visible', !o.visible);
    if (!o.visible && this.canvas.getActiveObject() === o) this.canvas.discardActiveObject();
    this.canvas.requestRenderAll();
    this.commit();
  }

  removeLayer(o: FabricObject): void {
    this.canvas.remove(o);
    this.canvas.requestRenderAll();
  }

  // =====================================================================
  // Templates
  // =====================================================================

  async applyTemplate(t: DesignTemplate): Promise<void> {
    if (this.objects().length && !confirm('Thêm mẫu "' + t.name + '" vào thiết kế hiện tại?')) return;
    await this.loadObjects(t.canvasJSON.objects);
    this.commit();
    this.showToast('ok', 'Đã thêm mẫu ' + t.name);
  }

  // =====================================================================
  // Sản phẩm: màu / size / số lượng
  // =====================================================================

  async changeColor(c: string): Promise<void> {
    if (c === this.color()) return;
    this.color.set(c);
    if (this.size() && !this.sizes().includes(this.size()!)) this.size.set(null);
    await this.renderBackground();
    this.dirty.set(true);
  }

  sizeStock(s: string): number {
    const p = this.product();
    return p ? this.ps.findVariant(p, this.color(), s)?.stock ?? 0 : 0;
  }

  changeSize(s: string | null): void {
    this.size.set(s);
    this.dirty.set(true);
    if (this.qty() > this.stock() && this.stock() > 0) this.qty.set(this.stock());
  }

  changeQty(delta: number): void {
    if (this.mode() === 'SAMPLE_EDIT') return;
    const max = Math.max(1, this.stock());
    this.qty.set(Math.min(max, Math.max(1, this.qty() + delta)));
  }

  // =====================================================================
  // Zoom
  // =====================================================================

  setZoom(z: number): void {
    const v = Math.round(Math.min(2, Math.max(0.5, z)) * 100) / 100;
    this.zoom.set(v);
    this.canvas.setZoom(v);
    this.canvas.setDimensions({ width: STAGE * v, height: STAGE * v });
    this.canvas.requestRenderAll();
  }

  // =====================================================================
  // Kiểm tra vùng in
  // =====================================================================

  private outside(o: FabricObject, b: Box = this.areaPx): boolean {
    if (!o.visible) return false;
    o.setCoords();
    const pts = o.getCoords();
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);
    const tol = 1;
    return (
      Math.min(...xs) < b.x - tol || Math.min(...ys) < b.y - tol || Math.max(...xs) > b.x + b.w + tol || Math.max(...ys) > b.y + b.h + tol
    );
  }

  private checkBounds(): void {
    this.outOfBounds.set(this.objects().some((o) => this.outside(o)));
  }

  // =====================================================================
  // Xuất ảnh
  // =====================================================================

  /** Chạy fn ở zoom 100%, không vẽ viền vùng in, không viền chọn */
  private atExportScale<T>(fn: () => T): T {
    const z = this.zoom();
    const active = this.canvas.getActiveObject();
    this.exporting = true;
    this.canvas.discardActiveObject();
    if (z !== 1) {
      this.canvas.setZoom(1);
      this.canvas.setDimensions({ width: STAGE, height: STAGE });
    }
    try {
      return fn();
    } finally {
      if (z !== 1) {
        this.canvas.setZoom(z);
        this.canvas.setDimensions({ width: STAGE * z, height: STAGE * z });
      }
      this.exporting = false;
      if (active) this.canvas.setActiveObject(active);
      this.canvas.requestRenderAll();
    }
  }

  /** Ảnh sản phẩm + thiết kế (xem trước, không phải file in) */
  private previewImage(multiplier = 1): string {
    return this.atExportScale(() => this.canvas.toDataURL({ format: 'jpeg', quality: 0.85, multiplier }));
  }

  /** File in: chỉ phần vùng in, nền trong suốt */
  private printFile(): string {
    return this.atExportScale(() => {
      const bg = this.canvas.backgroundImage;
      const bgc = this.canvas.backgroundColor;
      this.canvas.backgroundImage = undefined;
      this.canvas.backgroundColor = '';
      try {
        const b = this.areaPx;
        return this.canvas.toDataURL({ format: 'png', left: b.x, top: b.y, width: b.w, height: b.h, multiplier: 2 });
      } finally {
        this.canvas.backgroundImage = bg;
        this.canvas.backgroundColor = bgc;
      }
    });
  }

  /** Xuất 1 mặt: mặt đang mở dùng canvas thật, mặt kia dựng trên canvas ẩn */
  private async exportSide(key: SideKey, previewScale = 0.6): Promise<SideExport | null> {
    const objects = JSON.parse(this.objectsOf(key)) as Record<string, unknown>[];
    if (!objects.length) return null;
    if (key === this.side()) {
      return { objects, preview: this.previewImage(previewScale), print: this.printFile(), outOfBounds: this.outOfBounds() };
    }
    const { img, areaPx } = await this.loadBackground(key);
    const sc = new StaticCanvas(document.createElement('canvas'), { width: STAGE, height: STAGE, backgroundColor: '#ffffff' });
    try {
      if (img) sc.backgroundImage = img;
      const live = (await util.enlivenObjects(objects)) as FabricObject[];
      live.forEach((o) => sc.add(o));
      const outOfBounds = live.some((o) => this.outside(o, areaPx));
      sc.renderAll();
      const preview = sc.toDataURL({ format: 'jpeg', quality: 0.85, multiplier: previewScale });
      sc.backgroundImage = undefined;
      sc.backgroundColor = '';
      sc.renderAll();
      const print = sc.toDataURL({ format: 'png', left: areaPx.x, top: areaPx.y, width: areaPx.w, height: areaPx.h, multiplier: 2 });
      return { objects, preview, print, outOfBounds };
    } finally {
      void sc.dispose();
    }
  }

  async openPreview(): Promise<void> {
    const list: { label: string; src: string }[] = [];
    for (const d of this.sides()) {
      if (d.key !== this.side() && !this.sideCounts()[d.key]) continue;
      const ex = await this.exportSide(d.key, 1.2);
      list.push({ label: d.label, src: ex?.preview ?? this.previewImage(1.2) });
    }
    this.preview.set(list);
  }

  // =====================================================================
  // Lưu / thêm giỏ / in lại / đăng bán
  // =====================================================================

  /** Kiểm tra trước khi lưu hoặc gửi; trả về thông báo lỗi nếu chưa hợp lệ */
  private validate(): string {
    if (!this.sideCounts().front && !this.sideCounts().back) return 'Thiết kế đang trống. Hãy thêm ảnh hoặc chữ.';
    if (this.outOfBounds()) {
      const where = this.sides().length > 1 ? ' (' + this.sideDef(this.side()).label.toLowerCase() + ')' : '';
      return 'Có đối tượng nằm ngoài vùng in' + where + '. Hãy kéo vào trong khung nét đứt.';
    }
    return '';
  }

  async save(silent = false): Promise<DesignDoc | null> {
    const err = this.validate();
    if (err) {
      this.showToast('error', err);
      return null;
    }
    const user = this.auth.user();
    const p = this.product();
    if (!user || !p || this.busy()) return null;
    this.busy.set(true);
    try {
      const front = await this.exportSide('front');
      const back = this.sides().some((x) => x.key === 'back') ? await this.exportSide('back') : null;
      if (front?.outOfBounds || back?.outOfBounds) {
        this.showToast('error', `${front?.outOfBounds ? 'Mặt trước' : 'Mặt sau'} có đối tượng nằm ngoài vùng in.`);
        return null;
      }
      const canvasOf = (objects: Record<string, unknown>[]): CanvasData => ({
        version: '6.7.1',
        width: STAGE,
        height: STAGE,
        background: 'transparent',
        objects,
      });
      const now = new Date().toISOString();
      const id = this.designId() ?? this.designs.newId();
      const existing = this.designs.get(id);
      const doc: DesignDoc = {
        _id: id,
        userId: user._id,
        productId: p._id,
        listingId: existing?.listingId ?? this.listing()?._id ?? null,
        canvasJSON: canvasOf(front?.objects ?? []),
        // ảnh đại diện: mặt trước, nếu chỉ in mặt sau thì lấy mặt sau
        previewUrl: front?.preview ?? back?.preview ?? '',
        printFileUrl: front?.print ?? null,
        sides: back ? { back: { canvasJSON: canvasOf(back.objects), previewUrl: back.preview, printFileUrl: back.print } } : undefined,
        color: this.color(),
        size: this.size(),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      if (!this.designs.save(doc)) {
        this.showToast('error', 'Bộ nhớ trình duyệt đã đầy, không lưu được. Hãy dùng ảnh nhỏ hơn.');
        return null;
      }
      if (!this.designId()) {
        this.designId.set(id);
        if (this.mode() === 'NEW') {
          this.mode.set('EDIT');
          this.location.replaceState('/editor/designs/' + id);
        }
      }
      this.dirty.set(false);
      this.clearDraft();
      if (!silent) this.showToast('ok', 'Đã lưu thiết kế vào "Thiết kế của tôi".');
      return doc;
    } finally {
      this.busy.set(false);
    }
  }

  /** Bấm "Thêm vào giỏ": kiểm tra rồi mở hộp xác nhận */
  askAddToCart(): void {
    const err = this.validate();
    if (err) return this.showToast('error', err);
    if (!this.variant()) {
      this.tab.set('product');
      return this.showToast('error', 'Vui lòng chọn kích thước trước khi thêm vào giỏ.');
    }
    if (this.stock() < 1) return this.showToast('error', 'Biến thể này đã hết hàng, hãy chọn màu/size khác.');
    this.preview.set(null);
    this.confirmCart.set(true);
  }

  async addToCart(): Promise<void> {
    const p = this.product();
    const v = this.variant();
    if (!p || !v) return;
    const doc = await this.save(true);
    if (!doc) return this.confirmCart.set(false);
    const ok = this.cart.addDesigned(p, v, this.qty(), {
      designId: doc._id,
      previewUrl: doc.previewUrl,
      listingId: doc.listingId,
      listingTitle: this.listing()?.title,
      designFee: this.designFee(),
    });
    this.confirmCart.set(false);
    if (!ok) return this.showToast('error', `Kho chỉ còn ${v.stock} sản phẩm.`);
    void this.router.navigate(['/cart']);
  }

  async requestReprint(): Promise<void> {
    const item = this.orderItem();
    if (!item) return;
    const fee = this.reprintFee();
    const msg = fee
      ? `Đây là lần chỉnh sửa thứ 2 trở đi, phí in lại mẫu là ${this.ps.formatPrice(fee)} (thanh toán QR 10 phút tại trang đơn hàng). Tiếp tục?`
      : 'Gửi thiết kế đã sửa để in lại mẫu (lần đầu miễn phí)?';
    if (!confirm(msg)) return;
    const doc = await this.save(true);
    if (!doc) return;
    const ok = this.designs.requestReprint({
      _id: 'rpt_' + Date.now().toString(36),
      orderId: this.orderId(),
      orderItemId: item.orderItemId,
      designId: doc._id,
      printFileUrl: doc.printFileUrl ?? '',
      fee,
      status: fee ? 'PENDING_PAYMENT' : 'REQUESTED',
      createdAt: new Date().toISOString(),
    });
    if (!ok) return this.showToast('error', 'Không gửi được yêu cầu, bộ nhớ trình duyệt đã đầy.');
    void this.router.navigate(['/account/orders', this.orderId()], { queryParams: { reprint: 'sent' } });
  }

  async publish(): Promise<void> {
    const doc = await this.save(true);
    if (!doc) return;
    void this.router.navigate(['/market/my-listings/new'], { queryParams: { designId: doc._id } });
  }

  back(): void {
    const p = this.product();
    if (this.mode() === 'SAMPLE_EDIT') void this.router.navigate(['/account/orders', this.orderId()]);
    else if (this.mode() === 'EDIT') void this.router.navigate(['/account/designs']);
    else if (p) void this.router.navigate(['/products', p.slug]);
    else void this.router.navigate(['/products']);
  }

  // =====================================================================
  // Nháp tự động (30 giây) + rời trang khi chưa lưu
  // =====================================================================

  private draftKey(): string {
    if (this.mode() === 'SAMPLE_EDIT') return `printify_editor_draft:${this.orderId()}:${this.orderItem()?.orderItemId}`;
    return `printify_editor_draft:${this.designId() ?? 'new:' + (this.product()?._id ?? '')}`;
  }

  private autosaveDraft(): void {
    if (!this.dirty() || !this.product()) return;
    const d: Draft = {
      sides: { front: this.objectsOf('front'), back: this.objectsOf('back') },
      color: this.color(),
      size: this.size(),
      savedAt: new Date().toISOString(),
    };
    try {
      localStorage.setItem(this.draftKey(), JSON.stringify(d));
    } catch {
      /* đầy bộ nhớ: bỏ qua nháp */
    }
  }

  private offerDraft(doc?: DesignDoc): void {
    try {
      const raw = localStorage.getItem(this.draftKey());
      if (!raw) return;
      const d = JSON.parse(raw) as Draft;
      if (doc?.updatedAt && d.savedAt <= doc.updatedAt) return this.clearDraft();
      if (!d.sides) return this.clearDraft(); // nháp định dạng cũ
      const changed = d.sides.front !== this.objectsOf('front') || (d.sides.back ?? '[]') !== this.objectsOf('back');
      if (changed) this.draftOffer.set(d);
    } catch {
      /* bỏ qua */
    }
  }

  async restoreDraft(): Promise<void> {
    const d = this.draftOffer();
    this.draftOffer.set(null);
    if (!d) return;
    if (d.color !== this.color()) {
      this.color.set(d.color);
      await this.renderBackground();
    }
    this.size.set(d.size);
    if (this.side() !== 'front') await this.switchSide('front');
    this.store.back = { objects: d.sides.back ?? '[]', history: [], redo: [] };
    await this.loadObjects(JSON.parse(d.sides.front ?? '[]'), true);
    this.commit();
    this.dirty.set(true);
  }

  discardDraft(): void {
    this.draftOffer.set(null);
    this.clearDraft();
  }

  private clearDraft(): void {
    try {
      localStorage.removeItem(this.draftKey());
    } catch {
      /* bỏ qua */
    }
  }

  /** CanDeactivate: hộp thoại 3 lựa chọn khi còn thay đổi chưa lưu */
  canLeave(): boolean | Promise<boolean> {
    if (!this.dirty() || this.fatal()) return true;
    this.leavePrompt.set(true);
    return new Promise<boolean>((resolve) => (this.leaveResolve = resolve));
  }

  async leave(choice: 'save' | 'discard' | 'stay'): Promise<void> {
    this.leavePrompt.set(false);
    if (choice === 'save' && !(await this.save(true))) return this.leaveResolve?.(false);
    if (choice === 'discard') {
      this.dirty.set(false);
      this.clearDraft();
    }
    this.leaveResolve?.(choice !== 'stay');
    this.leaveResolve = undefined;
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(e: BeforeUnloadEvent): void {
    if (this.dirty()) {
      this.autosaveDraft();
      e.preventDefault();
    }
  }

  // =====================================================================
  // Phím tắt
  // =====================================================================

  @HostListener('document:keydown', ['$event'])
  onKey(e: KeyboardEvent): void {
    const target = e.target as HTMLElement;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
    if ((this.canvas?.getActiveObject() as Textbox | undefined)?.isEditing) return;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (mod && key === 'z' && !e.shiftKey) {
      e.preventDefault();
      void this.undo();
    } else if (mod && (key === 'y' || (key === 'z' && e.shiftKey))) {
      e.preventDefault();
      void this.redo();
    } else if (mod && key === 's') {
      e.preventDefault();
      if (this.mode() !== 'SAMPLE_EDIT') void this.save();
    } else if (key === 'delete' || key === 'backspace') {
      if (this.canvas.getActiveObjects().length) {
        e.preventDefault();
        this.deleteSelected();
      }
    } else if (key === 'b' && !mod) {
      this.toggleDraw();
    } else if (key === 'escape') {
      this.stopDraw();
      this.shapeMenu.set(false);
      this.canvas.discardActiveObject();
      this.canvas.requestRenderAll();
      this.preview.set(null);
    }
  }

  // =====================================================================

  showToast(type: 'ok' | 'error' | 'warn', text: string): void {
    clearTimeout(this.toastTimer);
    this.toast.set({ type, text });
    this.toastTimer = setTimeout(() => this.toast.set(null), 3500);
  }
}
