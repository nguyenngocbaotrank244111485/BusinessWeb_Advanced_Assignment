const express = require('express');
const { getDb } = require('../config/db');
const { requireCustomer } = require('../middlewares/require-customer');
const { handle, ApiError, MAX_QTY, newId } = require('../utils/shop-common');

/*
 * C12 Giỏ hàng – lưu trong collection carts { _id: 'cart_<userId>', userId, items, updatedAt }.
 *   GET /api/cart                 -> { items }  (đã ghép giá / tồn kho mới nhất + cảnh báo)
 *   PUT /api/cart { items }       -> { items }  thay cả giỏ; server tự kiểm tra từng dòng
 * Khách vãng lai giữ giỏ ở trình duyệt; đăng nhập xong app gộp rồi PUT lên server.
 * unitPrice = giá lúc thêm (server giữ, không lấy từ trình duyệt) để báo "giá đã đổi".
 */
const router = express.Router();
const carts = () => getDb().collection('carts');
const lineKey = (i) => [i.productId, i.variantId, i.designId || i.listingId || ''].join('__');

router.use(requireCustomer);

/** Tìm giỏ theo userId (giỏ mẫu có _id khác dạng cart_<userId>) */
async function loadItems(userId) {
  return (await carts().findOne({ userId }))?.items ?? [];
}

async function saveItems(userId, items) {
  const now = new Date().toISOString();
  const r = await carts().updateOne({ userId }, { $set: { items, updatedAt: now } });
  if (!r.matchedCount) await carts().insertOne({ _id: 'cart_' + userId, userId, items, updatedAt: now });
}

/** Ghép dữ liệu mới nhất + đánh dấu vấn đề cho từng dòng */
async function enrich(items) {
  const db = getDb();
  const pids = [...new Set(items.map((i) => i.productId))];
  const lids = [...new Set(items.map((i) => i.listingId).filter(Boolean))];
  const dids = [...new Set(items.map((i) => i.designId).filter(Boolean))];
  const [products, listings, designs] = await Promise.all([
    pids.length ? db.collection('products').find({ _id: { $in: pids } }).toArray() : [],
    lids.length ? db.collection('listings').find({ _id: { $in: lids } }).toArray() : [],
    dids.length ? db.collection('designs').find({ _id: { $in: dids } }, { projection: { previewUrl: 1 } }).toArray() : [],
  ]);
  const pm = new Map(products.map((p) => [p._id, p]));
  const lm = new Map(listings.map((l) => [l._id, l]));
  const dm = new Map(designs.map((d) => [d._id, d]));
  return items.map((i) => {
    const p = pm.get(i.productId);
    const v = p?.variants?.find((x) => x._id === i.variantId);
    const l = i.listingId ? lm.get(i.listingId) : null;
    let issue = '';
    if (!p || !p.isActive || !v) issue = 'UNAVAILABLE';
    else if (i.listingId && (!l || l.status !== 'APPROVED')) issue = 'LISTING_UNAVAILABLE';
    else if (v.stock <= 0) issue = 'OUT_OF_STOCK';
    else if (i.qty > v.stock) issue = 'INSUFFICIENT_STOCK';
    else if (p.price !== i.unitPrice) issue = 'PRICE_CHANGED';
    return {
      ...i, currentPrice: p?.price ?? i.unitPrice, stock: v?.stock ?? 0, issue,
      name: p?.name ?? '', slug: p?.slug ?? i.productId, category: p?.category ?? '', color: v?.color ?? '', size: v ? v.size ?? null : null,
      imageUrl: (i.designId && dm.get(i.designId)?.previewUrl) || v?.imageUrl || p?.img_display || '',
      listingTitle: l?.title ?? null, listingDesignId: l?.designId ?? null, designFee: l ? l.buyerDesignFee : 0,
    };
  });
}

router.get('/', handle(async (req, res) => {
  res.json({ items: await enrich(await loadItems(req.userId)) });
}));

router.put('/', handle(async (req, res) => {
  const incoming = Array.isArray(req.body?.items) ? req.body.items : null;
  if (!incoming || incoming.length > 100) throw new ApiError(400, 'VALIDATION_ERROR', 'Giỏ hàng không hợp lệ (tối đa 100 dòng).');
  const db = getDb();
  const old = new Map((await loadItems(req.userId)).map((i) => [lineKey(i), i]));
  const pids = [...new Set(incoming.map((i) => String(i.productId)))];
  const products = new Map((await db.collection('products').find({ _id: { $in: pids } }).toArray()).map((p) => [p._id, p]));
  const out = new Map();
  for (const raw of incoming) {
    const productId = String(raw.productId || ''), variantId = String(raw.variantId || '');
    const designId = raw.designId ? String(raw.designId) : null, listingId = raw.listingId ? String(raw.listingId) : null;
    const qty = Math.round(Number(raw.qty ?? raw.quantity));
    const p = products.get(productId);
    if (!p || !p.variants.some((v) => v._id === variantId)) continue; // bỏ dòng sản phẩm không còn
    if (!Number.isFinite(qty) || qty < 1) continue;
    if (designId) {
      const d = await db.collection('designs').findOne({ _id: designId }, { projection: { userId: 1 } });
      if (!d || d.userId !== req.userId) continue; // chỉ in thiết kế của chính mình
    }
    if (listingId) {
      const l = await db.collection('listings').findOne({ _id: listingId }, { projection: { sellerId: 1, status: 1 } });
      if (!l || l.sellerId === req.userId) continue; // không mua thiết kế của chính mình
    }
    const line = { productId, variantId, designId, listingId };
    const key = lineKey(line);
    const prev = old.get(key) ?? out.get(key);
    out.set(key, {
      _id: prev?._id ?? (typeof raw._id === 'string' && /^ci_[A-Za-z0-9_]{3,40}$/.test(raw._id) ? raw._id : newId('ci')),
      ...line,
      qty: Math.min(qty + (out.has(key) ? out.get(key).qty : 0), MAX_QTY),
      selected: raw.selected !== false,
      unitPrice: prev?.unitPrice ?? p.price, // giá lúc thêm do server ghi
      addedAt: prev?.addedAt ?? new Date().toISOString(),
    });
  }
  // đồng ý giá mới: client gửi acceptPrice cho dòng đó
  for (const raw of incoming) {
    if (!raw.acceptPrice) continue;
    const key = lineKey({ productId: String(raw.productId), variantId: String(raw.variantId), designId: raw.designId || null, listingId: raw.listingId || null });
    const line = out.get(key);
    if (line) line.unitPrice = products.get(line.productId).price;
  }
  const items = [...out.values()];
  await saveItems(req.userId, items);
  res.json({ items: await enrich(items) });
}));

module.exports = router;
module.exports.loadItems = loadItems;
module.exports.saveItems = saveItems;
module.exports.enrich = enrich;
