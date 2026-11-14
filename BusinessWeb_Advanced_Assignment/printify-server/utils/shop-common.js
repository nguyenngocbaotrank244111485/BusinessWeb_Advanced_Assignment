const { getDb } = require('../config/db');

/** Tham số công khai mặc định (ghi đè bằng document { _id: 'public' } trong collection appConfig) */
const DEFAULT_CONFIG = {
  shippingFeeVnd: 20000,
  platformFeeRate: 0.1,
  orderPaymentMinutes: 10,
  qrImageUrl: '/dataset/images/qr/printify-qr.png',
};

/**
 * Hạng thành viên (C18 – khớp models/membership.model.ts phía Customer):
 * giảm trên tiền hàng mọi đơn, không áp vào phí thiết kế và phí giao hàng.
 */
const TIERS = [
  { key: 'BRONZE', label: 'Đồng', minSpent: 0, discountRate: 0 },
  { key: 'SILVER', label: 'Bạc', minSpent: 2000000, discountRate: 0.03 },
  { key: 'GOLD', label: 'Vàng', minSpent: 5000000, discountRate: 0.05 },
];

function tierOf(totalSpent) {
  return TIERS.reduce((acc, t) => ((totalSpent || 0) >= t.minSpent ? t : acc), TIERS[0]);
}

const MAX_QTY = 999;
/** SĐT Việt Nam (BR09): 0 hoặc +84, đầu số 3/5/7/8/9, tổng 10 số */
const PHONE_VN = /^(0|\+84)(3|5|7|8|9)\d{8}$/;

async function getPublicConfig() {
  const doc = await getDb().collection('appConfig').findOne({ _id: 'public' });
  const { _id, ...rest } = doc || {};
  return { ...DEFAULT_CONFIG, ...rest };
}

/** Tiền đơn: giảm theo hạng thành viên trên tiền hàng; phí thiết kế tính 1 lần / dòng; ship cố định */
function calcTotals(lines, cfg, discountRate = 0) {
  const productSubtotal = lines.reduce((s, l) => s + l.unitPrice * l.qty, 0);
  const designFees = lines.reduce((s, l) => s + (l.designFee || 0), 0);
  const discount = Math.round(productSubtotal * (discountRate || 0));
  const shipping = lines.length ? cfg.shippingFeeVnd : 0;
  return { productSubtotal, designFees, discount, shipping, total: productSubtotal - discount + designFees + shipping };
}

function calcListingFees(sellerPrice, rate) {
  const price = Math.round(Number(sellerPrice) || 0);
  const platformFee = Math.round(price * rate);
  return { sellerPrice: price, platformFee, buyerDesignFee: price + platformFee };
}

/** Bỏ dấu tiếng Việt để tìm kiếm / tạo slug */
function stripAccents(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

function toSlug(s) {
  return stripAccents(s).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Gửi thông báo cho khách (C19) */
async function notify(userId, type, title, body, link) {
  if (!userId) return;
  await getDb().collection('notifications').insertOne({
    _id: newId('ntf'), userId, type, title, body, link: link || null, isRead: false, deliveryStatus: 'SENT', attemptCount: 1,
    createdAt: new Date().toISOString(),
  });
}

/** Nhật ký thao tác Admin */
async function audit(actorId, action, targetType, targetId, detail) {
  await getDb().collection('auditLogs').insertOne({
    _id: newId('log'), actorId, action, targetType, targetId, detail: detail || '', at: new Date().toISOString(),
  });
}

function newId(prefix) {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** Lỗi nghiệp vụ trả về { code, message } với status tương ứng */
class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Bọc handler async: lỗi ApiError -> trả JSON; lỗi khác -> next() cho middleware lỗi chung */
const handle = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next);
  } catch (error) {
    if (error instanceof ApiError) {
      return res.status(error.status).json({ code: error.code, message: error.message, ...(error.details ? { details: error.details } : {}) });
    }
    next(error);
  }
};

module.exports = {
  DEFAULT_CONFIG, TIERS, tierOf, MAX_QTY, PHONE_VN, getPublicConfig, calcTotals, calcListingFees,
  stripAccents, toSlug, escapeRegex, newId, ApiError, handle, notify, audit,
};
