const express = require('express');
const { getDb } = require('../config/db');
const { requireCustomer } = require('../middlewares/require-customer');
const { handle, ApiError, getPublicConfig, calcTotals, tierOf, newId, PHONE_VN } = require('../utils/shop-common');
const { loadItems, saveItems, enrich } = require('./cart');
const { deductOrderStock } = require('./order-rules');

/*
 * Checkout + đơn hàng phía khách (C13, C14, C15). Gắn tại /api:
 *   POST /api/checkout/quote                         -> tiền các dòng đã chọn (server tự tính, giảm theo hạng thành viên)
 *   POST /api/orders { shippingInfo, idempotencyKey, paymentMethod } -> { order } (1 khóa = 1 đơn; KHÔNG trừ kho)
 *   GET  /api/orders, GET /api/orders/:id
 *   POST /api/orders/:id/payment-claim               -> khách báo đã chuyển khoản (WAITING_STAFF, không tự PAID)
 *   POST /api/orders/:id/cancel { reason, note }     -> gửi yêu cầu hủy (trước khi bắt đầu in mẫu)
 *   PUT  /api/orders/:id/address { shippingInfo }    -> đổi địa chỉ (trước khi in)
 *   POST /api/orders/:id/received, POST /api/orders/:id/review { rating, comment }
 *   POST /api/orders/:id/items/:itemId/approve-sample | edit-request | accept-risk
 *   POST /api/orders/:id/items/:itemId/resubmit { designId }
 *   POST /api/orders/:id/items/:itemId/reprints { designId, printFileUrl }
 */
const router = express.Router();
const db = () => getDb();
const orders = () => db().collection('orders');

const CANCEL_OPEN = ['PENDING_PAYMENT', 'PENDING_STAFF_CONFIRMATION', 'DESIGN_REVIEW'];
const CANCEL_REASONS = ['Đặt sai mẫu / sai thiết kế', 'Đặt sai số lượng', 'Chọn sai màu hoặc kích thước', 'Sai địa chỉ giao hàng', 'Thời gian giao không phù hợp', 'Tìm được lựa chọn khác', 'Lý do khác'];

function publicOrder(o) {
  const { idempotencyKey, ...rest } = o;
  return rest;
}

async function discountRateOf(userId) {
  const u = await db().collection('users').findOne({ _id: userId }, { projection: { membership: 1 } });
  return tierOf(u?.membership?.totalSpent ?? 0);
}

/** Đơn quá hạn thanh toán mà chưa báo đã trả -> hủy (chưa trừ kho nên không hoàn) */
async function expireIfNeeded(o) {
  if (o.orderStatus === 'PENDING_PAYMENT' && Date.parse(o.paymentExpiresAt) < Date.now()) {
    const now = new Date().toISOString();
    const set = { orderStatus: 'CANCELLED', paymentStatus: 'EXPIRED', cancelReason: 'Quá hạn thanh toán', cancelledAt: now, updatedAt: now };
    const tl = { status: 'CANCELLED', occurredAt: now, actorId: 'SYSTEM', note: 'Hết hạn thanh toán, hủy đơn (chưa trừ kho nên không hoàn)' };
    await orders().updateOne({ _id: o._id, orderStatus: 'PENDING_PAYMENT' }, { $set: set, $push: { timeline: tl } });
    return { ...o, ...set, timeline: [...(o.timeline || []), tl] };
  }
  return o;
}

async function ownOrder(req) {
  const o = await orders().findOne({ _id: String(req.params.id) });
  if (!o || o.userId !== req.userId) throw new ApiError(404, 'ORDER_NOT_FOUND', 'Không tìm thấy đơn hàng.');
  return expireIfNeeded(o);
}

