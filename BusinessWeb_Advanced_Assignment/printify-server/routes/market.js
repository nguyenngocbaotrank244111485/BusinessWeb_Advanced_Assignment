const express = require('express');
const { getDb } = require('../config/db');
const { requireCustomer, optionalCustomer } = require('../middlewares/require-customer');
const {
  handle, ApiError, getPublicConfig, calcListingFees, stripAccents, escapeRegex, newId,
} = require('../utils/shop-common');

const router = express.Router();

const ACTIVE_STATUSES = ['PENDING_REVIEW', 'APPROVED', 'REJECTED']; // còn hiệu lực (khác UNLISTED)
const REPORT_REASONS = [
  'Sao chép thiết kế của tôi',
  'Dùng hình ảnh có bản quyền của người khác',
  'Logo hoặc thương hiệu không được phép',
  'Nội dung không phù hợp',
];

const db = () => getDb();

/** Gắn tên người bán + số lượt bán (bỏ lượt đã đảo do hoàn tiền) vào danh sách tin */
async function decorate(listings) {
  if (!listings.length) return [];
  const sellerIds = [...new Set(listings.map((l) => l.sellerId))];
  const ids = listings.map((l) => l._id);
  const [users, sales] = await Promise.all([
    db().collection('users').find({ _id: { $in: sellerIds } }, { projection: { name: 1 } }).toArray(),
    db().collection('designSales').find({ listingId: { $in: ids }, status: { $ne: 'REVERSED' } }, { projection: { listingId: 1 } }).toArray(),
  ]);
  const names = new Map(users.map((u) => [u._id, u.name]));
  const sold = new Map();
  for (const s of sales) sold.set(s.listingId, (sold.get(s.listingId) || 0) + 1);
  return listings.map(({ searchText, ...l }) => ({ ...l, sellerName: names.get(l.sellerId) || 'Người dùng PrintiFy', soldCount: sold.get(l._id) || 0 }));
}

function validateInput(body, { requireDesign }) {
  const errors = {};
  const title = String(body.title || '').trim();
  const description = String(body.description || '').trim();
  const sellerPrice = Number(body.sellerPrice);
  if (requireDesign && !String(body.designId || '').trim()) errors.designId = 'REQUIRED';
  if (!title || title.length > 100) errors.title = 'TITLE_1_100';
  if (description.length < 10 || description.length > 500) errors.description = 'DESCRIPTION_10_500';
  if (!Number.isFinite(sellerPrice) || sellerPrice < 10000 || sellerPrice > 2000000) errors.sellerPrice = 'PRICE_10000_2000000';
  if (body.acceptedCopyright !== true) errors.acceptedCopyright = 'MUST_ACCEPT';
  const tags = [...new Set((Array.isArray(body.tags) ? body.tags : String(body.tags || '').split(','))
    .map((t) => String(t).trim().toLowerCase()).filter(Boolean))].slice(0, 8);
  if (Object.keys(errors).length) throw new ApiError(400, 'VALIDATION_ERROR', 'Thông tin tin đăng chưa hợp lệ.', errors);
  return { title, description, sellerPrice: Math.round(sellerPrice), tags };
}

async function ownListing(id, userId) {
  const listing = await db().collection('listings').findOne({ _id: id });
  if (!listing) throw new ApiError(404, 'LISTING_NOT_FOUND', 'Không tìm thấy tin đăng.');
  if (listing.sellerId !== userId) throw new ApiError(403, 'NOT_OWNER', 'Bạn không có quyền với tin này.');
  return listing;
}

// ---------------------------------------------------------------- công khai

/** GET /api/market/print-areas – vùng in để ghép mockup { productId: {x,y,width,height} } (lấy từ products.printArea) */
router.get('/print-areas', handle(async (_req, res) => {
  const docs = await db().collection('products').find({}, { projection: { printArea: 1 } }).toArray();
  res.json(Object.fromEntries(docs.filter((p) => p.printArea).map((p) => [p._id, p.printArea])));
}));

/**
 * GET /api/market?q=&sort=newest|price-asc|price-desc&scope=all|mine&page=1&limit=12
 * Chỉ tin APPROVED. scope=mine: tin đang bán của người đang đăng nhập.
 */
