const express = require('express');
const { getDb } = require('../../config/db');
const { handle, ApiError } = require('../../utils/shop-common');
const { verifyPassword } = require('../../utils/password');

/*
 * D1 – Đăng nhập Admin (phiên riêng: req.session.adminId, cookie pf.admin.sid)
 *   POST /api/admin/auth/login { email, password } -> { user }
 *   GET  /api/admin/auth/me                         -> { user }
 *   POST /api/admin/auth/logout                     -> 204
 * Sai email / mật khẩu / không phải nhân viên: cùng 1 câu báo lỗi, không lộ email nào tồn tại.
 */
const router = express.Router();
const MAX_FAILS = 5;
const LOCK_MINUTES = 10;
const users = () => getDb().collection('users');
const publicAdmin = (u) => ({ _id: u._id, name: u.name, email: u.email, role: u.role, admin_code: u.admin_code ?? null });

router.post('/login', handle(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const u = await users().findOne({ email });
  if (u?.lockedUntil && Date.parse(u.lockedUntil) > Date.now()) throw new ApiError(429, 'ACCOUNT_LOCKED', `Đăng nhập sai nhiều lần. Thử lại sau ${LOCK_MINUTES} phút.`);
  const isStaff = u && ['STAFF', 'SUPERADMIN'].includes(u.role) && u.status === 'ACTIVE';
  if (!u || !verifyPassword(password, u.passwordHash) || !isStaff) {
    if (u && isStaff) {
      const fails = (u.failedLogins || 0) + 1;
      await users().updateOne({ _id: u._id }, { $set: fails >= MAX_FAILS ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() } : { failedLogins: fails } });
    }
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email hoặc mật khẩu không đúng, hoặc tài khoản không có quyền quản trị.');
  }
  await users().updateOne({ _id: u._id }, { $set: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date().toISOString() } });
  await new Promise((ok, fail) => req.session.regenerate((e) => (e ? fail(e) : ok())));
  req.session.adminId = u._id;
  res.json({ user: publicAdmin(u) });
}));

router.get('/me', handle(async (req, res) => {
  const id = req.session?.adminId;
  const u = id ? await users().findOne({ _id: id }) : null;
  if (!u || !['STAFF', 'SUPERADMIN'].includes(u.role) || u.status !== 'ACTIVE') throw new ApiError(401, 'ADMIN_LOGIN_REQUIRED', 'Chưa đăng nhập quản trị.');
  res.json({ user: publicAdmin(u) });
}));

router.post('/logout', handle(async (req, res) => {
  await new Promise((ok) => req.session.destroy(() => ok()));
  res.clearCookie('pf.admin.sid');
  res.status(204).end();
}));

/** Danh sách tài khoản demo cho trang đăng nhập (chỉ khi phát triển; không có mật khẩu) */
router.get('/demo-accounts', handle(async (_req, res) => {
  if (process.env.NODE_ENV === 'production') return res.json({ items: [] });
  const list = await users().find({ role: { $in: ['STAFF', 'SUPERADMIN'] }, status: 'ACTIVE' }, { projection: { name: 1, email: 1, role: 1, admin_code: 1 } }).toArray();
  res.json({ items: list.sort((a, b) => (a.role === 'SUPERADMIN' ? -1 : 1) - (b.role === 'SUPERADMIN' ? -1 : 1)) });
}));

module.exports = router;
