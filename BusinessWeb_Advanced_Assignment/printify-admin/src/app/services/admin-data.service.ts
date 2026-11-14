import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { ToastService } from '../shared/toast.service';
import {
  AuditLog, CopyrightReport, Design, DesignSale, InventoryMovement, Listing, Order, OrderStatus, PrintArea, Product,
  ProductVariant, PublicUser, SurveyQuestion, SurveyResponse,
} from '../models/admin.models';
import { AdminAuthService } from './admin-auth.service';

/** GET /api/admin/data */
interface AdminData {
  products: Product[]; orders: Order[]; listings: Listing[]; designs: Design[]; designSales: DesignSale[]; users: PublicUser[];
  reports: CopyrightReport[]; movements: InventoryMovement[]; surveyQuestions: SurveyQuestion[]; surveyResponses: SurveyResponse[]; auditLogs: AuditLog[];
}

export type ActionResult = { ok: true; message: string } | { ok: false; message: string };

/**
 * Nguồn dữ liệu của Admin.
 * - Mọi thao tác đi qua các hàm bên dưới: kiểm tra trạng thái hiện tại, áp đúng luật nghiệp vụ, ghi auditLogs.
 * - Đọc GET /api/admin/data; mỗi thao tác gửi /api/admin/... (server là nơi quyết định cuối cùng).
 */
