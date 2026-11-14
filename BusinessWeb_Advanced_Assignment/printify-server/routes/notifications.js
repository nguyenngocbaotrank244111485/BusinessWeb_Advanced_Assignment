const express = require('express');
const { getDb } = require('../config/db');
const { requireCustomer } = require('../middlewares/require-customer');
const { handle, ApiError } = require('../utils/shop-common');

/*
 * C19 – Thông báo của khách:
 *   GET   /api/notifications               -> { items } (mới nhất trước)
 *   PATCH /api/notifications/:id/read      -> { ok }
 *   PATCH /api/notifications/read-all      -> { ok }
 */
const router = express.Router();
const col = () => getDb().collection('notifications');
router.use(requireCustomer);

router.get('/', handle(async (req, res) => {
  const items = await col().find({ userId: req.userId }).sort({ createdAt: -1 }).limit(200).toArray();
  res.json({ items });
}));

router.patch('/read-all', handle(async (req, res) => {
  const unread = await col().find({ userId: req.userId, isRead: false }, { projection: { _id: 1 } }).toArray();
  for (const n of unread) await col().updateOne({ _id: n._id }, { $set: { isRead: true, readAt: new Date().toISOString() } });
  res.json({ ok: true, count: unread.length });
}));

router.patch('/:id/read', handle(async (req, res) => {
  const r = await col().updateOne({ _id: String(req.params.id), userId: req.userId }, { $set: { isRead: true, readAt: new Date().toISOString() } });
  if (!r.matchedCount) throw new ApiError(404, 'NOT_FOUND', 'Không tìm thấy thông báo.');
  res.json({ ok: true });
}));

module.exports = router;
