require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { connectDb, getDb } = require('../config/db');
const { stripAccents, toSlug } = require('../utils/shop-common');
const { hashPassword } = require('../utils/password');

/*
 * Nạp dữ liệu mẫu cho database PrintiFy (tên DB lấy từ .env: DB_NAME, mặc định "printify").
 *   npm run seed         -> chỉ THÊM dữ liệu còn thiếu, không ghi đè dữ liệu m đã sửa (sản phẩm, đơn, tin đăng...)
 *   npm run seed:reset   -> XÓA sạch các collection của PrintiFy rồi nạp lại từ đầu (chỉ database PrintiFy, không đụng DB khác)
 * Nguồn: chính các file JSON nhóm đang dùng trong printify-customer / printify-admin / printify-server/seeds.
 * Mật khẩu demo: khách hàng Printify@123, nhân viên Admin@123 (đổi bằng biến môi trường DEMO_PASSWORD / ADMIN_PASSWORD).
 */
const ROOT = path.join(__dirname, '..', '..');
const CUSTOMER = path.join(ROOT, 'printify-customer', 'public', 'dataset');
const ADMIN = path.join(ROOT, 'printify-admin', 'public', 'dataset');
const SERVER = path.join(__dirname, '..', 'seeds');
const CUSTOMER_PASSWORD = process.env.DEMO_PASSWORD || 'Printify@123';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@123';

const COLLECTIONS = ['users', 'products', 'orders', 'carts', 'designs', 'listings', 'designSales', 'copyrightReports', 'inventoryMovements',
  'notifications', 'surveyQuestions', 'surveyResponses', 'auditLogs', 'appConfig', 'sessions', 'adminSessions'];

function read(dir, file, fallback = []) {
  const p = path.join(dir, file);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : fallback;
}
const byId = (list) => [...new Map(list.map((x) => [x._id, x])).values()];

async function put(name, docs) {
  if (!docs.length) return 0;
  // RESET: insert mới; thường: $setOnInsert = chỉ thêm document chưa có, giữ nguyên dữ liệu đã sửa
  await getDb().collection(name).bulkWrite(docs.map(({ _id, ...rest }) => ({ updateOne: { filter: { _id }, update: { $setOnInsert: rest }, upsert: true } })));
  return docs.length;
}

