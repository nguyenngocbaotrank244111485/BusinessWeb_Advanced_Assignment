const crypto = require('crypto');

/** Băm mật khẩu bằng scrypt (có sẵn trong Node): "scrypt$<salt>$<hash>" */
function hashPassword(plain) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(plain), salt, 64).toString('hex');
  return ['scrypt', salt, hash].join('$');
}

function verifyPassword(plain, stored) {
  const [algo, salt, hash] = String(stored || '').split('$');
  if (algo !== 'scrypt' || !salt || !hash) return false;
  const test = crypto.scryptSync(String(plain), salt, 64);
  const real = Buffer.from(hash, 'hex');
  return real.length === test.length && crypto.timingSafeEqual(real, test);
}

module.exports = { hashPassword, verifyPassword };
