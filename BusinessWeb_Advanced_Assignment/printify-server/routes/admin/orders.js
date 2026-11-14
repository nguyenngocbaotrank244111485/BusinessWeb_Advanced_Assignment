const express = require('express');
const { getDb } = require('../../config/db');
const { requireAdmin } = require('../../middlewares/require-admin');
const { handle, ApiError, notify, audit } = require('../../utils/shop-common');
const { deductOrderStock, restoreOrderStock } = require('../order-rules');

/*
 * D6 – Xử lý đơn (STAFF + SUPERADMIN). Mọi thao tác kiểm tra trạng thái hiện tại, sai -> 409.
 *   POST /api/admin/orders/:id/payment-review { decision: APPROVE|REJECT, reason }
 *   POST /api/admin/orders/:id/items/:itemId/design-review { decision: APPROVE|REJECT, reason }
 *   POST /api/admin/orders/:id/sample-start
 *   POST /api/admin/orders/:id/sample-complete { photoUrl }
 *   POST /api/admin/orders/:id/print-complete
 *   POST /api/admin/orders/:id/ship { trackingCode }
 *   POST /api/admin/orders/:id/deliver
 *   POST /api/admin/orders/:id/cancel-request { decision: APPROVE|REJECT, note }
 * Trả { message, order }.
 */
const router = express.Router();
const orders = () => getDb().collection('orders');
router.use(requireAdmin());

const isCustom = (i) => !!(i.designId || i.listingSnapshot);

async function load(id) {
  const o = await orders().findOne({ _id: String(id) });
  if (!o) throw new ApiError(404, 'ORDER_NOT_FOUND', 'Không tìm thấy đơn.');
  return o;
}

/** Ghi thay đổi khi trạng thái còn đúng như lúc đọc (chống 2 nhân viên bấm cùng lúc) */
async function save(o, set, tl, actorId) {
  const now = new Date().toISOString();
  const update = { $set: { ...set, updatedAt: now } };
  if (tl) update.$push = { timeline: { occurredAt: now, actorId, ...tl } };
  const r = await orders().updateOne({ _id: o._id, orderStatus: o.orderStatus, updatedAt: o.updatedAt }, update);
  if (!r.matchedCount) throw new ApiError(409, 'STATUS_CHANGED', 'Đơn vừa được người khác cập nhật. Tải lại để xem trạng thái mới.');
  const { idempotencyKey, ...out } = await orders().findOne({ _id: o._id });
  return out;
}

const link = (o) => '/account/orders/' + o._id;