async function seed({ reset = false, log = console.log } = {}) {
  const db = getDb();
  if (reset) {
    for (const c of COLLECTIONS) await db.collection(c).deleteMany({});
    log('Đã xóa dữ liệu cũ của PrintiFy (database ' + db.databaseName + ').');
  }
  const now = new Date().toISOString();
  const customerHash = hashPassword(CUSTOMER_PASSWORD);
  const adminHash = hashPassword(ADMIN_PASSWORD);

  // ---------- users: khách hàng + nhân viên ----------
  const customers = read(CUSTOMER, 'users-public.json').map((u) => ({
    ...u, email: u.email.toLowerCase(), role: 'CUSTOMER', status: u.status || 'ACTIVE', passwordHash: customerHash,
    avatar: u.avatar ?? null, addresses: u.addresses ?? [], membership: u.membership ?? { totalSpent: 0, points: 0 },
    failedLogins: 0, lockedUntil: null, createdAt: u.createdAt || now,
  }));
  const staff = read(ADMIN, 'user-admin.json').map((u) => ({
    _id: u._id, name: u.name, email: u.email.toLowerCase(), role: u.role, admin_code: u.admin_code, status: 'ACTIVE',
    passwordHash: adminHash, failedLogins: 0, lockedUntil: null, createdAt: now,
  }));
  const nUsers = await put('users', byId([...customers, ...staff]));

  // ---------- products (bản Admin: có isActive, ngưỡng, vùng in) ----------
  const products = read(ADMIN, 'products.json').map((p) => ({
    ...p, slug: p.slug || toSlug(p.name), searchName: stripAccents(p.name), searchText: stripAccents([p.name, p.description].join(' ')),
    isActive: p.isActive ?? true, allowCustomization: p.allowCustomization ?? true, allowMarketplace: p.allowMarketplace ?? true,
    lowStockThreshold: p.lowStockThreshold ?? 5, img_detail: p.img_detail ?? [], stockVersion: 0, createdAt: p.createdAt || now, updatedAt: p.updatedAt || now,
  }));
  const nProducts = await put('products', products);
  const price = new Map(products.map((p) => [p._id, p.price]));

  // ---------- đơn, giỏ, thiết kế, Marketplace ----------
  const orders = read(CUSTOMER, 'orders.json').map((o) => ({
    ...o, idempotencyKey: o.idempotencyKey || 'seed_' + o._id, timeline: o.timeline ?? [], cancelRequest: o.cancelRequest ?? null,
    paymentExpiresAt: o.paymentExpiresAt || new Date(Date.parse(o.paymentOpenedAt || o.createdAt) + 10 * 60000).toISOString(),
    updatedAt: o.updatedAt || o.createdAt,
  }));
  const carts = read(CUSTOMER, 'carts.json').map((c) => ({
    ...c, items: (c.items || []).map((i) => ({ ...i, unitPrice: i.unitPrice ?? price.get(i.productId) ?? 0, addedAt: i.addedAt || c.updatedAt || now })),
  }));
  const designs = byId([...read(CUSTOMER, 'designs.json'), ...read(CUSTOMER, 'designs-demo.json')]).map((d) => ({ ...d, updatedAt: d.updatedAt || d.createdAt }));
  const listings = byId([...read(CUSTOMER, 'listings.json'), ...read(CUSTOMER, 'listings-demo.json')]).map((l) => ({
    ...l, updatedAt: l.updatedAt || l.createdAt, searchText: stripAccents([l.title, l.description, ...(l.tags || [])].join(' ')),
  }));
  const sales = byId([...read(CUSTOMER, 'designSales.json'), ...read(CUSTOMER, 'designSales-demo.json')]);
  const counts = {
    orders: await put('orders', orders), carts: await put('carts', carts), designs: await put('designs', designs),
    listings: await put('listings', listings), designSales: await put('designSales', sales),
    copyrightReports: await put('copyrightReports', read(ADMIN, 'copyrightReports.json')),
    notifications: await put('notifications', read(CUSTOMER, 'notifications.json')),
    auditLogs: await put('auditLogs', read(ADMIN, 'auditLogs.json')),
  };

  // ---------- khảo sát TAM ----------
  const questions = read(SERVER, 'surveyQuestion.json');
  counts.surveyQuestions = await put('surveyQuestions', questions);
  const responses = [...read(CUSTOMER, 'surveyResponses.json'), ...read(ADMIN, 'surveyResponses-demo.json')];
  counts.surveyResponses = await put('surveyResponses', byId(responses));

  // ---------- cấu hình công khai ----------
  const cfg = read(CUSTOMER, 'appConfig.json', {});
  await db.collection('appConfig').updateOne({ _id: 'public' }, { $setOnInsert: {
    shippingFeeVnd: cfg.shippingFeeVnd ?? 20000, platformFeeRate: cfg.platformFeeRate ?? 0.1, orderPaymentMinutes: cfg.orderPaymentMinutes ?? 10,
    qrImageUrl: cfg.qrImageUrl ?? '/dataset/images/qr/printify-qr.png',
  } }, { upsert: true });

  // ---------- index: luật chống trùng nằm ngay trong database ----------
  await Promise.all([
    db.collection('users').createIndex({ email: 1 }, { unique: true }),
    db.collection('products').createIndex({ slug: 1 }, { unique: true }),
    db.collection('products').createIndex({ isActive: 1, category: 1, price: 1 }),
    db.collection('orders').createIndex({ userId: 1, idempotencyKey: 1 }, { unique: true }),
    db.collection('orders').createIndex({ userId: 1, createdAt: -1 }),
    db.collection('orders').createIndex({ orderStatus: 1 }),
    db.collection('carts').createIndex({ userId: 1 }, { unique: true }),
    db.collection('designs').createIndex({ userId: 1 }),
    db.collection('listings').createIndex({ status: 1, createdAt: -1 }),
    db.collection('listings').createIndex({ sellerId: 1 }),
    db.collection('designSales').createIndex({ listingId: 1 }),
    db.collection('copyrightReports').createIndex({ listingId: 1, reporterId: 1 }, { unique: true }),
    db.collection('inventoryMovements').createIndex({ dedupeKey: 1 }, { unique: true }),
    db.collection('inventoryMovements').createIndex({ productId: 1, recordedAt: -1 }),
    db.collection('notifications').createIndex({ userId: 1, createdAt: -1 }),
    db.collection('surveyResponses').createIndex({ userId: 1 }, { unique: true }),
  ]);

  log(`Database "${db.databaseName}": ${nUsers} tài khoản, ${nProducts} sản phẩm, ` +
    Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ') + '.');
  log(`Đăng nhập khách: email trong users-public.json, mật khẩu ${CUSTOMER_PASSWORD}`);
  log(`Đăng nhập admin: email trong user-admin.json, mật khẩu ${ADMIN_PASSWORD}`);
}

module.exports = { seed, CUSTOMER_PASSWORD, ADMIN_PASSWORD };

if (require.main === module) {
  connectDb()
    .then(() => seed({ reset: process.argv.includes('--reset') }))
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Nạp dữ liệu thất bại:', error.message);
      console.error('Kiểm tra MongoDB đã chạy chưa (Compass kết nối được mongodb://127.0.0.1:27017) và file .env.');
      process.exit(1);
    });
}