/** Cập nhật đơn + ghi timeline, trả đơn mới (chỉ khi trạng thái chưa đổi – chống 2 thao tác cùng lúc) */
async function apply(o, set, tl) {
  const now = new Date().toISOString();
  const update = { $set: { ...set, updatedAt: now } };
  if (tl) update.$push = { timeline: { occurredAt: now, actorId: o.userId, ...tl } };
  const r = await orders().updateOne({ _id: o._id, orderStatus: o.orderStatus }, update);
  if (!r.matchedCount) throw new ApiError(409, 'STATUS_CHANGED', 'Trạng thái đơn vừa thay đổi, tải lại để xem.');
  return publicOrder(await orders().findOne({ _id: o._id }));
}

function validateShipping(s) {
  s = s || {};
  const info = {
    name: String(s.name || '').trim(), phone: String(s.phone || '').trim(), province: String(s.province || '').trim(),
    ward: String(s.ward || '').trim(), detail: String(s.detail || '').trim(), note: String(s.note || '').trim(),
  };
  const errors = {};
  if (!info.name || info.name.length > 60) errors.name = 'REQUIRED';
  if (!PHONE_VN.test(info.phone)) errors.phone = 'INVALID_PHONE_VN';
  if (!info.province) errors.province = 'REQUIRED';
  if (!info.ward) errors.ward = 'REQUIRED';
  if (info.detail.length < 5) errors.detail = 'MIN_5';
  if (info.note.length > 200) errors.note = 'MAX_200';
  if (Object.keys(errors).length) throw new ApiError(400, 'VALIDATION_ERROR', 'Thông tin nhận hàng chưa hợp lệ.', errors);
  return info;
}

async function selectedLines(userId) {
  const lines = (await enrich(await loadItems(userId))).filter((i) => i.selected);
  return lines;
}

const totalsOf = (lines, cfg, rate) => calcTotals(lines.map((l) => ({ unitPrice: l.currentPrice, qty: l.qty, designFee: l.designFee })), cfg, rate);

router.post('/checkout/quote', requireCustomer, handle(async (req, res) => {
  const [lines, cfg, tier] = await Promise.all([selectedLines(req.userId), getPublicConfig(), discountRateOf(req.userId)]);
  res.json({
    items: lines, totals: totalsOf(lines, cfg, tier.discountRate), tier: { key: tier.key, label: tier.label, discountRate: tier.discountRate },
    issues: lines.filter((l) => l.issue).map((l) => ({ itemId: l._id, issue: l.issue })),
    paymentMinutes: cfg.orderPaymentMinutes, qrImageUrl: cfg.qrImageUrl,
  });
}));

