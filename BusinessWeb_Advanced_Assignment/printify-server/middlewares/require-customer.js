const { getDb } = require('../config/db');

/**
 * Bắt buộc đăng nhập Customer (dùng chung cho Marketplace, giỏ hàng, đơn hàng).
 * Đọc req.session.userId do API đăng nhập ghi vào – KHÔNG tin userId gửi từ body / localStorage.
 * Thành công: req.userId = users._id.
 */
async function requireCustomer(req, res, next) {
  try {
    const userId = req.session?.userId;
    if (typeof userId !== 'string' || !userId.trim()) {
      return res.status(401).json({ code: 'LOGIN_REQUIRED', message: 'Bạn cần đăng nhập.' });
    }
    const user = await getDb().collection('users').findOne({ _id: userId }, { projection: { role: 1, status: 1 } });
    if (!user || user.role !== 'CUSTOMER' || user.status !== 'ACTIVE') {
      return res.status(403).json({ code: 'CUSTOMER_REQUIRED', message: 'Tài khoản không có quyền thực hiện.' });
    }
    req.userId = userId;
    next();
  } catch (error) {
    next(error);
  }
}

/** Không bắt buộc: có phiên thì gắn req.userId, không có vẫn cho đi tiếp (khách vãng lai). */
function optionalCustomer(req, _res, next) {
  const userId = req.session?.userId;
  req.userId = typeof userId === 'string' && userId.trim() ? userId : null;
  next();
}

module.exports = { requireCustomer, optionalCustomer };