@Injectable({ providedIn: 'root' })
export class AdminDataService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AdminAuthService);
  private readonly toast = inject(ToastService);
  private pendingUrl: ['POST' | 'PUT' | 'PATCH', string, unknown] | null = null;

  readonly products = signal<Product[]>([]);
  readonly orders = signal<Order[]>([]);
  readonly listings = signal<Listing[]>([]);
  readonly designs = signal<Design[]>([]);
  readonly designSales = signal<DesignSale[]>([]);
  readonly users = signal<PublicUser[]>([]);
  readonly reports = signal<CopyrightReport[]>([]);
  readonly movements = signal<InventoryMovement[]>([]);
  readonly surveyQuestions = signal<SurveyQuestion[]>([]);
  readonly surveyResponses = signal<SurveyResponse[]>([]);
  readonly auditLogs = signal<AuditLog[]>([]);
  readonly printAreas = signal<Record<string, PrintArea>>({});
  readonly loaded = signal(false);
  readonly error = signal('');

  private readonly userMap = computed(() => new Map(this.users().map((u) => [u._id, u])));
  private readonly productMap = computed(() => new Map(this.products().map((p) => [p._id, p])));
  private readonly designMap = computed(() => new Map(this.designs().map((d) => [d._id, d])));

  constructor() {
    // tải khi đã đăng nhập (đổi tài khoản -> tải lại)
    effect(() => {
      if (this.auth.user()?._id) untracked(() => this.load());
    });
  }

  // ======================================================== đọc

  userName(id: string | null | undefined): string {
    if (!id) return '—';
    if (id === 'SYSTEM') return 'Hệ thống';
    return this.userMap().get(id)?.name ?? this.auth.adminName(id) ?? id;
  }

  product(id: string): Product | undefined {
    return this.productMap().get(id);
  }

  design(id: string | null | undefined): Design | undefined {
    return id ? this.designMap().get(id) : undefined;
  }

  order(id: string): Order | undefined {
    return this.orders().find((o) => o._id === id);
  }

  listing(id: string): Listing | undefined {
    return this.listings().find((l) => l._id === id);
  }

  totalStock(p: Product): number {
    return p.variants.reduce((s, v) => s + (v.stock || 0), 0);
  }

  stockLevel(p: Product): 'out' | 'low' | 'ok' {
    if (p.variants.every((v) => v.stock <= 0)) return 'out';
    return p.variants.some((v) => v.stock <= p.lowStockThreshold) ? 'low' : 'ok';
  }

  printAreaOf(p: Product | undefined): PrintArea | undefined {
    if (!p) return undefined;
    return this.printAreas()[p._id] ?? p.printArea ?? undefined;
  }

  /** "images/products/a.png" -> "/dataset/images/products/a.png"; "/uploads/.." giữ nguyên */
  img(path: string | null | undefined): string {
    if (!path) return '/dataset/images/products/placeholder.svg';
    if (/^(https?:|data:|blob:)/.test(path)) return path;
    if (path.startsWith('/images/')) return '/dataset' + path;
    if (path.startsWith('/')) return path;
    return '/dataset/' + path.replace(/^\.?\/+/, '');
  }

  /** Ảnh của 1 dòng đơn: ảnh thiết kế nếu có, không thì ảnh biến thể */
  itemImage(item: { designId: string | null; productId: string; variantId: string; imageUrl?: string }): string {
    const d = this.design(item.designId);
    if (d?.previewUrl) return this.img(d.previewUrl);
    const p = this.product(item.productId);
    const v = p?.variants.find((x) => x._id === item.variantId);
    return this.img(item.imageUrl || v?.imageUrl || p?.img_display);
  }

  variantOf(item: { productId: string; variantId: string }): ProductVariant | undefined {
    return this.product(item.productId)?.variants.find((v) => v._id === item.variantId);
  }

  // ======================================================== đơn hàng

  /** Staff xác nhận đã nhận tiền: PAID + trừ kho đúng 1 lần (thiếu hàng thì chặn, Staff phải từ chối) */
  approvePayment(orderId: string): ActionResult {
    const o = this.order(orderId);
    if (!o) return this.fail('Không tìm thấy đơn.');
    if (o.orderStatus !== 'PENDING_STAFF_CONFIRMATION' || o.paymentStatus !== 'WAITING_STAFF') {
      return this.fail('Đơn không còn ở trạng thái chờ xác nhận thanh toán. Tải lại để xem trạng thái mới.');
    }
    // kiểm tra kho trước, đủ hết mới trừ (không trừ nửa chừng)
    const need = new Map<string, number>();
    for (const it of o.items) need.set(it.variantId, (need.get(it.variantId) ?? 0) + it.qty);
    for (const it of o.items) {
      const v = this.variantOf(it);
      if (!v || v.stock < (need.get(it.variantId) ?? 0)) {
        return this.fail(`Không đủ hàng: ${it.productName} (${v?.color ?? ''} ${v?.size ?? ''}) còn ${v?.stock ?? 0}, đơn cần ${need.get(it.variantId)}. Hãy từ chối thanh toán với lý do hết hàng.`);
      }
    }
    if (!o.stockDeductedAt) {
      for (const it of o.items) this.moveStock(it.productId, it.variantId, -it.qty, 'ORDER_DEDUCTION', `deduct:${o._id}:${it.orderItemId}`, o._id);
    }
    const now = this.now();
    const hasDesign = o.items.some((i) => !!i.designId);
    const next: OrderStatus = hasDesign ? 'DESIGN_REVIEW' : 'PRINT_CONFIRMED';
    this.patchOrder(o._id, (x) => ({
      ...x,
      paymentStatus: 'PAID',
      paidAt: now,
      stockDeductedAt: x.stockDeductedAt ?? now,
      orderStatus: next,
      items: x.items.map((i) => (i.designId ? { ...i, designReview: { status: 'PENDING', reason: null, reviewedAt: null } } : i)),
      timeline: [...x.timeline,
        { status: 'PAID', occurredAt: now, actorId: this.actor(), note: 'Xác nhận đã nhận tiền, trừ kho' },
        { status: next, occurredAt: now, actorId: 'SYSTEM', note: hasDesign ? 'Chờ PrintiFy kiểm tra mẫu in' : 'Đơn không có thiết kế riêng, chuyển in' }],
    }));
    this.audit('PAYMENT_APPROVE', 'order', o._id, 'Xác nhận thanh toán, trừ kho');
    this.send('POST', `/api/admin/orders/${orderId}/payment-review`, { decision: 'APPROVE' });
    return this.done('Đã xác nhận thanh toán và trừ kho.');
  }

  /** Từ chối thanh toán: hủy đơn. Chưa từng trừ kho nên không có gì để hoàn */
  rejectPayment(orderId: string, reason: string): ActionResult {
    const o = this.order(orderId);
    if (!o) return this.fail('Không tìm thấy đơn.');
    if (o.paymentStatus !== 'WAITING_STAFF') return this.fail('Đơn không còn chờ xác nhận thanh toán.');
    if (!reason.trim()) return this.fail('Nhập lý do từ chối.');
    const now = this.now();
    this.patchOrder(o._id, (x) => ({
      ...x, paymentStatus: 'REJECTED', orderStatus: 'CANCELLED', paymentRejectedReason: reason.trim(), cancelReason: reason.trim(), cancelledAt: now,
      timeline: [...x.timeline, { status: 'CANCELLED', occurredAt: now, actorId: this.actor(), note: 'Từ chối thanh toán: ' + reason.trim() }],
    }));
    this.audit('PAYMENT_REJECT', 'order', o._id, reason.trim());
    this.send('POST', `/api/admin/orders/${orderId}/payment-review`, { decision: 'REJECT', reason: reason.trim() });
    return this.done('Đã từ chối thanh toán, đơn chuyển sang Đã hủy.');
  }

  /** Kiểm tra mẫu in từng dòng. Mọi dòng đạt (hoặc khách chấp nhận rủi ro) -> in mẫu */
  reviewDesign(orderId: string, itemId: string, decision: 'APPROVE' | 'REJECT', reason = ''): ActionResult {
    const o = this.order(orderId);
    if (!o || o.orderStatus !== 'DESIGN_REVIEW') return this.fail('Đơn không ở bước kiểm tra mẫu in.');
    if (decision === 'REJECT' && !reason.trim()) return this.fail('Nhập lý do cần sửa để khách biết sửa chỗ nào.');
    const now = this.now();
    let items = o.items.map((i) => i.orderItemId !== itemId ? i : {
      ...i, designReview: { ...(i.designReview ?? {}), status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED', reason: decision === 'APPROVE' ? null : reason.trim(), reviewedAt: now } as Order['items'][number]['designReview'],
    });
    const designItems = items.filter((i) => i.designId);
    const allOk = designItems.every((i) => i.designReview?.status === 'APPROVED' || i.designReview?.status === 'ACCEPTED_RISK');
    const timeline = [...o.timeline];
    let status: OrderStatus = o.orderStatus;
    if (allOk) {
      status = 'SAMPLE_PRINTING';
      items = items.map((i) => (i.requiresSample ? { ...i, sampleStatus: 'WAITING_SAMPLE' } : i));
      timeline.push({ status, occurredAt: now, actorId: this.actor(), note: 'Mẫu in đạt, chuyển in mẫu thử' });
    } else if (decision === 'REJECT') {
      timeline.push({ status: 'DESIGN_REVIEW', occurredAt: now, actorId: this.actor(), note: 'Mẫu cần chỉnh sửa: ' + reason.trim() });
    }
    this.patchOrder(o._id, (x) => ({ ...x, items, orderStatus: status, timeline }));
    this.audit(decision === 'APPROVE' ? 'DESIGN_APPROVE' : 'DESIGN_REJECT', 'orderItem', itemId, reason.trim() || 'Đạt');
    this.send('POST', `/api/admin/orders/${orderId}/items/${itemId}/design-review`, { decision, reason: reason.trim() });
    return this.done(allOk ? 'Tất cả mẫu đã đạt, đơn chuyển sang In mẫu thử.' : decision === 'APPROVE' ? 'Đã duyệt dòng này.' : 'Đã gửi yêu cầu sửa cho khách.');
  }

  /** Bắt đầu in mẫu: từ đây khách không hủy được nữa */
  startSample(orderId: string): ActionResult {
    const o = this.order(orderId);
    if (!o || o.orderStatus !== 'SAMPLE_PRINTING') return this.fail('Đơn không ở bước in mẫu.');
    if (o.firstSampleStartedAt) return this.fail('Đã bắt đầu in mẫu rồi.');
    const now = this.now();
    this.patchOrder(o._id, (x) => ({ ...x, firstSampleStartedAt: now, timeline: [...x.timeline, { status: 'SAMPLE_PRINTING', occurredAt: now, actorId: this.actor(), note: 'Bắt đầu in mẫu – khóa hủy đơn' }] }));
    this.audit('SAMPLE_START', 'order', o._id, 'Bắt đầu in mẫu');
    this.send('POST', `/api/admin/orders/${orderId}/sample-start`, {});
    return this.done('Đã bắt đầu in mẫu. Khách không thể hủy đơn từ bây giờ.');
  }

  /** Hoàn tất mẫu: bắt buộc có ảnh mẫu, chuyển khách duyệt (Staff không duyệt thay khách) */
  completeSample(orderId: string, photoUrl: string): ActionResult {
    const o = this.order(orderId);
    if (!o || o.orderStatus !== 'SAMPLE_PRINTING') return this.fail('Đơn không ở bước in mẫu.');
    if (!o.firstSampleStartedAt) return this.fail('Bấm “Bắt đầu in mẫu” trước.');
    if (!photoUrl.trim()) return this.fail('Hoàn tất mẫu phải có ảnh chụp mẫu in.');
    const now = this.now();
    this.patchOrder(o._id, (x) => ({
      ...x, orderStatus: 'SAMPLE_REVIEW',
      items: x.items.map((i) => (i.requiresSample ? { ...i, sampleStatus: 'SAMPLE_READY', samplePhotoUrl: photoUrl.trim() } : i)),
      timeline: [...x.timeline, { status: 'SAMPLE_REVIEW', occurredAt: now, actorId: this.actor(), note: 'In mẫu xong, gửi ảnh cho khách duyệt' }],
    }));
    this.audit('SAMPLE_COMPLETE', 'order', o._id, photoUrl.trim());
    this.send('POST', `/api/admin/orders/${orderId}/sample-complete`, { photoUrl: photoUrl.trim() });
    return this.done('Đã gửi ảnh mẫu, chờ khách duyệt.');
  }

  completePrint(orderId: string): ActionResult {
    this.pendingUrl = ['POST', `/api/admin/orders/${orderId}/print-complete`, {}];
    return this.step(orderId, 'PRINT_CONFIRMED', 'PRINT_COMPLETED', { printCompletedAt: this.now() }, 'In xong, đóng gói', 'PRINT_COMPLETE');
  }

  ship(orderId: string, trackingCode: string): ActionResult {
    if (!trackingCode.trim()) return this.fail('Nhập mã vận đơn.');
    this.pendingUrl = ['POST', `/api/admin/orders/${orderId}/ship`, { trackingCode: trackingCode.trim() }];
    return this.step(orderId, 'PRINT_COMPLETED', 'SHIPPING', { shippedAt: this.now(), trackingCode: trackingCode.trim() }, 'Bàn giao vận chuyển, mã ' + trackingCode.trim(), 'SHIP');
  }

  deliver(orderId: string): ActionResult {
    this.pendingUrl = ['POST', `/api/admin/orders/${orderId}/deliver`, {}];
    return this.step(orderId, 'SHIPPING', 'COMPLETED', { deliveredAt: this.now() }, 'Đã giao hàng thành công', 'DELIVER');
  }

  /** Duyệt yêu cầu hủy: đã PAID (đã trừ kho) thì hoàn kho đúng 1 lần */
  resolveCancel(orderId: string, decision: 'APPROVE' | 'REJECT', note: string): ActionResult {
    const o = this.order(orderId);
    if (!o || o.cancelRequest?.status !== 'PENDING') return this.fail('Không có yêu cầu hủy đang chờ.');
    if (decision === 'APPROVE' && o.firstSampleStartedAt) return this.fail('Đơn đã bắt đầu in mẫu, không thể hủy.');
    if (decision === 'REJECT' && !note.trim()) return this.fail('Nhập lý do từ chối để báo khách.');
    const now = this.now();
    if (decision === 'REJECT') {
      this.patchOrder(o._id, (x) => ({ ...x, cancelRequest: { ...x.cancelRequest!, status: 'REJECTED', resolvedAt: now, resolveNote: note.trim() },
        timeline: [...x.timeline, { status: x.orderStatus, occurredAt: now, actorId: this.actor(), note: 'Từ chối yêu cầu hủy: ' + note.trim() }] }));
      this.audit('CANCEL_REJECT', 'order', o._id, note.trim());
      this.send('POST', `/api/admin/orders/${orderId}/cancel-request`, { decision, note: note.trim() });
    return this.done('Đã từ chối yêu cầu hủy, đơn tiếp tục xử lý.');
    }
    const restore = !!o.stockDeductedAt && !o.stockRestoredAt;
    if (restore) for (const it of o.items) this.moveStock(it.productId, it.variantId, it.qty, 'ORDER_RELEASE', `release:${o._id}:${it.orderItemId}`, o._id);
    this.patchOrder(o._id, (x) => ({
      ...x, orderStatus: 'CANCELLED', cancelledAt: now, cancelReason: x.cancelRequest!.reason, stockRestoredAt: restore ? now : x.stockRestoredAt,
      cancelRequest: { ...x.cancelRequest!, status: 'APPROVED', resolvedAt: now, resolveNote: note.trim() || null },
      timeline: [...x.timeline, { status: 'CANCELLED', occurredAt: now, actorId: this.actor(), note: 'Đồng ý hủy đơn' + (restore ? ', hoàn kho' : '') + (x.paymentStatus === 'PAID' ? '. PrintiFy liên hệ khách để hoàn tiền' : '') }],
    }));
    this.audit('CANCEL_APPROVE', 'order', o._id, restore ? 'Hủy + hoàn kho' : 'Hủy (chưa trừ kho)');
    this.send('POST', `/api/admin/orders/${orderId}/cancel-request`, { decision, note: note.trim() });
    return this.done(restore ? 'Đã hủy đơn và hoàn kho.' : 'Đã hủy đơn.');
  }

  // ======================================================== sản phẩm & kho

  updateProduct(id: string, patch: Partial<Product>): ActionResult {
    if (!this.auth.isSuperadmin()) return this.fail('Chỉ SUPERADMIN được sửa sản phẩm.');
    if (!this.product(id)) return this.fail('Không tìm thấy sản phẩm.');
    this.products.update((list) => list.map((p) => (p._id === id ? { ...p, ...patch, updatedAt: this.now() } : p)));
    this.save('products', this.products());
    this.audit('PRODUCT_UPDATE', 'product', id, Object.keys(patch).join(', '));
    this.send('PUT', `/api/admin/products/${id}`, patch);
    return this.done('Đã lưu sản phẩm.');
  }

  createProduct(p: Product): ActionResult {
    if (!this.auth.isSuperadmin()) return this.fail('Chỉ SUPERADMIN được thêm sản phẩm.');
    if (this.product(p._id)) return this.fail('Mã sản phẩm đã tồn tại.');
    const now = this.now();
    const initial = p.variants.map((v) => ({ ...v }));
    this.products.update((list) => [{ ...p, variants: p.variants.map((v) => ({ ...v, stock: 0 })), createdAt: now, updatedAt: now }, ...list]);
    for (const v of initial) if (v.stock > 0) this.moveStock(p._id, v._id, v.stock, 'INITIAL_STOCK', `init:${p._id}:${v._id}`, null);
    this.save('products', this.products());
    this.audit('PRODUCT_CREATE', 'product', p._id, p.name);
    this.send('POST', '/api/admin/products', p);
    return this.done('Đã thêm sản phẩm ' + p.name + '.');
  }

  /** Điều chỉnh kho thủ công: STAFF + SUPERADMIN, bắt buộc lý do, không cho âm */
  adjustStock(productId: string, variantId: string, delta: number, reason: string): ActionResult {
    const v = this.product(productId)?.variants.find((x) => x._id === variantId);
    if (!v) return this.fail('Không tìm thấy biến thể.');
    if (!Number.isInteger(delta) || delta === 0) return this.fail('Nhập số lượng thay đổi (khác 0).');
    if (!reason.trim()) return this.fail('Nhập lý do điều chỉnh.');
    if (v.stock + delta < 0) return this.fail(`Tồn kho không được âm (hiện còn ${v.stock}).`);
    this.moveStock(productId, variantId, delta, 'ADMIN_ADJUST', `adjust:${variantId}:${Date.now()}`, null, reason.trim());
    this.audit('STOCK_ADJUST', 'variant', variantId, `${delta > 0 ? '+' : ''}${delta}: ${reason.trim()}`);
    this.send('PATCH', `/api/admin/products/${productId}/stock`, { variantId, delta, reason: reason.trim() });
    return this.done('Đã cập nhật tồn kho.');
  }

  // ======================================================== marketplace

  reviewListing(id: string, decision: 'APPROVE' | 'REJECT' | 'UNLIST', note: string): ActionResult {
    if (!this.auth.isSuperadmin()) return this.fail('Chỉ SUPERADMIN được duyệt / gỡ tin.');
    const l = this.listing(id);
    if (!l) return this.fail('Không tìm thấy tin.');
    if ((decision === 'APPROVE' || decision === 'REJECT') && l.status !== 'PENDING_REVIEW') return this.fail('Tin không còn ở trạng thái chờ duyệt.');
    if (decision === 'UNLIST' && l.status !== 'APPROVED') return this.fail('Chỉ gỡ được tin đang bán.');
    if (decision !== 'APPROVE' && !note.trim()) return this.fail('Nhập lý do để người bán biết.');
    const status = decision === 'APPROVE' ? 'APPROVED' : decision === 'REJECT' ? 'REJECTED' : 'UNLISTED';
    const now = this.now();
    this.listings.update((list) => list.map((x) => (x._id === id ? { ...x, status, reviewedBy: this.actor(), reviewedAt: now, reviewNote: note.trim() || null, updatedAt: now } : x)));
    this.save('listings', this.listings());
    this.audit('LISTING_' + decision, 'listing', id, note.trim() || 'Duyệt');
    this.send('POST', `/api/admin/market/listings/${id}/review`, { decision, reviewNote: note.trim() });
    return this.done(decision === 'APPROVE' ? 'Đã duyệt, tin hiện công khai trên Marketplace.' : decision === 'REJECT' ? 'Đã từ chối, người bán sẽ thấy lý do.' : 'Đã gỡ tin khỏi Marketplace.');
  }

  /** Báo cáo vi phạm: Gỡ tin (mọi báo cáo OPEN của tin -> RESOLVED) hoặc Bỏ qua (DISMISSED) */
  resolveReport(reportId: string, decision: 'TAKEDOWN' | 'DISMISS', note: string): ActionResult {
    if (!this.auth.isSuperadmin()) return this.fail('Chỉ SUPERADMIN được xử lý báo cáo vi phạm.');
    const r = this.reports().find((x) => x._id === reportId);
    if (!r || r.status !== 'OPEN') return this.fail('Báo cáo đã được xử lý.');
    if (!note.trim()) return this.fail('Nhập ghi chú xử lý.');
    const now = this.now();
    if (decision === 'TAKEDOWN') {
      const l = this.listing(r.listingId);
      if (l && l.status === 'APPROVED') {
        this.listings.update((list) => list.map((x) => (x._id === l._id ? { ...x, status: 'UNLISTED', reviewedBy: this.actor(), reviewedAt: now, reviewNote: 'Gỡ do vi phạm bản quyền: ' + note.trim() } : x)));
        this.save('listings', this.listings());
      }
      this.reports.update((list) => list.map((x) => (x.listingId === r.listingId && x.status === 'OPEN' ? { ...x, status: 'RESOLVED', resolvedBy: this.actor(), resolvedAt: now, resolveNote: note.trim() } : x)));
    } else {
      this.reports.update((list) => list.map((x) => (x._id === reportId ? { ...x, status: 'DISMISSED', resolvedBy: this.actor(), resolvedAt: now, resolveNote: note.trim() } : x)));
    }
    this.save('reports', this.reports());
    this.audit('REPORT_' + decision, 'copyrightReport', reportId, note.trim());
    this.send('POST', `/api/admin/market/reports/${reportId}`, { decision, note: note.trim() });
    return this.done(decision === 'TAKEDOWN' ? 'Đã gỡ tin và đóng các báo cáo của tin này.' : 'Đã bỏ qua báo cáo.');
  }

  // ======================================================== khảo sát

  setQuestionActive(id: string, active: boolean): ActionResult {
    if (!this.auth.isSuperadmin()) return this.fail('Chỉ SUPERADMIN được bật/tắt câu hỏi.');
    this.surveyQuestions.update((list) => list.map((q) => (q._id === id ? { ...q, isActive: active } : q)));
    this.save('surveyQuestions', this.surveyQuestions());
    this.audit(active ? 'SURVEY_ENABLE' : 'SURVEY_DISABLE', 'surveyQuestion', id, '');
    this.send('PATCH', `/api/admin/survey/questions/${id}`, { isActive: active });
    return this.done(active ? 'Đã bật câu hỏi.' : 'Đã tắt câu hỏi.');
  }

  /** Tải lại toàn bộ dữ liệu từ MongoDB */
  reload(): void {
    this.load();
  }

  // ======================================================== nội bộ

  private step(orderId: string, from: OrderStatus, to: OrderStatus, patch: Partial<Order>, note: string, action: string): ActionResult {
    const o = this.order(orderId);
    if (!o || o.orderStatus !== from) { this.pendingUrl = null; return this.fail('Trạng thái đơn đã thay đổi, tải lại để xem.'); }
    const now = this.now();
    this.patchOrder(o._id, (x) => ({ ...x, ...patch, orderStatus: to, timeline: [...x.timeline, { status: to, occurredAt: now, actorId: this.actor(), note }] }));
    this.audit(action, 'order', o._id, note);
    if (this.pendingUrl) this.send(...this.pendingUrl);
    this.pendingUrl = null;
    return this.done('Đã cập nhật: ' + note + '.');
  }

  private patchOrder(id: string, fn: (o: Order) => Order): void {
    this.orders.update((list) => list.map((o) => (o._id === id ? { ...fn(o), updatedAt: this.now() } : o)));
    this.save('orders', this.orders());
  }

  /** Mọi thay đổi kho đi qua đây: ghi inventoryMovements, chống trừ/hoàn 2 lần bằng dedupeKey */
  private moveStock(productId: string, variantId: string, delta: number, type: string, dedupeKey: string, orderId: string | null, reason: string | null = null): void {
    if (this.movements().some((m) => m.dedupeKey === dedupeKey)) return;
    this.products.update((list) => list.map((p) => p._id !== productId ? p : {
      ...p, variants: p.variants.map((v) => (v._id === variantId ? { ...v, stock: Math.max(0, v.stock + delta) } : v)),
    }));
    this.movements.update((list) => [{
      _id: 'mov_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), type, productId, variantId, quantityDelta: delta,
      originalOrderId: orderId, reason, actorId: this.actor(), dedupeKey, recordedAt: this.now(),
    }, ...list]);
    this.save('products', this.products());
    this.save('movements', this.movements());
  }

  private audit(action: string, targetType: string, targetId: string, detail: string): void {
    this.auditLogs.update((list) => [{ _id: 'log_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), actorId: this.actor(), action, targetType, targetId, detail, at: this.now() }, ...list]);
    this.save('auditLogs', this.auditLogs());
  }

  private actor(): string {
    return this.auth.user()?._id ?? 'unknown';
  }

  private now(): string {
    return new Date().toISOString();
  }

  private done(message: string): ActionResult {
    return { ok: true, message };
  }

  private fail(message: string): ActionResult {
    return { ok: false, message };
  }

  /**
   * Gửi thao tác lên server. Màn hình đã cập nhật ngay (kiểm tra luật ở trên), server kiểm tra lại
   * và ghi MongoDB (trừ / hoàn kho, audit log, thông báo khách). Xong -> tải lại dữ liệu thật;
   * server từ chối -> báo lỗi và tải lại để bỏ thay đổi tạm.
   */
  private send(method: 'POST' | 'PUT' | 'PATCH', url: string, body: unknown): void {
    this.http.request<{ message?: string }>(method, url, { body, withCredentials: true }).subscribe({
      next: () => this.load(),
      error: (e: HttpErrorResponse) => {
        this.toast.show(e.status === 0 || e.status >= 500 ? 'Mất kết nối server, thao tác chưa được lưu.' : e.error?.message ?? 'Server từ chối thao tác.', false);
        if (e.status === 401) this.auth.user.set(null);
        this.load();
      },
    });
  }

  /** Thay đổi đã đi qua send(), không lưu gì trên trình duyệt */
  private save(_key: string, _value: unknown[]): void {}

  private load(): void {
    this.http.get<AdminData>('/api/admin/data', { withCredentials: true }).subscribe({
      next: (d) => {
        this.products.set(d.products.map((p) => Object.assign({ lowStockThreshold: 5, isActive: true, allowCustomization: true, allowMarketplace: true, img_detail: [] }, p)));
        this.orders.set(d.orders.map((o) => Object.assign({ timeline: [] }, o)));
        this.listings.set(d.listings);
        this.reports.set(d.reports);
        this.movements.set(d.movements.map((m) => ({ reason: null, ...m })));
        this.surveyQuestions.set(d.surveyQuestions.slice().sort((a, b) => a.orderIndex - b.orderIndex));
        this.auditLogs.set(d.auditLogs);
        this.designs.set(d.designs);
        this.designSales.set(d.designSales);
        this.users.set(d.users);
        this.surveyResponses.set(d.surveyResponses);
        this.printAreas.set({});
        this.error.set('');
        this.loaded.set(true);
      },
      error: (e: HttpErrorResponse) => {
        this.error.set(e.status === 401 ? 'Phiên đăng nhập đã hết, hãy đăng nhập lại.' : 'Không tải được dữ liệu từ server. Kiểm tra printify-server đang chạy (npm run dev).');
        this.loaded.set(true);
      },
    });
  }
}