router.post('/orders', requireCustomer, handle(async (req, res) => {
  const key = String(req.body?.idempotencyKey || '').trim();
  if (key.length < 8 || key.length > 80) throw new ApiError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Thiếu khóa chống tạo trùng đơn.');
  const existing = await orders().findOne({ userId: req.userId, idempotencyKey: key });
  if (existing) return res.status(200).json({ order: publicOrder(await expireIfNeeded(existing)), duplicate: true });

  const shippingInfo = validateShipping(req.body?.shippingInfo);
  const paymentMethod = req.body?.paymentMethod === 'MOMO' ? 'MOMO' : 'BANK';
  const [lines, cfg, tier] = await Promise.all([selectedLines(req.userId), getPublicConfig(), discountRateOf(req.userId)]);
  if (!lines.length) throw new ApiError(409, 'EMPTY_SELECTION', 'Bạn chưa chọn sản phẩm nào trong giỏ.');
  const bad = lines.filter((l) => l.issue);
  if (bad.length) {
    const code = bad.some((l) => l.issue === 'PRICE_CHANGED') ? 'PRICE_CHANGED' : 'INSUFFICIENT_STOCK';
    throw new ApiError(409, code, 'Một số sản phẩm vừa đổi giá hoặc không đủ hàng. Vui lòng kiểm tra lại giỏ.', bad.map((l) => ({ itemId: l._id, issue: l.issue })));
  }
  const designs = new Map((await db().collection('designs').find({ _id: { $in: lines.map((l) => l.designId).filter(Boolean) } }).toArray()).map((d) => [d._id, d]));
  const listings = new Map((await db().collection('listings').find({ _id: { $in: lines.map((l) => l.listingId).filter(Boolean) } }).toArray()).map((l) => [l._id, l]));

  const now = new Date();
  const id = newId('ord');
  const items = lines.map((l, n) => {
    const d = l.designId ? designs.get(l.designId) : null;
    const lst = l.listingId ? listings.get(l.listingId) : null;
    const custom = !!(l.designId || l.listingId);
    return {
      orderItemId: `${id}_${n + 1}`, productId: l.productId, productName: l.name, variantId: l.variantId, color: l.color, size: l.size,
      qty: l.qty, unitPrice: l.currentPrice, imageUrl: d?.previewUrl || l.imageUrl, designId: l.designId || null,
      listingSnapshot: lst ? { listingId: lst._id, title: lst.title, sellerId: lst.sellerId, buyerDesignFee: lst.buyerDesignFee, sellerPrice: lst.sellerPrice, platformFee: lst.platformFee, designId: lst.designId } : null,
      printFileUrl: d?.printFileUrl || null, requiresSample: custom, sampleStatus: custom ? null : 'NOT_REQUIRED', sampleReprintCount: 0,
      sampleReprints: [], editRequest: null, designReview: null,
    };
  });
  const order = {
    _id: id, userId: req.userId, orderStatus: 'PENDING_PAYMENT', paymentStatus: 'PENDING', paymentMethod, items, shippingInfo,
    totals: totalsOf(lines, cfg, tier.discountRate), tierAtOrder: tier.key, idempotencyKey: key,
    paymentOpenedAt: now.toISOString(), paymentExpiresAt: new Date(now.getTime() + cfg.orderPaymentMinutes * 60000).toISOString(),
    paymentClaimedAt: null, paidAt: null, paymentRejectedReason: null, cancelReason: null, cancelledAt: null, cancelRequest: null,
    stockDeductedAt: null, stockRestoredAt: null, firstSampleStartedAt: null, printCompletedAt: null, shippedAt: null, deliveredAt: null,
    receivedAt: null, trackingCode: null, review: null,
    timeline: [{ status: 'PENDING_PAYMENT', occurredAt: now.toISOString(), actorId: req.userId, note: 'Tạo đơn, mở QR ' + cfg.orderPaymentMinutes + ' phút (chưa trừ kho)' }],
    createdAt: now.toISOString(), updatedAt: now.toISOString(),
  };
  try {
    await orders().insertOne(order);
  } catch (e) {
    if (e && e.code === 11000) { // 2 request cùng lúc cùng khóa
      const dup = await orders().findOne({ userId: req.userId, idempotencyKey: key });
      return res.status(200).json({ order: publicOrder(dup), duplicate: true });
    }
    throw e;
  }
  // bỏ các dòng đã đặt khỏi giỏ
  const ordered = new Set(lines.map((l) => l._id));
  const rest = (await loadItems(req.userId)).filter((i) => !ordered.has(i._id));
  await saveItems(req.userId, rest);
  res.status(201).json({ order: publicOrder(order), qrImageUrl: cfg.qrImageUrl });
}));

router.get('/orders', requireCustomer, handle(async (req, res) => {
  const list = await orders().find({ userId: req.userId }).sort({ createdAt: -1 }).toArray();
  res.json({ items: await Promise.all(list.map(async (o) => publicOrder(await expireIfNeeded(o)))) });
}));

router.get('/orders/:id', requireCustomer, handle(async (req, res) => {
  const cfg = await getPublicConfig();
  res.json({ order: publicOrder(await ownOrder(req)), qrImageUrl: cfg.qrImageUrl });
}));

