const { getDb } = require('../config/db');

/**
 * Bắt buộc đăng nhập Admin (phiên riêng cookie pf.admin.sid, khác phiên khách hàng).
 * roles: danh sách vai trò được phép, ví dụ requireAdmin('SUPERADMIN').
 * 401 = chưa đăng nhập / hết phiên -> D1; 403 = không đủ quyền -> D10 hoặc báo tại chỗ.
 */
function requireAdmin(...roles) {
  return async (req, res, next) => {
    try {
      const adminId = req.session?.adminId;
      if (typeof adminId !== 'string' || !adminId) {
        return res.status(401).json({ code: 'ADMIN_LOGIN_REQUIRED', message: 'Phiên quản trị đã hết, vui lòng đăng nhập lại.' });
      }
      const admin = await getDb().collection('users').findOne({ _id: adminId }, { projection: { name: 1, role: 1, status: 1 } });
      if (!admin || !['STAFF', 'SUPERADMIN'].includes(admin.role) || admin.status !== 'ACTIVE') {
        return res.status(401).json({ code: 'ADMIN_LOGIN_REQUIRED', message: 'Tài khoản không còn quyền quản trị.' });
      }
      if (roles.length && !roles.includes(admin.role)) {
        return res.status(403).json({ code: 'FORBIDDEN', message: 'Chức năng này chỉ dành cho ' + roles.join(', ') + '.' });
      }
      req.admin = admin;
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = { requireAdmin };