router.get('/', optionalCustomer, handle(async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 12, 1), 60);
  const page = Math.max(Number(req.query.page) || 1, 1);
  const filter = { status: 'APPROVED' };
  if (req.query.scope === 'mine') {
    if (!req.userId) throw new ApiError(401, 'LOGIN_REQUIRED', 'Bạn cần đăng nhập.');
    filter.sellerId = req.userId;
  }
  const q = stripAccents(String(req.query.q || '').trim()).slice(0, 80);
  if (q) filter.searchText = { $regex: escapeRegex(q) };
  const sort = req.query.sort === 'price-asc' ? { buyerDesignFee: 1, _id: 1 }
    : req.query.sort === 'price-desc' ? { buyerDesignFee: -1, _id: 1 } : { createdAt: -1, _id: 1 };
  const col = db().collection('listings');
  const [items, total] = await Promise.all([
    col.find(filter).sort(sort).skip((page - 1) * limit).limit(limit).toArray(),
    col.countDocuments(filter),
  ]);
  res.json({ items: await decorate(items), total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) });
}));

// ---------------------------------------------------------------- người bán (C20)

/** GET /api/market/mine – My marketplace: thiết kế nháp + mọi tin của tôi + lượt bán, tiền nhận */
router.get('/mine', requireCustomer, handle(async (req, res) => {
  const [listings, designs] = await Promise.all([
    db().collection('listings').find({ sellerId: req.userId }).toArray(),
    db().collection('designs').find({ userId: req.userId }).toArray(),
  ]);
  const ids = listings.map((l) => l._id);
  const sales = ids.length
    ? await db().collection('designSales').find({ listingId: { $in: ids }, status: { $ne: 'REVERSED' } }).sort({ recordedAt: -1 }).toArray()
    : [];
  const listed = new Set(listings.filter((l) => l.status !== 'UNLISTED').map((l) => l.designId));
  const drafts = designs
    .filter((d) => !d.listingId && !listed.has(d._id))
    .map((d) => ({ key: 'd_' + d._id, status: 'EDITING', design: d, soldCount: 0, earned: 0, sales: [], updatedAt: d.updatedAt || d.createdAt }));
  const items = listings.map(({ searchText, ...l }) => {
    const mine = sales.filter((s) => s.listingId === l._id);
    return {
      key: 'l_' + l._id, status: l.status, listing: l, design: designs.find((d) => d._id === l.designId) || null,
      soldCount: mine.length, earned: mine.reduce((s, x) => s + x.sellerPrice - (x.reversedAmount || 0), 0),
      sales: mine.map((s) => ({ _id: s._id, productId: s.productId || null, sellerPrice: s.sellerPrice, recordedAt: s.recordedAt })),
      updatedAt: l.updatedAt || l.createdAt,
    };
  });
  res.json({ items: [...drafts, ...items].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))) });
}));

/** GET /api/market/designs/sellable?keep=designId – thiết kế tự tạo, chưa có tin còn hiệu lực */
router.get('/designs/sellable', requireCustomer, handle(async (req, res) => {
  const busy = await db().collection('listings').find({ sellerId: req.userId, status: { $in: ACTIVE_STATUSES } }, { projection: { designId: 1 } }).toArray();
  const busyIds = new Set(busy.map((l) => l.designId));
  const keep = String(req.query.keep || '');
  const designs = await db().collection('designs').find({ userId: req.userId }).toArray();
  res.json({ items: designs.filter((d) => !d.listingId && (!busyIds.has(d._id) || d._id === keep)) });
}));

/** POST /api/market – đăng tin từ thiết kế của mình -> PENDING_REVIEW (không hiện công khai) */
router.post('/', requireCustomer, handle(async (req, res) => {
  const input = validateInput(req.body || {}, { requireDesign: true });
  const design = await db().collection('designs').findOne({ _id: String(req.body.designId) });
  if (!design || design.userId !== req.userId) throw new ApiError(404, 'DESIGN_NOT_FOUND', 'Không tìm thấy thiết kế của bạn.');
  if (design.listingId) throw new ApiError(409, 'DESIGN_FROM_PURCHASE', 'Không được đăng bán lại thiết kế mua từ người khác.');
  const active = await db().collection('listings').findOne({ designId: design._id, status: { $in: ACTIVE_STATUSES } });
  if (active) throw new ApiError(409, 'DESIGN_ALREADY_LISTED', 'Thiết kế này đã có tin đăng. Hãy sửa tin cũ.');
  const cfg = await getPublicConfig();
  const now = new Date().toISOString();
  const listing = {
    _id: newId('lst'), sellerId: req.userId, designId: design._id, productId: design.productId,
    title: input.title, description: input.description, tags: input.tags,
    ...calcListingFees(input.sellerPrice, cfg.platformFeeRate),
    watermarkUrl: design.previewUrl, licenseScope: 'PRINT_ON_FIXED_PRODUCT', imageAssetScope: 'WATERMARK_PREVIEW_ONLY',
    acceptedCopyright: true, status: 'PENDING_REVIEW', reviewedAt: null, reviewNote: null, createdAt: now, updatedAt: now,
    searchText: stripAccents([input.title, input.description, ...input.tags].join(' ')),
  };
  await db().collection('listings').insertOne(listing);
  const { searchText, ...out } = listing;
  res.status(201).json({ listing: out });
}));

