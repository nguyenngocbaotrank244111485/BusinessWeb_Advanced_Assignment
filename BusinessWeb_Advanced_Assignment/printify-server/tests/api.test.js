/*
 * Test API PrintiFy (khách hàng + admin) bằng MongoDB giả lập – không cần cài MongoDB.
 * Dữ liệu nạp bằng ĐÚNG hàm seed() của scripts/seed.js.
 * Chạy: npm test
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { createFakeDb } = require('./helpers/fake-db');

const fake = createFakeDb();
require('../config/db').getDb = () => fake; // phải thay TRƯỚC khi nạp routes
const { seed } = require('../scripts/seed');
const { buildApp } = require('../app');

const CUSTOMER_PW = 'Printify@123';
const ADMIN_PW = 'Admin@123';
const AN = 'an.nguyen@printify.demo'; // usr_c1, hạng Vàng
const CHAU = 'chau.tran@printify.demo'; // usr_c2
const STAFF = 'anntpk24411e@st.uel.edu.vn';
const SUPER = 'trannnbk24411e@st.uel.edu.vn';

let server;
let base;
test.before(async () => {
  process.env.NODE_ENV = 'development';
  await seed({ reset: true, log: () => {} });
  server = buildApp({ secret: 'test-secret-that-is-long-enough-123456' }).listen(0);
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => server.close());

/** Client giữ cookie như trình duyệt (nhiều cookie: pf.sid, pf.admin.sid) */
function client() {
  const jar = new Map();
  return async (method, url, body) => {
    const res = await fetch(base + url, {
      method, headers: { 'content-type': 'application/json', ...(jar.size ? { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    for (const c of res.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); jar.set(kv.slice(0, i), kv.slice(i + 1)); }
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };
}
async function loginCustomer(email) { const c = client(); assert.equal((await c('POST', '/api/auth/login', { email, password: CUSTOMER_PW })).status, 200); return c; }
async function loginAdmin(email) { const c = client(); assert.equal((await c('POST', '/api/admin/auth/login', { email, password: ADMIN_PW })).status, 200); return c; }
const stock = async (pid, vid) => (await fake.collection('products').findOne({ _id: pid })).variants.find((v) => v._id === vid).stock;

test('Seed: đủ collection, mật khẩu đã băm, index chống trùng', async () => {
  const u = await fake.collection('users').findOne({ email: AN });
  assert.ok(u.passwordHash.startsWith('scrypt$'));
  assert.equal(u.password, undefined);
  assert.equal(await fake.collection('products').countDocuments({}), 42);
  assert.ok(await fake.collection('orders').countDocuments({}) >= 13);
  assert.equal(await fake.collection('surveyQuestions').countDocuments({}), 20);
  assert.equal(await fake.collection('users').countDocuments({ role: 'SUPERADMIN' }), 1);
  await assert.rejects(fake.collection('users').insertOne({ _id: 'x', email: AN }), (e) => e.code === 11000);
  // chạy seed thường lần 2: không nhân đôi, không ghi đè
  await fake.collection('products').updateOne({ _id: 'prd101' }, { $set: { price: 199000 } });
  await seed({ log: () => {} });
  assert.equal(await fake.collection('products').countDocuments({}), 42);
  assert.equal((await fake.collection('products').findOne({ _id: 'prd101' })).price, 199000, 'seed thường không ghi đè dữ liệu đã sửa');
  await fake.collection('products').updateOne({ _id: 'prd101' }, { $set: { price: 180000 } });
});

test('Đăng nhập khách: sai mật khẩu, khóa sau 5 lần, /me, đăng xuất, đăng ký OTP', async () => {
  const c = client();
  assert.equal((await c('GET', '/api/auth/me')).status, 401);
  assert.equal((await c('POST', '/api/auth/login', { email: AN, password: 'sai' })).status, 401);
  assert.equal((await c('POST', '/api/auth/login', { email: STAFF, password: ADMIN_PW })).status, 403, 'tài khoản nhân viên không dùng cho trang khách');
  const ok = await c('POST', '/api/auth/login', { email: AN.toUpperCase(), password: CUSTOMER_PW });
  assert.equal(ok.body.user._id, 'usr_c1');
  assert.equal(ok.body.user.passwordHash, undefined);
  assert.equal((await c('GET', '/api/auth/me')).body.user.email, AN);
  assert.equal((await c('POST', '/api/auth/logout')).status, 204);
  assert.equal((await c('GET', '/api/auth/me')).status, 401);

  const t = client();
  for (let i = 0; i < 5; i++) await t('POST', '/api/auth/login', { email: 'anh.vu@printify.demo', password: 'sai' });
  assert.equal((await t('POST', '/api/auth/login', { email: 'anh.vu@printify.demo', password: CUSTOMER_PW })).status, 429, 'khóa 10 phút');

  const r = client();
  assert.equal((await r('POST', '/api/auth/register/request-otp', { name: 'Khách Mới', email: AN, password: 'Abcdef12' })).status, 409);
  const otp = await r('POST', '/api/auth/register/request-otp', { name: 'Khách Mới', email: 'moi@printify.demo', password: 'Abcdef12' });
  assert.equal(otp.status, 200);
  assert.match(otp.body.demoOtp, /^\d{6}$/);
  assert.equal((await r('POST', '/api/auth/register/request-otp', { name: 'Khách Mới', email: 'moi@printify.demo', password: 'Abcdef12' })).status, 429, 'chờ 60s mới gửi lại');
  assert.equal((await r('POST', '/api/auth/register/verify-otp', { email: 'moi@printify.demo', otp: '000000' === otp.body.demoOtp ? '111111' : '000000' })).status, 400);
  const v = await r('POST', '/api/auth/register/verify-otp', { email: 'moi@printify.demo', otp: otp.body.demoOtp });
  assert.equal(v.status, 201);
  assert.equal((await r('GET', '/api/auth/me')).body.user.status, 'ACTIVE');
});

test('Hồ sơ C18: sửa thông tin, sổ địa chỉ tối đa 5, đúng 1 mặc định, đổi mật khẩu', async () => {
  const c = await loginCustomer(CHAU);
  const me = (await c('GET', '/api/users/me')).body.profile;
  assert.equal(me.email, CHAU);
  const addr = (i, d) => ({ _id: 'adr_t' + i, name: 'Châu', phone: '0912345678', province: 'Hà Nội', ward: 'Phường A', detail: i + ' Tràng Tiền', isDefault: d });
  assert.equal((await c('PUT', '/api/users/me', { addresses: [1, 2, 3, 4, 5, 6].map((i) => addr(i, false)) })).status, 400);
  assert.equal((await c('PUT', '/api/users/me', { addresses: [{ ...addr(1, true), phone: '123' }] })).status, 400);
  const r = await c('PUT', '/api/users/me', { nickname: 'Châu xinh', addresses: [addr(1, true), addr(2, true)] });
  assert.equal(r.status, 200);
  assert.equal(r.body.profile.addresses.filter((a) => a.isDefault).length, 1);
  assert.equal((await c('PUT', '/api/users/me', { email: 'doi@x.com', name: 'Trần Bảo Châu' })).body.profile.email, CHAU, 'không đổi được email');
  assert.equal((await c('PUT', '/api/users/me/password', { currentPassword: 'sai', newPassword: 'Moi12345' })).status, 400);
  assert.equal((await c('PUT', '/api/users/me/password', { currentPassword: CUSTOMER_PW, newPassword: 'Moi12345' })).status, 204);
  assert.equal((await client()('POST', '/api/auth/login', { email: CHAU, password: 'Moi12345' })).status, 200);
  await c('PUT', '/api/users/me/password', { currentPassword: 'Moi12345', newPassword: CUSTOMER_PW });
});

test('Giỏ C12: lưu MongoDB, server tự kiểm tra từng dòng, giữ giá lúc thêm', async () => {
  const c = await loginCustomer(AN);
  const r = await c('PUT', '/api/cart', { items: [
    { productId: 'prd101', variantId: 'prd101-white-m', qty: 2, unitPrice: 1 }, // giá giả từ trình duyệt -> bỏ qua
    { productId: 'khong-co', variantId: 'x', qty: 1 },
    { productId: 'prd301', variantId: 'prd301-white', qty: 1, designId: 'dsg_c2_tee_art' }, // thiết kế người khác -> bỏ
    { productId: 'prd101', variantId: 'prd101-white-m', qty: 1 }, // trùng dòng -> cộng dồn
  ] });
  assert.equal(r.status, 200);
  assert.equal(r.body.items.length, 1);
  assert.equal(r.body.items[0].qty, 3);
  assert.equal(r.body.items[0].unitPrice, 180000);
  assert.equal((await fake.collection('carts').findOne({ userId: 'usr_c1' })).items.length, 1, 'đã lưu vào collection carts');
  await fake.collection('products').updateOne({ _id: 'prd101' }, { $set: { price: 185000 } });
  let g = await c('GET', '/api/cart');
  assert.equal(g.body.items[0].issue, 'PRICE_CHANGED');
  g = await c('PUT', '/api/cart', { items: [{ ...g.body.items[0], acceptPrice: true }] });
  assert.equal(g.body.items[0].issue, '');
  await fake.collection('products').updateOne({ _id: 'prd101' }, { $set: { price: 180000 } });
  await c('PUT', '/api/cart', { items: [] });
});

test('Đặt đơn C13 → Admin xử lý trọn vòng đời: trừ kho đúng 1 lần, hạng thành viên, thông báo', async () => {
  const an = await loginCustomer(AN);
  await an('PUT', '/api/cart', { items: [{ productId: 'prd101', variantId: 'prd101-white-m', qty: 2 }, { productId: 'prd101', variantId: 'prd101-white-l', qty: 1, designId: 'dsg_c1_tee' }] });
  const q = await an('POST', '/api/checkout/quote');
  assert.equal(q.body.tier.key, 'GOLD');
  assert.equal(q.body.totals.discount, Math.round(180000 * 3 * 0.05), 'hạng Vàng giảm 5% tiền hàng');
  const ship = { name: 'Nguyễn Minh An', phone: '0901234567', province: 'TP. Hồ Chí Minh', ward: 'Phường Bến Nghé', detail: '12 Nguyễn Huệ' };
  assert.equal((await an('POST', '/api/orders', { shippingInfo: { ...ship, phone: '12' }, idempotencyKey: 'key-test-0001' })).status, 400);
  const before = await stock('prd101', 'prd101-white-m');
  const o1 = await an('POST', '/api/orders', { shippingInfo: ship, idempotencyKey: 'key-test-0001', paymentMethod: 'MOMO' });
  assert.equal(o1.status, 201);
  const id = o1.body.order._id;
  assert.equal(await stock('prd101', 'prd101-white-m'), before, 'tạo đơn KHÔNG trừ kho');
  assert.equal((await an('POST', '/api/orders', { shippingInfo: ship, idempotencyKey: 'key-test-0001' })).body.order._id, id, 'bấm 2 lần = 1 đơn');
  assert.equal((await an('GET', '/api/cart')).body.items.length, 0, 'giỏ bỏ dòng đã đặt');
  assert.equal((await an('POST', `/api/orders/${id}/payment-claim`)).body.order.paymentStatus, 'WAITING_STAFF');

  // Admin
  assert.equal((await client()('POST', '/api/admin/orders/' + id + '/payment-review', { decision: 'APPROVE' })).status, 401, 'chưa đăng nhập admin');
  assert.equal((await an('POST', '/api/admin/orders/' + id + '/payment-review', { decision: 'APPROVE' })).status, 401, 'phiên khách không dùng được cho admin');
  assert.equal((await client()('POST', '/api/admin/auth/login', { email: AN, password: CUSTOMER_PW })).status, 401, 'khách không vào được admin');
  const staff = await loginAdmin(STAFF);
  const ap = await staff('POST', `/api/admin/orders/${id}/payment-review`, { decision: 'APPROVE' });
  assert.equal(ap.status, 200);
  assert.equal(ap.body.order.orderStatus, 'DESIGN_REVIEW');
  assert.equal(await stock('prd101', 'prd101-white-m'), before - 2, 'trừ kho khi xác nhận thanh toán');
  assert.equal((await staff('POST', `/api/admin/orders/${id}/payment-review`, { decision: 'APPROVE' })).status, 409, 'bấm lần 2 bị chặn');
  assert.equal(await stock('prd101', 'prd101-white-m'), before - 2, 'không trừ 2 lần');
  assert.equal(await fake.collection('inventoryMovements').countDocuments({ originalOrderId: id, type: 'ORDER_DEDUCTION' }), 2);

  const item = ap.body.order.items.find((i) => i.designId);
  assert.equal((await staff('POST', `/api/admin/orders/${id}/items/${item.orderItemId}/design-review`, { decision: 'REJECT' })).status, 400, 'thiếu lý do');
  await staff('POST', `/api/admin/orders/${id}/items/${item.orderItemId}/design-review`, { decision: 'REJECT', reason: 'Chữ sát mép vùng in' });
  let notes = (await an('GET', '/api/notifications')).body.items;
  assert.ok(notes.some((n) => n.type === 'DESIGN_REJECTED'), 'khách nhận thông báo cần sửa mẫu');
  assert.equal((await an('POST', `/api/orders/${id}/items/${item.orderItemId}/resubmit`, { designId: 'dsg_c1_tee' })).status, 200);
  const ok = await staff('POST', `/api/admin/orders/${id}/items/${item.orderItemId}/design-review`, { decision: 'APPROVE' });
  assert.equal(ok.body.order.orderStatus, 'SAMPLE_PRINTING');
  assert.equal((await an('POST', `/api/orders/${id}/cancel`, { reason: 'Đặt sai số lượng' })).status, 200, 'chưa in mẫu: được xin hủy');
  await staff('POST', `/api/admin/orders/${id}/cancel-request`, { decision: 'REJECT', note: 'Đơn đã chuẩn bị in' });
  assert.equal((await staff('POST', `/api/admin/orders/${id}/sample-complete`, { photoUrl: '/x.png' })).status, 409, 'phải bắt đầu in mẫu trước');
  await staff('POST', `/api/admin/orders/${id}/sample-start`);
  assert.equal((await an('POST', `/api/orders/${id}/cancel`, { reason: 'Đặt sai số lượng' })).status, 409, 'đã in mẫu: khóa hủy');
  assert.equal((await staff('POST', `/api/admin/orders/${id}/sample-complete`, {})).status, 400, 'thiếu ảnh mẫu');
  assert.equal((await staff('POST', `/api/admin/orders/${id}/sample-complete`, { photoUrl: '/uploads/designs/dsg_c1_tee.png' })).body.order.orderStatus, 'SAMPLE_REVIEW');
  assert.equal((await an('POST', `/api/orders/${id}/items/${item.orderItemId}/approve-sample`)).body.order.orderStatus, 'PRINT_CONFIRMED');
  await staff('POST', `/api/admin/orders/${id}/print-complete`);
  assert.equal((await staff('POST', `/api/admin/orders/${id}/ship`, { trackingCode: '' })).status, 400);
  await staff('POST', `/api/admin/orders/${id}/ship`, { trackingCode: 'PF12345678' });
  const spentBefore = (await fake.collection('users').findOne({ _id: 'usr_c1' })).membership.totalSpent;
  const done = await staff('POST', `/api/admin/orders/${id}/deliver`);
  assert.equal(done.body.order.orderStatus, 'COMPLETED');
  assert.equal((await fake.collection('users').findOne({ _id: 'usr_c1' })).membership.totalSpent, spentBefore + done.body.order.totals.total, 'cộng chi tiêu cho hạng thành viên');
  assert.equal((await an('POST', `/api/orders/${id}/received`)).body.order.receivedAt !== null, true);
  assert.equal((await an('POST', `/api/orders/${id}/review`, { rating: 5, comment: 'Đẹp' })).status, 200);
  assert.equal((await an('POST', `/api/orders/${id}/review`, { rating: 4 })).status, 409, 'đánh giá 1 lần');
  assert.ok((await fake.collection('auditLogs').countDocuments({ targetId: id })) >= 6, 'mọi thao tác admin có nhật ký');
});

test('Hủy đơn đã thanh toán: hoàn kho đúng 1 lần; thiếu hàng thì không trừ dở dang', async () => {
  const chau = await loginCustomer(CHAU);
  const staff = await loginAdmin(STAFF);
  const ship = { name: 'Châu', phone: '0912345678', province: 'Hà Nội', ward: 'Phường A', detail: '45 Lê Lợi' };
  // đơn phôi trơn: thanh toán xong đi thẳng "Đang in" -> khách không hủy được nữa
  await chau('PUT', '/api/cart', { items: [{ productId: 'prd301', variantId: 'prd301-white', qty: 1 }] });
  const plain = (await chau('POST', '/api/orders', { shippingInfo: ship, idempotencyKey: 'key-chau-plain' })).body.order._id;
  await chau('POST', `/api/orders/${plain}/payment-claim`);
  assert.equal((await staff('POST', `/api/admin/orders/${plain}/payment-review`, { decision: 'APPROVE' })).body.order.orderStatus, 'PRINT_CONFIRMED');
  assert.equal((await chau('POST', `/api/orders/${plain}/cancel`, { reason: 'Đặt sai số lượng' })).status, 409);
  // đơn có thiết kế: còn ở bước kiểm tra mẫu -> hủy được, hoàn kho
  const dsg = await fake.collection('designs').findOne({ userId: 'usr_c2' });
  const dp = await fake.collection('products').findOne({ _id: dsg.productId });
  await chau('PUT', '/api/cart', { items: [{ productId: dp._id, variantId: dp.variants.find((v) => v.stock >= 2)._id, qty: 2, designId: dsg._id }] });
  const created = await chau('POST', '/api/orders', { shippingInfo: ship, idempotencyKey: 'key-chau-0001' });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const id = created.body.order._id;
  const it = (await fake.collection('orders').findOne({ _id: id })).items[0];
  const s0 = await stock(it.productId, it.variantId);
  await chau('POST', `/api/orders/${id}/payment-claim`);
  await staff('POST', `/api/admin/orders/${id}/payment-review`, { decision: 'APPROVE' });
  assert.equal(await stock(it.productId, it.variantId), s0 - 2);
  await chau('POST', `/api/orders/${id}/cancel`, { reason: 'Tìm được lựa chọn khác' });
  const r = await staff('POST', `/api/admin/orders/${id}/cancel-request`, { decision: 'APPROVE' });
  assert.equal(r.body.order.orderStatus, 'CANCELLED');
  assert.equal(await stock(it.productId, it.variantId), s0, 'hoàn kho');
  assert.equal((await staff('POST', `/api/admin/orders/${id}/cancel-request`, { decision: 'APPROVE' })).status, 409);
  assert.equal(await stock(it.productId, it.variantId), s0, 'không hoàn 2 lần');

  // thiếu hàng: 2 dòng, dòng sau không đủ -> không trừ dòng nào
  const p = await fake.collection('products').findOne({ _id: 'prd404' });
  const v = p.variants[0];
  await chau('PUT', '/api/cart', { items: [{ productId: 'prd101', variantId: 'prd101-black-m', qty: 1 }, { productId: 'prd404', variantId: v._id, qty: v.stock }] });
  const id2 = (await chau('POST', '/api/orders', { shippingInfo: ship, idempotencyKey: 'key-chau-0002' })).body.order._id;
  await chau('POST', `/api/orders/${id2}/payment-claim`);
  const tee = await stock('prd101', 'prd101-black-m');
  await fake.collection('products').updateOne({ _id: 'prd404' }, { $set: { variants: p.variants.map((x) => (x._id === v._id ? { ...x, stock: 1 } : x)) } });
  const fail = await staff('POST', `/api/admin/orders/${id2}/payment-review`, { decision: 'APPROVE' });
  assert.equal(fail.status, 409);
  assert.equal(fail.body.code, 'INSUFFICIENT_STOCK');
  assert.equal(await stock('prd101', 'prd101-black-m'), tee, 'không trừ dở dang');
  const rej = await staff('POST', `/api/admin/orders/${id2}/payment-review`, { decision: 'REJECT', reason: 'Hết hàng bưu thiếp' });
  assert.equal(rej.body.order.paymentStatus, 'REJECTED');
});

test('Phân quyền admin: STAFF không sửa sản phẩm / duyệt tin; SUPERADMIN làm được', async () => {
  const staff = await loginAdmin(STAFF);
  const sa = await loginAdmin(SUPER);
  assert.equal((await staff('PUT', '/api/admin/products/prd101', { price: 1 })).status, 403);
  assert.equal((await staff('POST', '/api/admin/market/listings/lst_110/review', { decision: 'APPROVE' })).status, 403);
  assert.equal((await staff('GET', '/api/admin/data')).status, 200, 'STAFF vẫn xem được dữ liệu');
  assert.equal((await sa('PUT', '/api/admin/products/prd101', { price: 500 })).status, 400, 'giá không hợp lệ');
  assert.equal((await sa('PUT', '/api/admin/products/prd101', { printArea: { x: 0.8, y: 0.1, width: 0.5, height: 0.3 } })).status, 400, 'vùng in tràn ảnh');
  const c = await sa('POST', '/api/admin/products', { name: 'Áo test admin', category: 'ao-thun', price: 150000, description: 'Sản phẩm tạo từ test', variants: [{ color: 'white', size: 'M', stock: 12 }] });
  assert.equal(c.status, 201);
  assert.equal(c.body.product.variants[0].stock, 12);
  assert.equal(await fake.collection('inventoryMovements').countDocuments({ productId: c.body.product._id, type: 'INITIAL_STOCK' }), 1);
  assert.equal((await client()('GET', '/api/products/' + c.body.product.slug)).status, 200, 'khách thấy sản phẩm mới ngay');
  const vid = c.body.product.variants[0]._id;
  assert.equal((await staff('PATCH', `/api/admin/products/${c.body.product._id}/stock`, { variantId: vid, delta: -20, reason: 'kiểm kê' })).status, 409, 'không âm kho');
  assert.equal((await staff('PATCH', `/api/admin/products/${c.body.product._id}/stock`, { variantId: vid, delta: 5 })).status, 400, 'thiếu lý do');
  assert.equal((await staff('PATCH', `/api/admin/products/${c.body.product._id}/stock`, { variantId: vid, delta: 5, reason: 'nhập lô' })).body.product.variants[0].stock, 17);
  assert.equal((await sa('PUT', `/api/admin/products/${c.body.product._id}`, { isActive: false })).status, 200);
  assert.equal((await client()('GET', '/api/products/' + c.body.product.slug)).status, 404, 'ẩn thì khách không thấy');
});

test('Marketplace: khách báo cáo → SUPERADMIN gỡ tin, người bán và người báo nhận thông báo', async () => {
  const an = await loginCustomer(AN);
  const sa = await loginAdmin(SUPER);
  const lst = await fake.collection('listings').findOne({ _id: 'lst_107' });
  assert.equal((await an('POST', '/api/market/lst_107/reports', { reason: 'Sao chép thiết kế của tôi', description: 'Giống hệt hình tôi đã vẽ' })).status, 201);
  const rep = await fake.collection('copyrightReports').findOne({ listingId: 'lst_107', reporterId: 'usr_c1' });
  assert.equal((await sa('POST', `/api/admin/market/reports/${rep._id}`, { decision: 'TAKEDOWN' })).status, 400, 'thiếu ghi chú');
  const r = await sa('POST', `/api/admin/market/reports/${rep._id}`, { decision: 'TAKEDOWN', note: 'Xác minh đúng là sao chép' });
  assert.equal(r.body.listing.status, 'UNLISTED');
  assert.ok(r.body.reports.every((x) => x.status !== 'OPEN'));
  assert.ok(await fake.collection('notifications').findOne({ userId: lst.sellerId, type: 'LISTING_REJECTED' }));
  assert.ok(await fake.collection('notifications').findOne({ userId: 'usr_c1', type: 'REPORT_RESULT' }));
  assert.equal((await client()('GET', '/api/market/lst_107')).status, 404, 'tin đã gỡ không còn công khai');
  // duyệt tin chờ duyệt
  const pending = await fake.collection('listings').findOne({ status: 'PENDING_REVIEW' });
  assert.equal((await sa('POST', `/api/admin/market/listings/${pending._id}/review`, { decision: 'REJECT' })).status, 400);
  assert.equal((await sa('POST', `/api/admin/market/listings/${pending._id}/review`, { decision: 'APPROVE' })).body.listing.status, 'APPROVED');
  assert.equal((await client()('GET', `/api/market/${pending._id}`)).status, 200);
});

test('Thiết kế C10/C11: lưu, sửa, sao chép, không xóa khi đang bán; khảo sát cần đăng nhập thật', async () => {
  const an = await loginCustomer(AN);
  const chau = await loginCustomer(CHAU);
  const doc = { productId: 'prd101', previewUrl: 'data:image/png;base64,iVBORw0KGgo=', canvasJSON: { version: '5.3.1', objects: [] } };
  assert.equal((await an('PUT', '/api/designs/dsg_testnew1', doc)).status, 201);
  assert.equal((await an('PUT', '/api/designs/dsg_testnew1', { ...doc, color: 'black' })).status, 200);
  assert.equal((await chau('PUT', '/api/designs/dsg_testnew1', doc)).status, 403, 'không ghi đè thiết kế người khác');
  assert.equal((await chau('GET', '/api/designs/dsg_testnew1')).status, 404);
  assert.equal((await an('PUT', '/api/designs/dsg_testnew2', { ...doc, previewUrl: 'javascript:alert(1)' })).status, 400);
  const copy = await an('POST', '/api/designs/dsg_testnew1/copy');
  assert.equal(copy.status, 201);
  assert.equal((await an('DELETE', '/api/designs/' + copy.body.design._id)).status, 204);
  const listed = await fake.collection('listings').findOne({ sellerId: 'usr_c1', status: 'APPROVED' });
  assert.equal((await an('DELETE', '/api/designs/' + listed.designId)).status, 409, 'đang bán thì không xóa');
  assert.equal((await client()('GET', '/api/survey/questions')).status, 401);
  const s = await chau('GET', '/api/survey/questions');
  assert.equal(s.status, 200);
  assert.equal(s.body.questions.length, 20);
});

test('Admin: dữ liệu tổng hợp, phiếu khảo sát ẩn danh, dashboard', async () => {
  const staff = await loginAdmin(STAFF);
  const d = (await staff('GET', '/api/admin/data')).body;
  assert.ok(d.products.length >= 42 && d.orders.length >= 13 && d.listings.length >= 14);
  assert.ok(d.surveyResponses.every((r) => r.userId === 'anon'));
  assert.ok(d.users.every((u) => u.passwordHash === undefined), 'không lộ mật khẩu');
  assert.ok(d.orders.every((o) => o.idempotencyKey === undefined));
  const dash = (await staff('GET', '/api/admin/dashboard?from=2026-11-01&to=2026-12-31')).body;
  assert.ok(dash.orderCount > 0 && dash.paidRevenue > 0 && dash.tamSurveyResponses >= 30);
  assert.equal((await staff('POST', '/api/admin/auth/logout')).status, 204);
  assert.equal((await staff('GET', '/api/admin/data')).status, 401);
});
