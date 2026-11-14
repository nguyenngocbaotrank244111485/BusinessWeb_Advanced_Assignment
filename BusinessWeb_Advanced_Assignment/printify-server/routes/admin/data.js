const express = require('express');
const { getDb } = require('../../config/db');
const { requireAdmin } = require('../../middlewares/require-admin');
const { handle } = require('../../utils/shop-common');
const { expireIfNeeded } = require('../orders');

/*
 * Dữ liệu cho các màn Admin (D0, D2–D9), đọc từ MongoDB:
 *   GET /api/admin/data      -> { products, orders, listings, designs, designSales, users, reports, movements, surveyQuestions, surveyResponses, auditLogs }
 *   GET /api/admin/dashboard?from=&to= -> số liệu tổng hợp (D2)
 * Phiếu khảo sát chỉ trả điểm, không trả userId (ẩn danh khi thống kê).
 */
const router = express.Router();
router.use(requireAdmin());

router.get('/data', handle(async (_req, res) => {
  const db = getDb();
  const all = (name, opts = {}) => db.collection(name).find({}, opts).toArray();
  const [products, orders, listings, designs, designSales, users, reports, movements, surveyQuestions, responses, auditLogs] = await Promise.all([
    all('products'), all('orders'), all('listings', { projection: { searchText: 0 } }),
    all('designs', { projection: { _id: 1, userId: 1, productId: 1, previewUrl: 1, listingId: 1 } }),
    all('designSales'),
    db.collection('users').find({}, { projection: { _id: 1, name: 1, email: 1, role: 1, status: 1, membership: 1 } }).toArray(),
    all('copyrightReports'),
    db.collection('inventoryMovements').find({}).sort({ recordedAt: -1 }).limit(1000).toArray(),
    db.collection('surveyQuestions').find({}).sort({ orderIndex: 1 }).toArray(),
    db.collection('surveyResponses').find({}, { projection: { userId: 0, comment: 0 } }).toArray(),
    db.collection('auditLogs').find({}).sort({ at: -1 }).limit(300).toArray(),
  ]);
  res.json({
    products, orders: await Promise.all(orders.map(expireIfNeeded)).then((l) => l.map(({ idempotencyKey, ...o }) => o)),
    listings, designs, designSales, users, reports, movements, surveyQuestions,
    surveyResponses: responses.map((r) => ({ ...r, userId: 'anon' })), auditLogs,
  });
}));

router.get('/dashboard', handle(async (req, res) => {
  const db = getDb();
  const from = Date.parse(String(req.query.from || '')) || Date.now() - 30 * 86400000;
  const to = (Date.parse(String(req.query.to || '')) || Date.now()) + 86400000;
  const inRange = (s) => s && Date.parse(s) >= from && Date.parse(s) < to;
  const [orders, products, sales, responses] = await Promise.all([
    db.collection('orders').find({}).toArray(), db.collection('products').find({ isActive: true }).toArray(),
    db.collection('designSales').find({}).toArray(), db.collection('surveyResponses').find({}).toArray(),
  ]);
  const inPeriod = orders.filter((o) => inRange(o.createdAt));
  const paid = orders.filter((o) => o.paymentStatus === 'PAID' && o.orderStatus !== 'CANCELLED' && inRange(o.paidAt || o.createdAt));
  const byStatus = {};
  for (const o of inPeriod) byStatus[o.orderStatus] = (byStatus[o.orderStatus] || 0) + 1;
  let low = 0, out = 0;
  for (const p of products) for (const v of p.variants) { if (v.stock <= 0) out++; else if (v.stock <= (p.lowStockThreshold ?? 5)) low++; }
  res.json({
    orderCount: inPeriod.length, paidRevenue: paid.reduce((s, o) => s + o.totals.total, 0), ordersByStatus: byStatus,
    lowStockVariants: low, outOfStockVariants: out,
    marketplaceSalesCount: sales.filter((s) => s.status !== 'REVERSED' && inRange(s.recordedAt)).length,
    tamSurveyResponses: responses.length,
  });
}));

module.exports = router;
