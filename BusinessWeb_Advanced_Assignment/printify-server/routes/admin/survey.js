const express = require('express');
const { getDb } = require('../../config/db');
const { requireAdmin } = require('../../middlewares/require-admin');
const { handle, ApiError, audit } = require('../../utils/shop-common');

/*
 * Khảo sát TAM phía Admin (thống kê nằm trong D2):
 *   PATCH /api/admin/survey/questions/:id { isActive } (SUPERADMIN)
 * Câu đã có người trả lời không sửa chữ (giữ đúng nghĩa số liệu cũ) – chỉ bật / tắt.
 */
const router = express.Router();
router.use(requireAdmin('SUPERADMIN'));

router.patch('/questions/:id', handle(async (req, res) => {
  const col = getDb().collection('surveyQuestions');
  const q = await col.findOne({ _id: String(req.params.id) });
  if (!q) throw new ApiError(404, 'NOT_FOUND', 'Không tìm thấy câu hỏi.');
  if (typeof req.body?.isActive !== 'boolean') throw new ApiError(400, 'VALIDATION_ERROR', 'Thiếu trạng thái bật / tắt.');
  await col.updateOne({ _id: q._id }, { $set: { isActive: req.body.isActive } });
  await audit(req.admin._id, req.body.isActive ? 'SURVEY_ENABLE' : 'SURVEY_DISABLE', 'surveyQuestion', q._id, '');
  res.json({ message: req.body.isActive ? 'Đã bật câu hỏi.' : 'Đã tắt câu hỏi.', question: await col.findOne({ _id: q._id }) });
}));

module.exports = router;