router.post('/:id/payment-review', handle(async (req, res) => {
  const o = await load(req.params.id);
  const decision = req.body?.decision;
  const reason = String(req.body?.reason || '').trim();
  if (o.orderStatus !== 'PENDING_STAFF_CONFIRMATION' || o.paymentStatus !== 'WAITING_STAFF') throw new ApiError(409, 'STATUS_CHANGED', 'Đơn không còn chờ xác nhận thanh toán. Tải lại để xem.');
  if (decision === 'REJECT') {
    if (!reason) throw new ApiError(400, 'REASON_REQUIRED', 'Nhập lý do từ chối.');
    const now = new Date().toISOString();
    const order = await save(o, { paymentStatus: 'REJECTED', orderStatus: 'CANCELLED', paymentRejectedReason: reason, cancelReason: reason, cancelledAt: now },
      { status: 'CANCELLED', note: 'Từ chối thanh toán: ' + reason }, req.admin._id);
    await notify(o.userId, 'ORDER_PAYMENT', `Đơn ${o._id.toUpperCase()} chưa xác nhận được thanh toán`, reason, link(o));
    await audit(req.admin._id, 'PAYMENT_REJECT', 'order', o._id, reason);
    return res.json({ message: 'Đã từ chối thanh toán, đơn chuyển sang Đã hủy.', order });
  }
  if (decision !== 'APPROVE') throw new ApiError(400, 'VALIDATION_ERROR', 'Chọn xác nhận hoặc từ chối.');
  // trừ kho đúng 1 lần, thiếu hàng -> 409 và không đổi gì
  await deductOrderStock(o, o.items, 'ORDER_DEDUCTION', `deduct:${o._id}`, req.admin._id);
  const now = new Date().toISOString();
  const hasDesign = o.items.some(isCustom);
  const next = hasDesign ? 'DESIGN_REVIEW' : 'PRINT_CONFIRMED';
  const order = await save(o, {
    paymentStatus: 'PAID', paidAt: now, stockDeductedAt: o.stockDeductedAt ?? now, orderStatus: next,
    items: o.items.map((i) => (isCustom(i) ? { ...i, designReview: { status: 'PENDING', reason: null, reviewedAt: null } } : i)),
  }, { status: next, note: 'Xác nhận đã nhận tiền, trừ kho' + (hasDesign ? ' · chờ PrintiFy kiểm tra mẫu in' : ' · chuyển in') }, req.admin._id);
  // ghi nhận doanh số thiết kế Marketplace khi đơn đã PAID
  for (const i of o.items.filter((x) => x.listingSnapshot)) {
    const s = i.listingSnapshot;
    await getDb().collection('designSales').updateOne({ _id: 'ds_' + i.orderItemId }, { $setOnInsert: {
      orderId: o._id, orderItemId: i.orderItemId, listingId: s.listingId, sellerId: s.sellerId, buyerId: o.userId, productId: i.productId,
      sellerPrice: s.sellerPrice ?? Math.round(s.buyerDesignFee / 1.1), platformFee: s.platformFee ?? s.buyerDesignFee - Math.round(s.buyerDesignFee / 1.1),
      buyerDesignFee: s.buyerDesignFee, status: 'RECORDED', reversedAmount: 0, reversedAt: null, recordedAt: now } }, { upsert: true });
    await notify(s.sellerId, 'DESIGN_SALE', `Thiết kế “${s.title}” vừa có lượt bán`, 'Một khách đã đặt in thiết kế của bạn.', '/market/my-listings');
  }
  await notify(o.userId, 'ORDER_PAYMENT', `Đã xác nhận thanh toán đơn ${o._id.toUpperCase()}`, hasDesign ? 'PrintiFy đang kiểm tra mẫu in của bạn.' : 'Đơn đang được in.', link(o));
  await audit(req.admin._id, 'PAYMENT_APPROVE', 'order', o._id, 'Xác nhận thanh toán, trừ kho');
  res.json({ message: 'Đã xác nhận thanh toán và trừ kho.', order });
}));

