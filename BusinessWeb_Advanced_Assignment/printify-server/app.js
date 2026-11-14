const express = require('express');
const session = require('express-session');
const helmet = require('helmet');

/**
 * Tạo Express app (tách khỏi index.js để test dùng lại).
 * makeStore(collectionName): kho lưu phiên – chạy thật dùng connect-mongo (collection sessions / adminSessions),
 * test truyền null để dùng bộ nhớ.
 *
 * Hai phiên tách riêng (cùng domain localhost nên cookie dùng chung giữa 2 cổng 4200 / 4300):
 *  - pf.sid        : khách hàng (req.session.userId)  – mọi /api trừ /api/admin
 *  - pf.admin.sid  : nhân viên  (req.session.adminId) – chỉ /api/admin
 */
function buildApp({ secret, makeStore, secureCookie = false }) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(helmet());

  const cookie = { httpOnly: true, sameSite: 'lax', secure: secureCookie, maxAge: 2 * 60 * 60 * 1000 };
  const customerSession = session({ name: 'pf.sid', secret, resave: false, saveUninitialized: false, store: makeStore?.('sessions'), cookie });
  const adminSession = session({ name: 'pf.admin.sid', secret, resave: false, saveUninitialized: false, store: makeStore?.('adminSessions'), cookie: { ...cookie, path: '/api/admin' } });

  app.get('/api/health', (_req, res) => res.json({ status: 'ok', application: 'PrintiFy API' }));

  // ---------- Admin ----------
  app.use('/api/admin', adminSession, express.json({ limit: '2mb' }));
  app.use('/api/admin/auth', require('./routes/admin/auth'));
  app.use('/api/admin/orders', require('./routes/admin/orders'));
  app.use('/api/admin/products', require('./routes/admin/products'));
  app.use('/api/admin/market', require('./routes/admin/market'));
  app.use('/api/admin/survey', require('./routes/admin/survey'));
  app.use('/api/admin', require('./routes/admin/data'));
  app.use('/api/admin', (_req, res) => res.status(404).json({ code: 'NOT_FOUND', message: 'Không có API này.' }));

  // ---------- Customer ----------
  app.use('/api', customerSession);
  app.use('/api/designs', require('./routes/designs')); // tự đặt giới hạn body lớn (ảnh thiết kế)
  app.use('/api', express.json({ limit: '4mb' }));
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/users', require('./routes/users'));
  app.use('/api/config', require('./routes/config'));
  app.use('/api/products', require('./routes/products'));
  app.use('/api/market', require('./routes/market'));
  app.use('/api/cart', require('./routes/cart'));
  app.use('/api/notifications', require('./routes/notifications'));
  app.use('/api/survey', require('./routes/survey'));
  app.use('/api', require('./routes/orders'));
  app.use('/api', (_req, res) => res.status(404).json({ code: 'NOT_FOUND', message: 'Không có API này.' }));

  app.use((err, _req, res, _next) => {
    if (err?.type === 'entity.too.large') return res.status(413).json({ code: 'PAYLOAD_TOO_LARGE', message: 'Dữ liệu gửi lên quá lớn.' });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ code: 'INVALID_JSON', message: 'Dữ liệu không đúng định dạng JSON.' });
    console.error('API error:', err);
    res.status(500).json({ code: 'INTERNAL_SERVER_ERROR', message: 'Lỗi máy chủ, thử lại sau.' });
  });
  return app;
}

module.exports = { buildApp };
