const express = require('express');
const crypto = require('crypto');
const { getDb } = require('../config/db');
const { handle, ApiError, newId } = require('../utils/shop-common');
const { hashPassword, verifyPassword } = require('../utils/password');

/*
 * Đăng nhập / đăng ký Customer (C07, C08) – khớp AuthService + LoginComponent / RegisterComponent:
 *   POST /api/auth/login { email, password }            -> { user }   (401 sai, 403 chưa kích hoạt, 429 bị khóa)
 *   GET  /api/auth/me                                    -> { user }   (401 chưa đăng nhập)
 *   POST /api/auth/logout                                -> 204
 *   POST /api/auth/register/request-otp { name,email,password } -> { message, demoOtp? } (409 email đã có, 429 gửi quá nhanh)
 *   POST /api/auth/register/verify-otp  { email, otp }   -> { user } và đăng nhập luôn (400 sai/hết hạn, 429 nhập sai quá nhiều)
 *   POST /api/auth/demo-login { userId }                 -> { user } (chỉ khi NODE_ENV=development, cho trang /auth/demo-login)
 * Phiên lưu req.session.userId (connect-mongo) – middleware khảo sát / giỏ / đơn đều đọc trường này.
 */
const router = express.Router();
const MAX_FAILS = 5;
const LOCK_MINUTES = 10;
const OTP_SECONDS = 300;
const OTP_COOLDOWN = 60;
const OTP_MAX_TRIES = 5;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const users = () => getDb().collection('users');

function publicUser(u) {
  return { _id: u._id, name: u.name, email: u.email, role: u.role, status: u.status, avatar: u.avatar ?? null };
}

const hashOtp = (otp) => crypto.createHash('sha256').update(String(otp)).digest('hex');

/** Đổi session id sau đăng nhập (chống session fixation), giữ giỏ vãng lai để gộp */
async function startSession(req, userId) {
  const keep = { guestCart: req.session.guestCart };
  await new Promise((ok, fail) => req.session.regenerate((e) => (e ? fail(e) : ok())));
  req.session.userId = userId;
  if (keep.guestCart) req.session.guestCart = keep.guestCart;
}

router.post('/login', handle(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  if (!email || !password) throw new ApiError(400, 'VALIDATION_ERROR', 'Nhập email và mật khẩu.');
  const user = await users().findOne({ email });
  if (user?.lockedUntil && Date.parse(user.lockedUntil) > Date.now()) {
    throw new ApiError(429, 'ACCOUNT_LOCKED', `Đăng nhập sai nhiều lần, thử lại sau ${LOCK_MINUTES} phút.`);
  }
  if (!user || !verifyPassword(password, user.passwordHash)) {
    if (user) {
      const fails = (user.failedLogins || 0) + 1;
      await users().updateOne({ _id: user._id }, { $set: fails >= MAX_FAILS
        ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() }
        : { failedLogins: fails } });
    }
    throw new ApiError(401, 'INVALID_CREDENTIALS', 'Email hoặc mật khẩu không đúng.');
  }
  if (user.role !== 'CUSTOMER' || user.status !== 'ACTIVE') throw new ApiError(403, 'CUSTOMER_REQUIRED', 'Tài khoản chưa kích hoạt hoặc không phải tài khoản khách hàng.');
  await users().updateOne({ _id: user._id }, { $set: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date().toISOString() } });
  await startSession(req, user._id);
  res.json({ user: publicUser(user) });
}));

router.get('/me', handle(async (req, res) => {
  const userId = req.session?.userId;
  if (!userId) throw new ApiError(401, 'LOGIN_REQUIRED', 'Chưa đăng nhập.');
  const user = await users().findOne({ _id: userId });
  if (!user || user.status !== 'ACTIVE') throw new ApiError(401, 'LOGIN_REQUIRED', 'Phiên đăng nhập không hợp lệ.');
  res.json({ user: publicUser(user) });
}));

router.post('/logout', handle(async (req, res) => {
  await new Promise((ok) => req.session.destroy(() => ok()));
  res.clearCookie('pf.sid');
  res.status(204).end();
}));

