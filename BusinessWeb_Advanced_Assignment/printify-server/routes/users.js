const express = require('express');
const { getDb } = require('../config/db');
const { requireCustomer } = require('../middlewares/require-customer');
const { handle, ApiError } = require('../utils/shop-common');
const { hashPassword, verifyPassword } = require('../utils/password');

/*
 * C18 – Hồ sơ & sổ địa chỉ (khớp ProfileService):
 *   GET /api/users/me                      -> { profile }
 *   PUT /api/users/me { name, nickname, birthday, avatar, addresses } -> { profile }  (email, hạng thành viên không sửa được)
 *   PUT /api/users/me/password { currentPassword, newPassword } -> 204 (400 sai mật khẩu hiện tại)
 */
const router = express.Router();
const MAX_ADDRESSES = 5;
const PHONE = /^0\d{9}$/;
const users = () => getDb().collection('users');

function toProfile(u) {
  return {
    _id: u._id, name: u.name, email: u.email, role: u.role, status: u.status, avatar: u.avatar ?? null,
    nickname: u.nickname ?? '', birthday: u.birthday ?? null, membership: u.membership ?? { totalSpent: 0, points: 0 },
    addresses: u.addresses ?? [], createdAt: u.createdAt,
  };
}

router.use(requireCustomer);

router.get('/me', handle(async (req, res) => {
  const u = await users().findOne({ _id: req.userId });
  res.json({ profile: toProfile(u) });
}));

router.put('/me', handle(async (req, res) => {
  const b = req.body || {};
  const errors = {};
  const set = {};
  if (b.name !== undefined) {
    set.name = String(b.name).trim();
    if (set.name.length < 2 || set.name.length > 100) errors.name = 'NAME_2_100';
  }
  if (b.nickname !== undefined) {
    set.nickname = String(b.nickname || '').trim();
    if (set.nickname.length > 30) errors.nickname = 'MAX_30';
  }
  if (b.birthday !== undefined) {
    set.birthday = b.birthday ? String(b.birthday) : null;
    if (set.birthday && (!/^\d{4}-\d{2}-\d{2}$/.test(set.birthday) || Date.parse(set.birthday) > Date.now())) errors.birthday = 'INVALID_DATE';
  }
  if (b.avatar !== undefined) {
    set.avatar = b.avatar ? String(b.avatar) : null;
    if (set.avatar && !/^(data:image\/(png|jpe?g|webp);base64,|\/|https?:)/.test(set.avatar)) errors.avatar = 'INVALID_IMAGE';
    if (set.avatar && set.avatar.length > 3_000_000) errors.avatar = 'MAX_2MB';
  }
  if (b.addresses !== undefined) {
    if (!Array.isArray(b.addresses) || b.addresses.length > MAX_ADDRESSES) errors.addresses = 'MAX_5';
    else {
      set.addresses = b.addresses.map((a) => ({
        _id: String(a._id || ''), name: String(a.name || '').trim(), phone: String(a.phone || '').trim(), province: String(a.province || '').trim(),
        ward: String(a.ward || '').trim(), detail: String(a.detail || '').trim(), isDefault: !!a.isDefault,
      }));
      if (set.addresses.some((a) => !a._id || a.name.length < 2 || !PHONE.test(a.phone) || !a.province || !a.ward || !a.detail || a.detail.length > 200)) errors.addresses = 'INVALID_ADDRESS';
      // đúng 1 địa chỉ mặc định nếu có địa chỉ
      if (set.addresses.length && !set.addresses.some((a) => a.isDefault)) set.addresses[0].isDefault = true;
      let seen = false;
      for (const a of set.addresses) { if (a.isDefault) { if (seen) a.isDefault = false; seen = true; } }
    }
  }
  if (Object.keys(errors).length) throw new ApiError(400, 'VALIDATION_ERROR', 'Thông tin chưa hợp lệ.', errors);
  set.updatedAt = new Date().toISOString();
  await users().updateOne({ _id: req.userId }, { $set: set });
  res.json({ profile: toProfile(await users().findOne({ _id: req.userId })) });
}));

router.put('/me/password', handle(async (req, res) => {
  const current = String(req.body?.currentPassword || '');
  const next = String(req.body?.newPassword || '');
  const u = await users().findOne({ _id: req.userId });
  if (!verifyPassword(current, u.passwordHash)) throw new ApiError(400, 'WRONG_PASSWORD', 'Mật khẩu hiện tại không đúng.');
  if (next.length < 8 || !/[A-Za-z]/.test(next) || !/\d/.test(next)) throw new ApiError(400, 'WEAK_PASSWORD', 'Mật khẩu mới ít nhất 8 ký tự, có chữ và số.');
  await users().updateOne({ _id: req.userId }, { $set: { passwordHash: hashPassword(next), updatedAt: new Date().toISOString() } });
  res.status(204).end();
}));

module.exports = router;