router.post('/orders/:id/payment-claim', requireCustomer, handle(async (req, res) => {
  const o = await ownOrder(req);
  if (o.orderStatus === 'PENDING_STAFF_CONFIRMATION') return res.json({ order: publicOrder(o) });
  if (o.orderStatus !== 'PENDING_PAYMENT') throw new ApiError(409, o.paymentStatus === 'EXPIRED' ? 'PAYMENT_EXPIRED' : 'INVALID_STATUS', 'Đơn không còn chờ thanh toán.');
  res.json({ order: await apply(o, { orderStatus: 'PENDING_STAFF_CONFIRMATION', paymentStatus: 'WAITING_STAFF', paymentClaimedAt: new Date().toISOString() },
    { status: 'PENDING_STAFF_CONFIRMATION', note: 'Khách báo đã chuyển khoản, chờ PrintiFy xác nhận' }) });
}));

function canChangeBeforePrint(o) {
  if (o.orderStatus === 'CANCELLED' || o.cancelRequest?.status === 'PENDING') return false;
  if (CANCEL_OPEN.includes(o.orderStatus)) return true;
  return ['SAMPLE_PRINTING', 'SAMPLE_REVIEW'].includes(o.orderStatus) && !o.firstSampleStartedAt;
}

router.post('/orders/:id/cancel', requireCustomer, handle(async (req, res) => {
  const o = await ownOrder(req);
  const reason = String(req.body?.reason || '').trim();
  const note = String(req.body?.note || '').trim().slice(0, 300);
  if (!CANCEL_REASONS.includes(reason)) throw new ApiError(400, 'VALIDATION_ERROR', 'Chọn lý do hủy.');
  if (!canChangeBeforePrint(o)) throw new ApiError(409, 'CANCEL_LOCKED', 'Đơn đã bắt đầu in hoặc đang có yêu cầu hủy, không thể gửi thêm.');
  const now = new Date().toISOString();
  res.json({ order: await apply(o, { cancelRequest: { reason, note, status: 'PENDING', requestedAt: now, resolvedAt: null, resolveNote: null } },
    { status: 'CANCEL_REQUESTED', note: 'Khách gửi yêu cầu hủy: ' + reason + (note ? ' – ' + note : '') }) });
}));

router.put('/orders/:id/address', requireCustomer, handle(async (req, res) => {
  const o = await ownOrder(req);
  if (!canChangeBeforePrint(o)) throw new ApiError(409, 'ADDRESS_LOCKED', 'Đơn đã bắt đầu in, không đổi địa chỉ được nữa.');
  const info = validateShipping(req.body?.shippingInfo);
  res.json({ order: await apply(o, { shippingInfo: info }, { status: 'ADDRESS_CHANGED', note: 'Khách đổi địa chỉ nhận hàng: ' + [info.detail, info.ward, info.province].join(', ') }) });
}));

router.post('/orders/:id/received', requireCustomer, handle(async (req, res) => {
  const o = await ownOrder(req);
  if (o.orderStatus !== 'COMPLETED') throw new ApiError(409, 'INVALID_STATUS', 'Đơn chưa được giao.');
  if (o.receivedAt) return res.json({ order: publicOrder(o) });
  res.json({ order: await apply(o, { receivedAt: new Date().toISOString() }, { status: 'RECEIVED', note: 'Khách xác nhận đã nhận được hàng' }) });
}));

router.post('/orders/:id/review', requireCustomer, handle(async (req, res) => {
  const o = await ownOrder(req);
  const rating = Math.round(Number(req.body?.rating));
  const comment = String(req.body?.comment || '').trim().slice(0, 1000);
  if (o.orderStatus !== 'COMPLETED') throw new ApiError(409, 'INVALID_STATUS', 'Chỉ đánh giá được đơn đã giao.');
  if (o.review) throw new ApiError(409, 'ALREADY_REVIEWED', 'Bạn đã đánh giá đơn này.');
  if (!(rating >= 1 && rating <= 5)) throw new ApiError(400, 'VALIDATION_ERROR', 'Chọn từ 1 đến 5 sao.');
  res.json({ order: await apply(o, { review: { rating, comment, createdAt: new Date().toISOString() } }) });
}));

function findItem(o, itemId) {
  const it = o.items.find((i) => i.orderItemId === itemId);
  if (!it) throw new ApiError(404, 'ITEM_NOT_FOUND', 'Không tìm thấy dòng đơn.');
  return it;
}

