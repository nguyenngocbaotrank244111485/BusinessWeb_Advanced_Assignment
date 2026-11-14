const express = require('express');
const { getDb } = require('../../config/db');
const { requireAdmin } = require('../../middlewares/require-admin');
const { handle, ApiError, audit, stripAccents, toSlug } = require('../../utils/shop-common');
const { moveStock } = require('../order-rules');

/*
 * D3 / D4 – Sản phẩm:
 *   POST  /api/admin/products                       (SUPERADMIN) tạo; tồn ban đầu ghi INITIAL_STOCK
 *   PUT   /api/admin/products/:id                   (SUPERADMIN) sửa tên, giá, mô tả, cờ, ngưỡng, vùng in (không sửa tồn kho ở đây)
 *   PATCH /api/admin/products/:id/stock { variantId, delta, reason }  (STAFF + SUPERADMIN) -> ADMIN_ADJUST
 * Không xóa cứng sản phẩm: ẩn bằng isActive=false để đơn cũ vẫn tra cứu được.
 */
const router = express.Router();
const products = () => getDb().collection('products');
const CATEGORIES = ['ao-thun', 'tui-vai', 'binh-nuoc', 'van-phong-pham', 'trang-tri', 'phu-kien'];

function area(a) {
  if (!a) return null;
  const r = { x: +a.x, y: +a.y, width: +a.width, height: +a.height };
  if (Object.values(r).some((n) => !Number.isFinite(n) || n < 0 || n > 1) || r.width < 0.05 || r.height < 0.05 || r.x + r.width > 1.001 || r.y + r.height > 1.001) {
    throw new ApiError(400, 'INVALID_PRINT_AREA', 'Vùng in phải nằm trong ảnh (giá trị 0–1, X + Rộng và Y + Cao ≤ 1).');
  }
  return r;
}

function fields(b, partial) {
  const out = {};
  const errors = {};
  const has = (k) => b[k] !== undefined;
  if (!partial || has('name')) { out.name = String(b.name || '').trim(); if (out.name.length < 2 || out.name.length > 120) errors.name = 'NAME_2_120'; }
  if (!partial || has('category')) { out.category = String(b.category || ''); if (!CATEGORIES.includes(out.category)) errors.category = 'INVALID_CATEGORY'; }
  if (!partial || has('price')) { out.price = Math.round(Number(b.price)); if (!(out.price >= 1000)) errors.price = 'MIN_1000'; }
  if (!partial || has('description')) { out.description = String(b.description || '').trim(); if (out.description.length < 10) errors.description = 'MIN_10'; }
  if (has('lowStockThreshold') || !partial) { out.lowStockThreshold = Math.max(0, Math.round(Number(b.lowStockThreshold ?? 5))); }
  for (const k of ['isActive', 'allowCustomization', 'allowMarketplace']) if (has(k) || !partial) out[k] = b[k] === undefined ? true : !!b[k];
  if (has('img_display')) out.img_display = String(b.img_display);
  if (has('printArea')) out.printArea = area(b.printArea);
  if (Object.keys(errors).length) throw new ApiError(400, 'VALIDATION_ERROR', 'Thông tin sản phẩm chưa hợp lệ.', errors);
  if (out.name) { out.slug = toSlug(out.name); out.searchName = stripAccents(out.name); }
  return out;
}