/** PUT /api/market/:id – sửa tin (không đổi thiết kế) -> gửi duyệt lại */
router.put('/:id', requireCustomer, handle(async (req, res) => {
  const old = await ownListing(String(req.params.id), req.userId);
  if (old.status === 'UNLISTED') throw new ApiError(409, 'LISTING_UNLISTED', 'Tin đã gỡ, không sửa được nữa.');
  const input = validateInput(req.body || {}, { requireDesign: false });
  const cfg = await getPublicConfig();
  const update = {
    title: input.title, description: input.description, tags: input.tags,
    ...calcListingFees(input.sellerPrice, cfg.platformFeeRate),
    acceptedCopyright: true, status: 'PENDING_REVIEW', reviewedAt: null, reviewNote: null, updatedAt: new Date().toISOString(),
    searchText: stripAccents([input.title, input.description, ...input.tags].join(' ')),
  };
  await db().collection('listings').updateOne({ _id: old._id }, { $set: update });
  const { searchText, ...out } = { ...old, ...update };
  res.json({ listing: out });
}));

/** POST /api/market/:id/unlist – gỡ tin đang chờ duyệt / đang bán */
router.post('/:id/unlist', requireCustomer, handle(async (req, res) => {
  const old = await ownListing(String(req.params.id), req.userId);
  if (!['PENDING_REVIEW', 'APPROVED'].includes(old.status)) throw new ApiError(409, 'CANNOT_UNLIST', 'Tin này không gỡ được.');
  const updatedAt = new Date().toISOString();
  await db().collection('listings').updateOne({ _id: old._id }, { $set: { status: 'UNLISTED', updatedAt } });
  res.json({ ok: true, status: 'UNLISTED', updatedAt });
}));

/** POST /api/market/:id/reports – báo cáo vi phạm (đăng nhập, không tự báo cáo tin của mình, mỗi người 1 lần) */
router.post('/:id/reports', requireCustomer, handle(async (req, res) => {
  const listing = await db().collection('listings').findOne({ _id: String(req.params.id), status: 'APPROVED' });
  if (!listing) throw new ApiError(404, 'LISTING_NOT_FOUND', 'Không tìm thấy tin đăng.');
  if (listing.sellerId === req.userId) throw new ApiError(409, 'OWN_LISTING', 'Bạn không thể báo cáo tin của chính mình.');
  const reason = String(req.body?.reason || '');
  const description = String(req.body?.description || '').trim();
  if (!REPORT_REASONS.includes(reason) || description.length < 10 || description.length > 1000) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Chọn lý do và mô tả ít nhất 10 ký tự.');
  }
  const existed = await db().collection('copyrightReports').findOne({ listingId: listing._id, reporterId: req.userId });
  if (existed) throw new ApiError(409, 'ALREADY_REPORTED', 'Bạn đã báo cáo thiết kế này rồi.');
  const report = { _id: newId('rpt'), listingId: listing._id, reporterId: req.userId, reason, description, status: 'OPEN', createdAt: new Date().toISOString() };
  await db().collection('copyrightReports').insertOne(report);
  res.status(201).json({ report });
}));

/** GET /api/market/:id – chi tiết tin: công khai nếu APPROVED, người đăng xem được mọi trạng thái */
router.get('/:id', optionalCustomer, handle(async (req, res) => {
  const listing = await db().collection('listings').findOne({ _id: String(req.params.id) });
  if (!listing || (listing.status !== 'APPROVED' && listing.sellerId !== req.userId)) {
    throw new ApiError(404, 'LISTING_NOT_FOUND', 'Thiết kế không tồn tại hoặc chưa được duyệt.');
  }
  const [out] = await decorate([listing]);
  const hasReported = req.userId
    ? !!(await db().collection('copyrightReports').findOne({ listingId: listing._id, reporterId: req.userId }))
    : false;
  res.json({ listing: out, isOwner: listing.sellerId === req.userId, hasReported });
}));

module.exports = router;