router.post('/orders/:id/items/:itemId/approve-sample', requireCustomer, handle(async (req, res) => {
  const o = await ownOrder(req);
  if (o.orderStatus !== 'SAMPLE_REVIEW') throw new ApiError(409, 'INVALID_STATUS', 'Đơn không ở bước duyệt mẫu.');
  findItem(o, req.params.itemId);
  const items = o.items.map((i) => (i.orderItemId === req.params.itemId ? { ...i, sampleStatus: 'APPROVED', editRequest: null } : i));
  const allOk = items.every((i) => !i.requiresSample || i.sampleStatus === 'APPROVED');
  res.json({ order: await apply(o, { items, ...(allOk ? { orderStatus: 'PRINT_CONFIRMED' } : {}) },
    allOk ? { status: 'PRINT_CONFIRMED', note: 'Khách duyệt mẫu, bắt đầu in chính thức' } : { status: 'SAMPLE_APPROVED', note: 'Khách duyệt mẫu 1 sản phẩm' }) });
}));

router.post('/orders/:id/items/:itemId/edit-request', requireCustomer, handle(async (req, res) => {
  const o = await ownOrder(req);
  if (o.orderStatus !== 'SAMPLE_REVIEW') throw new ApiError(409, 'INVALID_STATUS', 'Chỉ sửa mẫu khi đang chờ duyệt mẫu.');
  const it = findItem(o, req.params.itemId);
  if (it.editRequest?.openedAt) return res.json({ order: publicOrder(o) });
  const now = Date.now();
  const items = o.items.map((i) => (i.orderItemId === it.orderItemId ? { ...i, editRequest: { openedAt: new Date(now).toISOString(), expiresAt: new Date(now + 48 * 3600 * 1000).toISOString() } } : i));
  res.json({ order: await apply(o, { items }) });
}));

router.post('/orders/:id/items/:itemId/resubmit', requireCustomer, handle(async (req, res) => {
  const o = await ownOrder(req);
  if (o.orderStatus !== 'DESIGN_REVIEW') throw new ApiError(409, 'INVALID_STATUS', 'Đơn không ở bước kiểm tra mẫu in.');
  const it = findItem(o, req.params.itemId);
  if (it.designReview?.status !== 'REJECTED') throw new ApiError(409, 'INVALID_STATUS', 'Mẫu này không cần sửa.');
  const designId = String(req.body?.designId || it.designId || '');
  const d = await db().collection('designs').findOne({ _id: designId });
  if (!d || d.userId !== req.userId) throw new ApiError(404, 'DESIGN_NOT_FOUND', 'Không tìm thấy thiết kế của bạn.');
  const now = new Date().toISOString();
  const items = o.items.map((i) => (i.orderItemId === it.orderItemId ? { ...i, designId, imageUrl: d.previewUrl || i.imageUrl, printFileUrl: d.printFileUrl || i.printFileUrl,
    designReview: { status: 'PENDING', reason: null, reviewedAt: null, resubmittedAt: now } } : i));
  res.json({ order: await apply(o, { items }, { status: 'DESIGN_RESUBMITTED', note: 'Khách sửa và gửi lại mẫu in để kiểm tra' }) });
}));