router.post('/', requireAdmin('SUPERADMIN'), handle(async (req, res) => {
  const b = req.body || {};
  const f = fields(b, false);
  const variants = Array.isArray(b.variants) ? b.variants : [];
  if (!variants.length) throw new ApiError(400, 'VALIDATION_ERROR', 'Cần ít nhất 1 biến thể.');
  const all = await products().find({}, { projection: { _id: 1, slug: 1 } }).toArray();
  const next = Math.max(0, ...all.map((p) => Number(String(p._id).replace(/\D/g, '')) || 0)) + 1;
  const id = 'prd' + next;
  if (all.some((p) => p.slug === f.slug)) f.slug = f.slug + '-' + next;
  const vs = variants.map((v) => ({ _id: [id, v.color, v.size].filter(Boolean).join('-').toLowerCase(), color: String(v.color || '').trim(), size: v.size ? String(v.size).trim() : null, stock: 0, initial: Math.max(0, Math.round(Number(v.stock) || 0)) }));
  if (vs.some((v) => !v.color) || new Set(vs.map((v) => v._id)).size !== vs.length) throw new ApiError(400, 'VALIDATION_ERROR', 'Biến thể thiếu màu hoặc bị trùng màu + size.');
  const now = new Date().toISOString();
  await products().insertOne({
    _id: id, ...f, img_display: f.img_display || 'images/products/placeholder.svg', img_detail: [], printArea: f.printArea ?? { x: 0.3, y: 0.3, width: 0.4, height: 0.4 },
    variants: vs.map(({ initial, ...v }) => v), searchText: stripAccents([f.name, f.description].join(' ')), stockVersion: 0, createdAt: now, updatedAt: now,
  });
  for (const v of vs) if (v.initial > 0) await moveStock({ productId: id, variantId: v._id, delta: v.initial, type: 'INITIAL_STOCK', dedupeKey: `init:${v._id}`, actorId: req.admin._id });
  await audit(req.admin._id, 'PRODUCT_CREATE', 'product', id, f.name);
  res.status(201).json({ message: 'Đã thêm sản phẩm ' + f.name + '.', product: await products().findOne({ _id: id }) });
}));

router.put('/:id', requireAdmin('SUPERADMIN'), handle(async (req, res) => {
  const p = await products().findOne({ _id: String(req.params.id) });
  if (!p) throw new ApiError(404, 'PRODUCT_NOT_FOUND', 'Không tìm thấy sản phẩm.');
  const b = { ...(req.body || {}) };
  delete b.variants; // tồn kho chỉ đổi qua /stock
  const f = fields(b, true);
  if (f.name || f.description) f.searchText = stripAccents([f.name ?? p.name, f.description ?? p.description].join(' '));
  await products().updateOne({ _id: p._id }, { $set: { ...f, updatedAt: new Date().toISOString() } });
  await audit(req.admin._id, 'PRODUCT_UPDATE', 'product', p._id, Object.keys(f).join(', '));
  res.json({ message: f.printArea ? 'Đã lưu vùng in.' : 'Đã lưu sản phẩm.', product: await products().findOne({ _id: p._id }) });
}));

router.patch('/:id/stock', requireAdmin(), handle(async (req, res) => {
  const p = await products().findOne({ _id: String(req.params.id) });
  const variantId = String(req.body?.variantId || '');
  const delta = Number(req.body?.delta);
  const reason = String(req.body?.reason || '').trim();
  if (!p || !p.variants.some((v) => v._id === variantId)) throw new ApiError(404, 'VARIANT_NOT_FOUND', 'Không tìm thấy biến thể.');
  if (!Number.isInteger(delta) || delta === 0) throw new ApiError(400, 'VALIDATION_ERROR', 'Nhập số lượng thay đổi (số nguyên khác 0).');
  if (!reason) throw new ApiError(400, 'REASON_REQUIRED', 'Nhập lý do điều chỉnh.');
  const key = String(req.body?.idempotencyKey || `adjust:${variantId}:${Date.now()}`);
  await moveStock({ productId: p._id, variantId, delta, type: 'ADMIN_ADJUST', dedupeKey: key, reason, actorId: req.admin._id });
  await audit(req.admin._id, 'STOCK_ADJUST', 'variant', variantId, `${delta > 0 ? '+' : ''}${delta}: ${reason}`);
  res.json({ message: 'Đã cập nhật tồn kho.', product: await products().findOne({ _id: p._id }) });
}));

module.exports = router;
