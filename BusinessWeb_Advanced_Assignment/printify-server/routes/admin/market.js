const express = require('express');
const { getDb } = require('../../config/db');
const { requireAdmin } = require('../../middlewares/require-admin');
const { handle, ApiError, notify, audit } = require('../../utils/shop-common');

/*
 * D7 / D8 – Marketplace (chỉ SUPERADMIN thao tác; STAFF xem qua /api/admin/data):
 *   POST /api/admin/market/listings/:id/review { decision: APPROVE|REJECT|UNLIST, reviewNote }
 *   POST /api/admin/market/reports/:id { decision: TAKEDOWN|DISMISS, note }
 */
const router = express.Router();
const listings = () => getDb().collection('listings');
const reports = () => getDb().collection('copyrightReports');
router.use(requireAdmin('SUPERADMIN'));

router.post('/listings/:id/review', handle(async (req, res) => {
  const l = await listings().findOne({ _id: String(req.params.id) });
  const decision = req.body?.decision;
  const note = String(req.body?.reviewNote || '').trim();
  if (!l) throw new ApiError(404, 'LISTING_NOT_FOUND', 'Không tìm thấy tin.');
  if (!['APPROVE', 'REJECT', 'UNLIST'].includes(decision)) throw new ApiError(400, 'VALIDATION_ERROR', 'Quyết định không hợp lệ.');
  if (decision !== 'UNLIST' && l.status !== 'PENDING_REVIEW') throw new ApiError(409, 'STATUS_CHANGED', 'Tin không còn ở trạng thái chờ duyệt.');
  if (decision === 'UNLIST' && l.status !== 'APPROVED') throw new ApiError(409, 'STATUS_CHANGED', 'Chỉ gỡ được tin đang bán.');
  if (decision !== 'APPROVE' && !note) throw new ApiError(400, 'REASON_REQUIRED', 'Nhập lý do để người bán biết.');
  const status = { APPROVE: 'APPROVED', REJECT: 'REJECTED', UNLIST: 'UNLISTED' }[decision];
  const now = new Date().toISOString();
  const r = await listings().updateOne({ _id: l._id, status: l.status }, { $set: { status, reviewedBy: req.admin._id, reviewedAt: now, reviewNote: note || null, updatedAt: now } });
  if (!r.matchedCount) throw new ApiError(409, 'STATUS_CHANGED', 'Tin vừa được cập nhật, tải lại để xem.');
  const msg = { APPROVE: ['LISTING_APPROVED', `Tin “${l.title}” đã được duyệt`, 'Thiết kế của bạn đã hiện trên Marketplace.'],
    REJECT: ['LISTING_REJECTED', `Tin “${l.title}” bị từ chối`, note], UNLIST: ['LISTING_REJECTED', `Tin “${l.title}” đã bị gỡ`, note] }[decision];
  await notify(l.sellerId, msg[0], msg[1], msg[2], '/market/my-listings');
  await audit(req.admin._id, 'LISTING_' + decision, 'listing', l._id, note || 'Duyệt');
  res.json({ message: decision === 'APPROVE' ? 'Đã duyệt, tin hiện công khai trên Marketplace.' : decision === 'REJECT' ? 'Đã từ chối, người bán sẽ thấy lý do.' : 'Đã gỡ tin khỏi Marketplace.', listing: await listings().findOne({ _id: l._id }) });
}));

router.post('/reports/:id', handle(async (req, res) => {
  const rep = await reports().findOne({ _id: String(req.params.id) });
  const decision = req.body?.decision;
  const note = String(req.body?.note || '').trim();
  if (!rep || rep.status !== 'OPEN') throw new ApiError(409, 'STATUS_CHANGED', 'Báo cáo đã được xử lý.');
  if (!['TAKEDOWN', 'DISMISS'].includes(decision)) throw new ApiError(400, 'VALIDATION_ERROR', 'Quyết định không hợp lệ.');
  if (!note) throw new ApiError(400, 'REASON_REQUIRED', 'Nhập ghi chú xử lý.');
  const now = new Date().toISOString();
  const resolved = { resolvedBy: req.admin._id, resolvedAt: now, resolveNote: note };
  const l = await listings().findOne({ _id: rep.listingId });
  if (decision === 'TAKEDOWN') {
    if (l && l.status === 'APPROVED') {
      await listings().updateOne({ _id: l._id }, { $set: { status: 'UNLISTED', reviewedBy: req.admin._id, reviewedAt: now, reviewNote: 'Gỡ do vi phạm bản quyền: ' + note, updatedAt: now } });
      await notify(l.sellerId, 'LISTING_REJECTED', `Tin “${l.title}” bị gỡ do vi phạm bản quyền`, note, '/market/my-listings');
    }
    const open = await reports().find({ listingId: rep.listingId, status: 'OPEN' }).toArray();
    for (const r of open) {
      await reports().updateOne({ _id: r._id }, { $set: { status: 'RESOLVED', ...resolved } });
      await notify(r.reporterId, 'REPORT_RESULT', 'Báo cáo vi phạm đã được xử lý', `Tin “${l?.title ?? ''}” đã bị gỡ. Cảm ơn bạn!`, null);
    }
  } else {
    await reports().updateOne({ _id: rep._id }, { $set: { status: 'DISMISSED', ...resolved } });
    await notify(rep.reporterId, 'REPORT_RESULT', 'Báo cáo vi phạm đã được xem xét', 'PrintiFy chưa thấy vi phạm: ' + note, null);
  }
  await audit(req.admin._id, 'REPORT_' + decision, 'copyrightReport', rep._id, note);
  res.json({
    message: decision === 'TAKEDOWN' ? 'Đã gỡ tin và đóng các báo cáo của tin này.' : 'Đã bỏ qua báo cáo.',
    listing: await listings().findOne({ _id: rep.listingId }), reports: await reports().find({ listingId: rep.listingId }).toArray(),
  });
}));

module.exports = router;
