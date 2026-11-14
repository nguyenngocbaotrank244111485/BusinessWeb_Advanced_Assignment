const express = require('express');
const { getDb } = require('../config/db');
const { handle, ApiError, stripAccents, escapeRegex } = require('../utils/shop-common');

const router = express.Router();

const SORTS = {
  newest: { createdAt: -1, _id: 1 },
  'price-asc': { price: 1, _id: 1 },
  'price-desc': { price: -1, _id: 1 },
  name: { searchName: 1, _id: 1 },
};
/** Không trả field nội bộ (searchName dùng để tìm không dấu) */
const PUBLIC_PROJECTION = { searchName: 0, searchText: 0 };

function toInt(v, fallback = null) {
  if (v === undefined || v === null || String(v).trim() === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : fallback;
}

/**
 * GET /api/products?q=&category=&min=&max=&sort=newest|price-asc|price-desc|name&page=1&limit=12
 * Chỉ sản phẩm đang bán. Trả { items, total, page, limit, totalPages }.
 */
router.get('/', handle(async (req, res) => {
  const limit = Math.min(Math.max(toInt(req.query.limit, 12), 1), 100);
  const page = Math.max(toInt(req.query.page, 1), 1);
  const filter = { isActive: true };
  if (req.query.category) filter.category = String(req.query.category);
  let min = toInt(req.query.min);
  let max = toInt(req.query.max);
  if (min !== null && max !== null && min > max) [min, max] = [max, min];
  if (min !== null || max !== null) {
    filter.price = {};
    if (min !== null) filter.price.$gte = min;
    if (max !== null) filter.price.$lte = max;
  }
  const q = stripAccents(String(req.query.q || '').trim()).slice(0, 80);
  if (q) filter.searchText = { $regex: escapeRegex(q) };

  const sort = SORTS[req.query.sort] || SORTS.newest;
  const col = getDb().collection('products');
  const [items, total] = await Promise.all([
    col.find(filter, { projection: PUBLIC_PROJECTION }).sort(sort).skip((page - 1) * limit).limit(limit).toArray(),
    col.countDocuments(filter),
  ]);
  res.json({ items, total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) });
}));

/** GET /api/products/categories – danh mục kèm số sản phẩm đang bán */
router.get('/categories', handle(async (_req, res) => {
  const products = await getDb().collection('products').find({ isActive: true }, { projection: { category: 1 } }).toArray();
  const counts = new Map();
  for (const p of products) counts.set(p.category, (counts.get(p.category) || 0) + 1);
  res.json({ items: [...counts].map(([slug, count]) => ({ slug, count })) });
}));

/** GET /api/products/:slug – nhận cả _id cũ để link cũ không hỏng; sản phẩm ngừng bán -> 404 */
router.get('/:slug', handle(async (req, res) => {
  const key = String(req.params.slug);
  const product = await getDb().collection('products').findOne(
    { isActive: true, $or: [{ slug: key }, { _id: key }] },
    { projection: PUBLIC_PROJECTION },
  );
  if (!product) throw new ApiError(404, 'PRODUCT_NOT_FOUND', 'Không tìm thấy sản phẩm hoặc sản phẩm đã ngừng bán.');
  res.json({ product });
}));

module.exports = router;