router.post('/orders/:id/items/:itemId/accept-risk', requireCustomer, handle(async (req, res) => {
  const o = await ownOrder(req);
  if (o.orderStatus !== 'DESIGN_REVIEW') throw new ApiError(409, 'INVALID_STATUS', 'Đơn không ở bước kiểm tra mẫu in.');
  const it = findItem(o, req.params.itemId);
  if (it.designReview?.status !== 'REJECTED') throw new ApiError(409, 'INVALID_STATUS', 'Mẫu này không bị cảnh báo.');
  const now = new Date().toISOString();
  const items = o.items.map((i) => (i.orderItemId === it.orderItemId ? { ...i, designReview: { ...i.designReview, status: 'ACCEPTED_RISK', riskAcceptedAt: now } } : i));
  const cleared = items.every((i) => !i.designReview || ['APPROVED', 'ACCEPTED_RISK'].includes(i.designReview.status));
  const set = { items: cleared ? items.map((i) => (i.requiresSample ? { ...i, sampleStatus: 'WAITING_SAMPLE' } : i)) : items, ...(cleared ? { orderStatus: 'SAMPLE_PRINTING' } : {}) };
  res.json({ order: await apply(o, set, { status: 'DESIGN_RISK_ACCEPTED', note: 'Khách chấp nhận in mẫu hiện tại, tự chịu rủi ro về lỗi đã được cảnh báo' + (cleared ? ' · chuyển sang in mẫu thử' : '') }) });
}));

/** In lại mẫu (SAMPLE_EDIT): lần miễn phí theo hạng (Vàng 2 lần, còn lại 1 lần), sau đó tính phí = giá phôi */
router.post('/orders/:id/items/:itemId/reprints', requireCustomer, handle(async (req, res) => {
  const o = await ownOrder(req);
  if (o.orderStatus !== 'SAMPLE_REVIEW') throw new ApiError(409, 'INVALID_STATUS', 'Chỉ in lại mẫu khi đang chờ duyệt mẫu.');
  const it = findItem(o, req.params.itemId);
  if (!it.editRequest?.expiresAt || Date.parse(it.editRequest.expiresAt) < Date.now()) throw new ApiError(409, 'EDIT_WINDOW_CLOSED', 'Đã hết thời gian sửa mẫu (48 giờ).');
  const designId = String(req.body?.designId || '');
  const d = await db().collection('designs').findOne({ _id: designId });
  if (!d || d.userId !== req.userId) throw new ApiError(404, 'DESIGN_NOT_FOUND', 'Không tìm thấy thiết kế của bạn.');
  const tier = await discountRateOf(req.userId);
  const free = tier.key === 'GOLD' ? 2 : 1;
  const used = (it.sampleReprintCount || 0) + (it.sampleReprints || []).length;
  const fee = used < free ? 0 : it.unitPrice;
  const now = new Date().toISOString();
  const reqDoc = { _id: newId('rpr'), orderId: o._id, orderItemId: it.orderItemId, designId, printFileUrl: d.printFileUrl || req.body?.printFileUrl || null, fee, status: fee ? 'PENDING_PAYMENT' : 'REQUESTED', createdAt: now };
  let items = o.items.map((i) => (i.orderItemId === it.orderItemId ? { ...i, designId, imageUrl: d.previewUrl || i.imageUrl, printFileUrl: reqDoc.printFileUrl, sampleReprints: [...(i.sampleReprints || []), reqDoc] } : i));
  const set = { items };
  let tl = { status: 'SAMPLE_REPRINT_REQUESTED', note: fee ? `Khách xin in lại mẫu (phí ${fee.toLocaleString('vi-VN')}đ, chờ thanh toán)` : 'Khách xin in lại mẫu (miễn phí)' };
  if (!fee) { // miễn phí: quay lại in mẫu ngay, trừ thêm 1 phôi cho mẫu mới
    set.items = items.map((i) => (i.orderItemId === it.orderItemId ? { ...i, sampleStatus: 'WAITING_SAMPLE', editRequest: null } : i));
    set.orderStatus = 'SAMPLE_PRINTING';
    await deductOrderStock(o, [{ ...it, qty: 1 }], 'SAMPLE_ADDITIONAL', `reprint:${reqDoc._id}`, req.userId);
    tl = { status: 'SAMPLE_PRINTING', note: 'Khách sửa mẫu, PrintiFy in lại mẫu thử (miễn phí, trừ thêm 1 phôi)' };
  }
  res.status(201).json({ order: await apply(o, set, tl), reprint: reqDoc });
}));

module.exports = router;
module.exports.publicOrder = publicOrder;
module.exports.expireIfNeeded = expireIfNeeded;