router.post('/register/request-otp', handle(async (req, res) => {
  const name = String(req.body?.name || '').trim();
  const email = String(req.body?.email || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const errors = {};
  if (name.length < 2 || name.length > 100) errors.name = 'NAME_2_100';
  if (!EMAIL.test(email)) errors.email = 'INVALID_EMAIL';
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) errors.password = 'WEAK_PASSWORD';
  if (Object.keys(errors).length) throw new ApiError(400, 'VALIDATION_ERROR', 'Thông tin đăng ký chưa hợp lệ.', errors);
  const old = await users().findOne({ email });
  if (old && old.status !== 'PENDING_OTP') throw new ApiError(409, 'EMAIL_EXISTS', 'Email đã được đăng ký.');
  if (old?.otpSentAt && Date.now() - Date.parse(old.otpSentAt) < OTP_COOLDOWN * 1000) {
    throw new ApiError(429, 'OTP_COOLDOWN', `Vui lòng chờ ${OTP_COOLDOWN} giây trước khi gửi lại mã.`);
  }
  const otp = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
  const now = new Date();
  const set = {
    name, email, role: 'CUSTOMER', status: 'PENDING_OTP', passwordHash: hashPassword(password),
    otpHash: hashOtp(otp), otpExpiresAt: new Date(now.getTime() + OTP_SECONDS * 1000).toISOString(), otpSentAt: now.toISOString(), otpTries: 0,
  };
  if (old) await users().updateOne({ _id: old._id }, { $set: set });
  else await users().insertOne({ _id: newId('usr'), ...set, avatar: null, addresses: [], membership: { totalSpent: 0, points: 0 }, createdAt: now.toISOString() });
  // Chưa có dịch vụ email: chỉ trả mã khi chạy local để demo, KHÔNG làm vậy khi production
  const dev = process.env.NODE_ENV !== 'production';
  if (dev) console.log(`[OTP demo] ${email}: ${otp}`);
  res.json({ message: `Đã gửi mã OTP tới ${email}. Mã có hiệu lực ${OTP_SECONDS / 60} phút.`, ...(dev ? { demoOtp: otp } : {}) });
}));

router.post('/register/verify-otp', handle(async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const otp = String(req.body?.otp || '').trim();
  const user = await users().findOne({ email });
  if (!user || user.status !== 'PENDING_OTP' || !user.otpHash) throw new ApiError(400, 'OTP_INVALID', 'Mã OTP không đúng hoặc đã hết hạn.');
  if ((user.otpTries || 0) >= OTP_MAX_TRIES) throw new ApiError(429, 'OTP_LOCKED', 'Nhập sai quá nhiều lần, hãy yêu cầu mã mới.');
  if (Date.parse(user.otpExpiresAt) < Date.now() || hashOtp(otp) !== user.otpHash) {
    await users().updateOne({ _id: user._id }, { $set: { otpTries: (user.otpTries || 0) + 1 } });
    throw new ApiError(400, 'OTP_INVALID', 'Mã OTP không đúng hoặc đã hết hạn.');
  }
  await users().updateOne({ _id: user._id }, { $set: { status: 'ACTIVE', otpHash: null, otpExpiresAt: null, otpTries: 0, verifiedAt: new Date().toISOString() } });
  await startSession(req, user._id);
  res.status(201).json({ user: publicUser({ ...user, status: 'ACTIVE' }) });
}));

/** Đăng nhập nhanh tài khoản mẫu (trang /auth/demo-login) – chỉ bật khi phát triển */
router.post('/demo-login', handle(async (req, res) => {
  if (process.env.NODE_ENV === 'production') throw new ApiError(404, 'NOT_FOUND', 'Không có chức năng này.');
  const user = await users().findOne({ _id: String(req.body?.userId || '') });
  if (!user || user.role !== 'CUSTOMER' || user.status !== 'ACTIVE') throw new ApiError(403, 'CUSTOMER_REQUIRED', 'Tài khoản mẫu không hợp lệ.');
  await startSession(req, user._id);
  res.json({ user: publicUser(user) });
}));

module.exports = router;
module.exports.publicUser = publicUser;
