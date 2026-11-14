const express = require('express');
const { getDb } = require('../config/db');
const { requireCustomer } = require('../middlewares/require-customer');
const { handle, ApiError, newId } = require('../utils/shop-common');

/*
 * C10 Editor / C11 Thiết kế của tôi (khớp DesignService):
 *   GET    /api/designs              -> { items } thiết kế của tôi
 *   GET    /api/designs/:id          -> { design } (chỉ chủ sở hữu)
 *   PUT    /api/designs/:id          -> { design } tạo mới hoặc ghi đè (id do Editor sinh: dsg_...)
 *   POST   /api/designs/:id/copy     -> { design } bản sao
 *   DELETE /api/designs/:id          -> 204 (không xóa được thiết kế đang có tin Marketplace còn hiệu lực)
 * Ảnh xem trước / file in gửi dạng data URL (PNG) nên route này nhận body lớn hơn.
 */
const router = express.Router();
const designs = () => getDb().collection('designs');
const ID = /^dsg_[A-Za-z0-9_]{3,60}$/;
const IMG = /^(data:image\/(png|jpe?g|webp);base64,|\/)/;

router.use(express.json({ limit: '15mb' }));
router.use(requireCustomer);

function clean(body, userId, old) {
  const productId = String(body.productId || old?.productId || '');
  const doc = {
    userId,
    productId,
    canvasJSON: body.canvasJSON ?? old?.canvasJSON ?? null,
    previewUrl: String(body.previewUrl || old?.previewUrl || ''),
    printFileUrl: body.printFileUrl ?? old?.printFileUrl ?? null,
    color: body.color ?? old?.color ?? null,
    size: body.size ?? old?.size ?? null,
    sides: body.sides ?? old?.sides ?? undefined,
    // thiết kế dựng từ tin Marketplace đã mua giữ nguyên listingId (không được đăng bán lại)
    listingId: old ? old.listingId ?? null : (body.listingId ? String(body.listingId) : null),
  };
  if (!productId) throw new ApiError(400, 'VALIDATION_ERROR', 'Thiếu sản phẩm của thiết kế.');
  if (doc.previewUrl && !IMG.test(doc.previewUrl)) throw new ApiError(400, 'VALIDATION_ERROR', 'Ảnh xem trước không hợp lệ.');
  if (doc.printFileUrl && !IMG.test(doc.printFileUrl)) throw new ApiError(400, 'VALIDATION_ERROR', 'File in không hợp lệ.');
  if (doc.sides === undefined) delete doc.sides;
  return doc;
}

router.get('/', handle(async (req, res) => {
  const items = await designs().find({ userId: req.userId }).sort({ updatedAt: -1 }).toArray();
  res.json({ items });
}));

router.get('/:id', handle(async (req, res) => {
  const d = await designs().findOne({ _id: String(req.params.id) });
  if (!d || d.userId !== req.userId) throw new ApiError(404, 'DESIGN_NOT_FOUND', 'Không tìm thấy thiết kế của bạn.');
  res.json({ design: d });
}));

router.put('/:id', handle(async (req, res) => {
  const id = String(req.params.id);
  if (!ID.test(id)) throw new ApiError(400, 'VALIDATION_ERROR', 'Mã thiết kế không hợp lệ.');
  const old = await designs().findOne({ _id: id });
  if (old && old.userId !== req.userId) throw new ApiError(403, 'NOT_OWNER', 'Đây không phải thiết kế của bạn.');
  const product = await getDb().collection('products').findOne({ _id: String(req.body?.productId || old?.productId) });
  if (!product || !product.allowCustomization) throw new ApiError(400, 'PRODUCT_NOT_CUSTOMIZABLE', 'Sản phẩm này không cho phép tự thiết kế.');
  if (req.body?.listingId && !old) {
    const l = await getDb().collection('listings').findOne({ _id: String(req.body.listingId), status: 'APPROVED' });
    if (!l) throw new ApiError(404, 'LISTING_NOT_FOUND', 'Thiết kế Marketplace không còn được bán.');
  }
  const now = new Date().toISOString();
  const doc = { ...clean(req.body || {}, req.userId, old), updatedAt: now };
  await designs().updateOne({ _id: id }, { $set: doc, $setOnInsert: { createdAt: now } }, { upsert: true });
  res.status(old ? 200 : 201).json({ design: await designs().findOne({ _id: id }) });
}));

router.post('/:id/copy', handle(async (req, res) => {
  const src = await designs().findOne({ _id: String(req.params.id) });
  if (!src || src.userId !== req.userId) throw new ApiError(404, 'DESIGN_NOT_FOUND', 'Không tìm thấy thiết kế của bạn.');
  const now = new Date().toISOString();
  const { _id, ...rest } = src;
  const copy = { ...rest, _id: newId('dsg'), createdAt: now, updatedAt: now };
  await designs().insertOne(copy);
  res.status(201).json({ design: copy });
}));

router.delete('/:id', handle(async (req, res) => {
  const d = await designs().findOne({ _id: String(req.params.id) });
  if (!d || d.userId !== req.userId) throw new ApiError(404, 'DESIGN_NOT_FOUND', 'Không tìm thấy thiết kế của bạn.');
  const active = await getDb().collection('listings').findOne({ designId: d._id, status: { $in: ['PENDING_REVIEW', 'APPROVED'] } });
  if (active) throw new ApiError(409, 'DESIGN_LISTED', 'Thiết kế đang đăng bán trên Marketplace, hãy gỡ tin trước khi xóa.');
  await designs().deleteOne({ _id: d._id });
  res.status(204).end();
}));

module.exports = router;