router.post('/:id/items/:itemId/design-review', handle(async (req, res) => {
  const o = await load(req.params.id);
  const decision = req.body?.decision;
  const reason = String(req.body?.reason || '').trim();
  if (o.orderStatus !== 'DESIGN_REVIEW') throw new ApiError(409, 'STATUS_CHANGED', 'Đơn không ở bước kiểm tra mẫu in.');
  const it = o.items.find((i) => i.orderItemId === req.params.itemId);
  if (!it || !isCustom(it)) throw new ApiError(404, 'ITEM_NOT_FOUND', 'Không tìm thấy dòng có thiết kế.');
  if (it.designReview?.status !== 'PENDING') throw new ApiError(409, 'STATUS_CHANGED', 'Mẫu này đã được xử lý.');
  if (decision === 'REJECT' && !reason) throw new ApiError(400, 'REASON_REQUIRED', 'Nhập lý do cần sửa để khách biết sửa chỗ nào.');
  if (!['APPROVE', 'REJECT'].includes(decision)) throw new ApiError(400, 'VALIDATION_ERROR', 'Chọn Đạt hoặc Cần sửa.');
  const now = new Date().toISOString();
  let items = o.items.map((i) => (i.orderItemId !== it.orderItemId ? i : {
    ...i, designReview: { ...i.designReview, status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED', reason: decision === 'APPROVE' ? null : reason, reviewedAt: now, resubmittedAt: null },
  }));
  const allOk = items.filter(isCustom).every((i) => ['APPROVED', 'ACCEPTED_RISK'].includes(i.designReview?.status));
  const set = { items };
  let tl = decision === 'REJECT' ? { status: 'DESIGN_REVIEW', note: 'Mẫu cần chỉnh sửa: ' + reason } : null;
  if (allOk) {
    set.orderStatus = 'SAMPLE_PRINTING';
    set.items = items.map((i) => (i.requiresSample ? { ...i, sampleStatus: 'WAITING_SAMPLE' } : i));
    tl = { status: 'SAMPLE_PRINTING', note: 'Mẫu in đạt, chuyển in mẫu thử' };
  }
  const order = await save(o, set, tl, req.admin._id);
  if (decision === 'REJECT') await notify(o.userId, 'DESIGN_REJECTED', `Mẫu in đơn ${o._id.toUpperCase()} cần chỉnh sửa`, reason, link(o));
  await audit(req.admin._id, decision === 'APPROVE' ? 'DESIGN_APPROVE' : 'DESIGN_REJECT', 'orderItem', it.orderItemId, reason || 'Đạt');
  res.json({ message: allOk ? 'Tất cả mẫu đã đạt, đơn chuyển sang In mẫu thử.' : decision === 'APPROVE' ? 'Đã duyệt dòng này.' : 'Đã gửi yêu cầu sửa cho khách.', order });
}));

router.post('/:id/sample-start', handle(async (req, res) => {
  const o = await load(req.params.id);
  if (o.orderStatus !== 'SAMPLE_PRINTING') throw new ApiError(409, 'STATUS_CHANGED', 'Đơn không ở bước in mẫu.');
  if (o.firstSampleStartedAt) throw new ApiError(409, 'ALREADY_STARTED', 'Đã bắt đầu in mẫu rồi.');
  const order = await save(o, { firstSampleStartedAt: new Date().toISOString() }, { status: 'SAMPLE_PRINTING', note: 'Bắt đầu in mẫu – khóa hủy đơn' }, req.admin._id);
  await audit(req.admin._id, 'SAMPLE_START', 'order', o._id, '');
  res.json({ message: 'Đã bắt đầu in mẫu. Khách không thể hủy đơn từ bây giờ.', order });
}));

router.post('/:id/sample-complete', handle(async (req, res) => {
  const o = await load(req.params.id);
  const photo = String(req.body?.photoUrl || '').trim();
  if (o.orderStatus !== 'SAMPLE_PRINTING') throw new ApiError(409, 'STATUS_CHANGED', 'Đơn không ở bước in mẫu.');
  if (!o.firstSampleStartedAt) throw new ApiError(409, 'NOT_STARTED', 'Bấm “Bắt đầu in mẫu” trước.');
  if (!photo || !/^(\/|https?:|data:image\/)/.test(photo)) throw new ApiError(400, 'PHOTO_REQUIRED', 'Hoàn tất mẫu phải có ảnh chụp mẫu in.');
  const order = await save(o, {
    orderStatus: 'SAMPLE_REVIEW',
    items: o.items.map((i) => (i.requiresSample && i.sampleStatus !== 'APPROVED' ? { ...i, sampleStatus: 'SAMPLE_READY', samplePhotoUrl: photo } : i)),
  }, { status: 'SAMPLE_REVIEW', note: 'In mẫu xong, gửi ảnh cho khách duyệt' }, req.admin._id);
  await notify(o.userId, 'SAMPLE_READY', `Mẫu in đơn ${o._id.toUpperCase()} đã sẵn sàng`, 'Bạn xem ảnh mẫu và duyệt để PrintiFy in chính thức.', link(o));
  await audit(req.admin._id, 'SAMPLE_COMPLETE', 'order', o._id, photo.slice(0, 120));
  res.json({ message: 'Đã gửi ảnh mẫu, chờ khách duyệt.', order });
}));

async function step(req, res, from, to, extra, note, action, notice) {
  const o = await load(req.params.id);
  if (o.orderStatus !== from) throw new ApiError(409, 'STATUS_CHANGED', 'Trạng thái đơn đã thay đổi, tải lại để xem.');
  const order = await save(o, { ...extra, orderStatus: to }, { status: to, note }, req.admin._id);
  if (notice) await notify(o.userId, 'ORDER_STATUS', notice.replace('{id}', o._id.toUpperCase()), note, link(o));
  await audit(req.admin._id, action, 'order', o._id, note);
  return { o, order };
}

router.post('/:id/print-complete', handle(async (req, res) => {
  const { order } = await step(req, res, 'PRINT_CONFIRMED', 'PRINT_COMPLETED', { printCompletedAt: new Date().toISOString() }, 'In xong, đóng gói', 'PRINT_COMPLETE', 'Đơn {id} đã in xong');
  res.json({ message: 'Đã cập nhật: in xong, đóng gói.', order });
}));

router.post('/:id/ship', handle(async (req, res) => {
  const code = String(req.body?.trackingCode || '').trim();
  if (!/^[A-Za-z0-9-]{6,30}$/.test(code)) throw new ApiError(400, 'TRACKING_REQUIRED', 'Nhập mã vận đơn (6–30 ký tự chữ / số).');
  const { order } = await step(req, res, 'PRINT_COMPLETED', 'SHIPPING', { shippedAt: new Date().toISOString(), trackingCode: code }, 'Bàn giao vận chuyển, mã ' + code, 'SHIP', 'Đơn {id} đang được giao');
  res.json({ message: 'Đã bàn giao vận chuyển.', order });
}));

router.post('/:id/deliver', handle(async (req, res) => {
  const { o, order } = await step(req, res, 'SHIPPING', 'COMPLETED', { deliveredAt: new Date().toISOString() }, 'Đã giao hàng thành công', 'DELIVER', 'Đơn {id} đã giao thành công');
  // cộng chi tiêu + điểm để tính hạng thành viên (1 điểm / 10.000đ)
  const u = await getDb().collection('users').findOne({ _id: o.userId }, { projection: { membership: 1 } });
  const m = u?.membership ?? { totalSpent: 0, points: 0 };
  await getDb().collection('users').updateOne({ _id: o.userId }, { $set: { membership: { totalSpent: (m.totalSpent || 0) + o.totals.total, points: (m.points || 0) + Math.floor(o.totals.total / 10000) } } });
  res.json({ message: 'Đã xác nhận giao hàng thành công.', order });
}));

router.post('/:id/cancel-request', handle(async (req, res) => {
  const o = await load(req.params.id);
  const decision = req.body?.decision;
  const note = String(req.body?.note || '').trim();
  if (o.cancelRequest?.status !== 'PENDING') throw new ApiError(409, 'STATUS_CHANGED', 'Không có yêu cầu hủy đang chờ.');
  const now = new Date().toISOString();
  if (decision === 'REJECT') {
    if (!note) throw new ApiError(400, 'REASON_REQUIRED', 'Nhập lý do từ chối để báo khách.');
    const order = await save(o, { cancelRequest: { ...o.cancelRequest, status: 'REJECTED', resolvedAt: now, resolveNote: note } }, { status: o.orderStatus, note: 'Từ chối yêu cầu hủy: ' + note }, req.admin._id);
    await notify(o.userId, 'ORDER_STATUS', `Yêu cầu hủy đơn ${o._id.toUpperCase()} không được chấp nhận`, note, link(o));
    await audit(req.admin._id, 'CANCEL_REJECT', 'order', o._id, note);
    return res.json({ message: 'Đã từ chối yêu cầu hủy, đơn tiếp tục xử lý.', order });
  }
  if (decision !== 'APPROVE') throw new ApiError(400, 'VALIDATION_ERROR', 'Chọn đồng ý hoặc từ chối.');
  if (o.firstSampleStartedAt) throw new ApiError(409, 'CANCEL_LOCKED', 'Đơn đã bắt đầu in mẫu, không thể hủy.');
  const restore = !!o.stockDeductedAt && !o.stockRestoredAt;
  if (restore) await restoreOrderStock(o, req.admin._id);
  const order = await save(o, {
    orderStatus: 'CANCELLED', cancelledAt: now, cancelReason: o.cancelRequest.reason, stockRestoredAt: restore ? now : o.stockRestoredAt ?? null,
    cancelRequest: { ...o.cancelRequest, status: 'APPROVED', resolvedAt: now, resolveNote: note || null },
  }, { status: 'CANCELLED', note: 'Đồng ý hủy đơn' + (restore ? ', hoàn kho' : '') + (o.paymentStatus === 'PAID' ? '. PrintiFy liên hệ khách để hoàn tiền' : '') }, req.admin._id);
  await notify(o.userId, 'ORDER_STATUS', `Đơn ${o._id.toUpperCase()} đã được hủy`, o.paymentStatus === 'PAID' ? 'PrintiFy sẽ liên hệ để hoàn tiền cho bạn.' : 'Yêu cầu hủy đã được chấp nhận.', link(o));
  await audit(req.admin._id, 'CANCEL_APPROVE', 'order', o._id, restore ? 'Hủy + hoàn kho' : 'Hủy (chưa trừ kho)');
  res.json({ message: restore ? 'Đã hủy đơn và hoàn kho.' : 'Đã hủy đơn.', order });
}));

module.exports = router;
