#!/usr/bin/env node
/**
 * PrintiFy - kiểm tra seed dataset (không cần cài thêm package).
 *
 * Cách chạy (từ thư mục printify-server):
 *   node scripts/validate-seed.js ../printify-customer/public/dataset
 *   node scripts/validate-seed.js ../printify-customer/public/dataset --compare=../printify-admin/public/dataset
 *   node scripts/validate-seed.js ../printify-customer/public/dataset --dd=docs/PrintiFy_DataDictionary_V4_2.json
 *
 * Mã thoát: 0 = không có ERROR (có thể có WARN), 1 = có ERROR.
 * Tên file -> entity: bỏ đuôi .json và hậu tố "-public" (users-public.json -> users).
 */
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const opt = (name) => (args.find((a) => a.startsWith(`--${name}=`)) || '').split('=').slice(1).join('=');
const dir = path.resolve(args.find((a) => !a.startsWith('--')) || path.join(__dirname, '..', 'seed'));
const cmpDir = opt('compare') ? path.resolve(opt('compare')) : null;
const ddPath = path.resolve(opt('dd') || path.join(__dirname, '..', 'docs', 'PrintiFy_DataDictionary_V4_2.json'));

const problems = []; // {level, entity, id, msg}
const E = (entity, id, msg) => problems.push({ level: 'ERROR', entity, id, msg });
const W = (entity, id, msg) => problems.push({ level: 'WARN', entity, id, msg });

// ------------------------------------------------------------------ load
if (!fs.existsSync(dir)) { console.error('Không thấy thư mục:', dir); process.exit(2); }
const data = {};   // entity -> array
const fileOf = {}; // entity -> filename
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
  const entity = f.replace(/\.json$/, '').replace(/-public$/, '');
  if (entity === 'datasets-manifest') continue;
  try {
    let j = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
    if (!Array.isArray(j)) j = [j];
    data[entity] = j; fileOf[entity] = f;
  } catch (e) { E(f, '-', `JSON không đọc được: ${e.message}`); }
}
const A = (n) => data[n] || [];
const byId = (n) => new Map(A(n).map((d) => [d._id, d]));
const cfg = Object.assign({ discountRate: 0.05, discountThresholdVnd: 5000000, shippingFeeVnd: 20000, platformFeeRate: 0.10,
  returnWindowDays: 7, maxReturnsPerOrder: 2, orderPaymentMinutes: 10, staffReviewHours: 24 }, (A('appConfig')[0] || {}));
if (!data.appConfig) W('appConfig', '-', 'Thiếu appConfig.json, dùng giá trị mặc định để kiểm tra công thức');

const users = byId('users'), products = byId('products'), orders = byId('orders'), designs = byId('designs'),
  listings = byId('listings'), surveyQs = byId('surveyQuestions'), returns = byId('returnRequests');
const variants = new Map(); // variantId -> {product, variant}

const need = (entity, id, map, key, val, label) => {
  if (val == null) return;
  if (!map.has(val)) E(entity, id, `${key}="${val}" không tồn tại trong ${label}`);
};
const isDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v) && !Number.isNaN(Date.parse(v));
const T = (v) => Date.parse(v);
const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
function values(doc, p) { // hỗ trợ "items[].a.b"
  let cur = [doc];
  for (const seg of p.split('.')) {
    const arr = seg.endsWith('[]'); const k = arr ? seg.slice(0, -2) : seg;
    cur = cur.flatMap((x) => { const v = x == null ? undefined : x[k]; return arr ? (Array.isArray(v) ? v : []) : [v]; });
  }
  return cur.filter((v) => v !== undefined);
}

// ------------------------------------------------------------------ chung: _id duy nhất, ngày ISO, enum theo DD
for (const [ent, rows] of Object.entries(data)) {
  const seen = new Set();
  rows.forEach((d, i) => {
    const id = d._id ?? `#${i}`;
    if (typeof d._id !== 'string' || !d._id) E(ent, id, 'Thiếu _id dạng string');
    else if (seen.has(d._id)) E(ent, id, '_id bị trùng');
    seen.add(d._id);
    (function scan(o, p) {
      for (const [k, v] of Object.entries(o || {})) {
        if (v && typeof v === 'object' && !Array.isArray(v)) {
          if ('$date' in v) E(ent, id, `${p}${k} dùng {"$date"} - file seed gốc phải là chuỗi ISO (to-mongo.js sẽ chuyển)`);
          else scan(v, `${p}${k}.`);
        } else if (Array.isArray(v)) v.forEach((x, n) => x && typeof x === 'object' && scan(x, `${p}${k}[${n}].`));
        else if (/(At|Until)$/.test(k) && v != null && !isDate(v)) E(ent, id, `${p}${k}="${v}" không phải ngày ISO 8601`);
      }
    })(d, '');
  });
}
let dd = null;
if (fs.existsSync(ddPath)) {
  dd = JSON.parse(fs.readFileSync(ddPath, 'utf8'));
  for (const [key, allowed] of Object.entries(dd.enums || {})) {
    const [ent, ...rest] = key.split('.');
    if (!data[ent]) continue;
    data[ent].forEach((d) => values(d, rest.join('.')).forEach((v) => {
      if (v != null && !allowed.includes(v)) E(ent, d._id, `${rest.join('.')}="${v}" ngoài enum [${allowed.join('|')}]`);
    }));
  }
} else W('dd', '-', `Không thấy Data Dictionary tại ${ddPath} - bỏ qua kiểm tra enum (dùng --dd=...)`);

// ------------------------------------------------------------------ users
const emails = new Set();
A('users').forEach((u) => {
  if ('passwordHash' in u || 'otp' in u) E('users', u._id, 'File users-public chứa passwordHash/otp - không được đưa xuống client');
  const em = String(u.email || '');
  if (em !== em.toLowerCase().trim()) W('users', u._id, 'email nên trim + lowercase');
  if (emails.has(em)) E('users', u._id, 'email bị trùng'); emails.add(em);
});
['SUPERADMIN', 'STAFF', 'CUSTOMER'].forEach((r) => { if (!A('users').some((u) => u.role === r)) W('users', '-', `Chưa có tài khoản role ${r}`); });

// ------------------------------------------------------------------ products
const allVariantIds = new Set();
A('products').forEach((p) => {
  if (!Array.isArray(p.variants) || !p.variants.length) E('products', p._id, 'Không có variants');
  (p.variants || []).forEach((v) => {
    if (allVariantIds.has(v._id)) E('products', p._id, `variant _id "${v._id}" trùng toàn hệ thống`);
    allVariantIds.add(v._id); variants.set(v._id, { product: p, variant: v });
    if (!String(v._id).startsWith(`${p._id}-`)) W('products', p._id, `variant "${v._id}" nên theo quy ước {productId}-{size}-{color}`);
    if (!Number.isInteger(v.stock) || v.stock < 0) E('products', p._id, `variant ${v._id}: stock phải là số nguyên >= 0`);
  });
  if (!Number.isInteger(p.price) || p.price < 0) E('products', p._id, 'price phải là số nguyên VND >= 0');
  if (p.allowCustomization && !p.printArea) E('products', p._id, 'allowCustomization=true nhưng thiếu printArea');
  if ((p.img_detail || []).length > 4) E('products', p._id, 'img_detail tối đa 4 ảnh');
});
const checkVariant = (ent, id, productId, variantId) => {
  const vv = variants.get(variantId);
  if (!vv) return E(ent, id, `variantId="${variantId}" không tồn tại`);
  if (vv.product._id !== productId) E(ent, id, `variantId="${variantId}" thuộc ${vv.product._id}, không phải ${productId}`);
};

// ------------------------------------------------------------------ designs, templates, carts, views, events, notifications
A('designs').forEach((d) => {
  need('designs', d._id, users, 'userId', d.userId, 'users'); need('designs', d._id, products, 'productId', d.productId, 'products');
  if (d.listingId) { need('designs', d._id, listings, 'listingId', d.listingId, 'listings'); if (!d.protectedAssetId) W('designs', d._id, 'có listingId nhưng thiếu protectedAssetId'); }
});
A('templates').forEach((t) => need('templates', t._id, products, 'productId', t.productId, 'products'));
const cartUsers = new Set();
A('carts').forEach((c) => {
  need('carts', c._id, users, 'userId', c.userId, 'users');
  if (cartUsers.has(c.userId)) E('carts', c._id, 'userId có hơn một giỏ'); cartUsers.add(c.userId);
  (c.items || []).forEach((it) => {
    need('carts', c._id, products, 'productId', it.productId, 'products'); checkVariant('carts', c._id, it.productId, it.variantId);
    if (!Number.isInteger(it.qty) || it.qty < 1 || it.qty > 999) E('carts', c._id, `qty=${it.qty} ngoài 1..999`);
    if (it.designId) need('carts', c._id, designs, 'designId', it.designId, 'designs');
    if (it.listingId) need('carts', c._id, listings, 'listingId', it.listingId, 'listings');
  });
});
['views', 'recommendationEvents', 'notifications'].forEach((n) => A(n).forEach((d) => {
  need(n, d._id, users, 'userId', d.userId, 'users'); if (d.productId) need(n, d._id, products, 'productId', d.productId, 'products');
}));

// ------------------------------------------------------------------ orders
const money = (n) => Math.round(n);
const jobsByOrder = new Map(); A('productionJobs').forEach((j) => { (jobsByOrder.get(j.originalOrderId) || jobsByOrder.set(j.originalOrderId, []).get(j.originalOrderId)).push(j); });
const PAID_STATES = ['SAMPLE_PRINTING', 'SAMPLE_REVIEW', 'PRINT_CONFIRMED', 'PRINT_COMPLETED', 'SHIPPING', 'COMPLETED'];
A('orders').forEach((o) => {
  const id = o._id;
  need('orders', id, users, 'userId', o.userId, 'users');
  const itemIds = new Set(); let sub = 0, fees = 0;
  (o.items || []).forEach((it) => {
    if (itemIds.has(it.orderItemId)) E('orders', id, `orderItemId "${it.orderItemId}" bị trùng`); itemIds.add(it.orderItemId);
    need('orders', id, products, 'productId', it.productId, 'products'); checkVariant('orders', id, it.productId, it.variantId);
    if (!Number.isInteger(it.qty) || it.qty < 1 || it.qty > 999) E('orders', id, `item ${it.orderItemId}: qty=${it.qty} ngoài 1..999`);
    sub += (it.unitPrice || 0) * (it.qty || 0);
    if (it.listingSnapshot) { need('orders', id, listings, 'listingSnapshot.listingId', it.listingSnapshot.listingId, 'listings'); fees += it.listingSnapshot.buyerDesignFee || 0; }
    if (it.designId) { need('orders', id, designs, 'designId', it.designId, 'designs'); const ds = designs.get(it.designId); if (ds && ds.userId !== o.userId && !it.listingSnapshot) W('orders', id, `designId ${it.designId} thuộc user khác`); }
    const rp = it.sampleReprints || [];
    if ((it.sampleReprintCount ?? rp.length) !== rp.length) W('orders', id, `item ${it.orderItemId}: sampleReprintCount khác độ dài sampleReprints`);
    rp.forEach((r, i) => { if (r.attemptNo !== i + 1) E('orders', id, `item ${it.orderItemId}: attemptNo phải liên tục từ 1 (gặp ${r.attemptNo} ở vị trí ${i + 1})`); });
  });
  const t = o.totals || {};
  const disc = sub >= cfg.discountThresholdVnd ? money(sub * cfg.discountRate) : 0;
  const total = sub + fees - disc + cfg.shippingFeeVnd;
  if (t.productSubtotal !== sub) E('orders', id, `totals.productSubtotal=${t.productSubtotal}, tính ra ${sub}`);
  if (t.designFees !== fees) E('orders', id, `totals.designFees=${t.designFees}, tính ra ${fees}`);
  if (t.discount !== disc) E('orders', id, `totals.discount=${t.discount}, tính ra ${disc}`);
  if (t.shipping !== cfg.shippingFeeVnd) E('orders', id, `totals.shipping=${t.shipping}, appConfig=${cfg.shippingFeeVnd}`);
  if (t.total !== total) E('orders', id, `totals.total=${t.total}, tính ra ${total}`);
  // trạng thái <-> trường thời gian
  const s = o.orderStatus, p = o.paymentStatus;
  if (s === 'PENDING_PAYMENT') {
    if (p !== 'PENDING') E('orders', id, `PENDING_PAYMENT nhưng paymentStatus=${p}`);
    if (!o.paymentOpenedAt) E('orders', id, 'PENDING_PAYMENT thiếu paymentOpenedAt');
    else if (Date.now() - T(o.paymentOpenedAt) > cfg.orderPaymentMinutes * 60000) W('orders', id, 'Đơn PENDING_PAYMENT đã quá hạn QR - job tự hủy sẽ xử lý ngay; nên sinh ngày bằng script seed');
  }
  if (s === 'PENDING_STAFF_CONFIRMATION') {
    if (p !== 'WAITING_STAFF') E('orders', id, `PENDING_STAFF_CONFIRMATION nhưng paymentStatus=${p}`);
    if (!o.paymentClaimedAt) E('orders', id, 'thiếu paymentClaimedAt');
    else if (Date.now() - T(o.paymentClaimedAt) > cfg.staffReviewHours * 3600000) W('orders', id, 'Đơn chờ Staff đã quá hạn review');
  }
  if (PAID_STATES.includes(s)) { if (p !== 'PAID') E('orders', id, `${s} nhưng paymentStatus=${p}`); if (!o.paidAt) E('orders', id, `${s} thiếu paidAt`); }
  if (s === 'SHIPPING' && !o.shippedAt) W('orders', id, 'SHIPPING thiếu shippedAt');
  if (s === 'COMPLETED' && !o.deliveredAt) E('orders', id, 'COMPLETED thiếu deliveredAt');
  if (s === 'CANCELLED' && !o.cancelledAt) E('orders', id, 'CANCELLED thiếu cancelledAt');
  if (o.stockDeductedAt == null && s !== 'CANCELLED') W('orders', id, 'stockDeductedAt trống - kho chưa trừ?');
  if (s === 'CANCELLED' && o.stockDeductedAt && !o.stockRestoredAt) W('orders', id, 'CANCELLED đã trừ kho nhưng chưa có stockRestoredAt');
  // timeline
  const tl = o.timeline || [];
  for (let i = 1; i < tl.length; i++) if (T(tl[i].occurredAt) < T(tl[i - 1].occurredAt)) E('orders', id, 'timeline không tăng dần theo thời gian');
  if (tl.length && tl[tl.length - 1].status !== s) W('orders', id, `timeline cuối là ${tl[tl.length - 1].status}, orderStatus=${s}`);
  // job
  const js = jobsByOrder.get(id) || [];
  if (['SAMPLE_PRINTING', 'SAMPLE_REVIEW'].includes(s) && !js.some((j) => j.jobType === 'SAMPLE')) W('orders', id, `${s} nhưng chưa có productionJob SAMPLE`);
  if (['PRINT_CONFIRMED', 'PRINT_COMPLETED', 'SHIPPING', 'COMPLETED'].includes(s)) {
    (o.items || []).filter((it) => it.requiresSample && it.qty > 1).forEach((it) => {
      if (!js.some((j) => j.orderItemId === it.orderItemId && j.jobType === 'MAIN_PRINT')) W('orders', id, `item ${it.orderItemId}: thiếu job MAIN_PRINT`);
    });
  }
});

// ------------------------------------------------------------------ productionJobs
A('productionJobs').forEach((j) => {
  const o = orders.get(j.originalOrderId);
  need('productionJobs', j._id, orders, 'originalOrderId', j.originalOrderId, 'orders');
  if (o && !(o.items || []).some((it) => it.orderItemId === j.orderItemId)) E('productionJobs', j._id, `orderItemId="${j.orderItemId}" không thuộc đơn ${j.originalOrderId}`);
  if (!Number.isInteger(j.qty) || j.qty < 1) E('productionJobs', j._id, `qty=${j.qty} phải >= 1 (MAIN_PRINT qty=0 không được tạo)`);
  if (j.jobType === 'REPRINT') need('productionJobs', j._id, returns, 'returnRequestId', j.returnRequestId, 'returnRequests');
});

// ------------------------------------------------------------------ inventoryMovements (tùy chọn)
if (!data.inventoryMovements) W('inventoryMovements', '-', 'Chưa có inventoryMovements.json - bỏ qua kiểm tra sổ kho (admin cần cho màn kho)');
else {
  const keys = new Set();
  const sum = new Map();
  A('inventoryMovements').forEach((m) => {
    if (keys.has(m.dedupeKey)) E('inventoryMovements', m._id, `dedupeKey "${m.dedupeKey}" bị trùng`); keys.add(m.dedupeKey);
    need('inventoryMovements', m._id, products, 'productId', m.productId, 'products'); checkVariant('inventoryMovements', m._id, m.productId, m.variantId);
    need('inventoryMovements', m._id, orders, 'originalOrderId', m.originalOrderId, 'orders');
    const d = m.quantityDelta;
    if (['ORDER_DEDUCTION', 'SAMPLE_ADDITIONAL', 'REPRINT'].includes(m.type) && !(d < 0)) E('inventoryMovements', m._id, `${m.type} phải có quantityDelta < 0`);
    if (m.type === 'ORDER_RELEASE' && !(d > 0)) E('inventoryMovements', m._id, 'ORDER_RELEASE phải có quantityDelta > 0');
    if (m.type === 'SAMPLE_USE' && d !== 0) E('inventoryMovements', m._id, 'SAMPLE_USE phải có quantityDelta = 0');
    if (m.type === 'ADMIN_ADJUST' && (d === 0 || !m.reason)) E('inventoryMovements', m._id, 'ADMIN_ADJUST cần quantityDelta khác 0 và có reason');
    const k = `${m.originalOrderId}|${m.orderItemId}|${m.type}`; sum.set(k, (sum.get(k) || 0) + d);
  });
  A('orders').forEach((o) => (o.items || []).forEach((it) => {
    if (o.stockDeductedAt) { const got = sum.get(`${o._id}|${it.orderItemId}|ORDER_DEDUCTION`); if (got !== -it.qty) E('orders', o._id, `item ${it.orderItemId}: ORDER_DEDUCTION=${got ?? 0}, cần ${-it.qty}`); }
    if (o.stockRestoredAt) { const got = sum.get(`${o._id}|${it.orderItemId}|ORDER_RELEASE`); if (got !== it.qty) E('orders', o._id, `item ${it.orderItemId}: ORDER_RELEASE=${got ?? 0}, cần ${it.qty}`); }
  }));
}

// ------------------------------------------------------------------ returns / refunds
A('returnRequests').forEach((r) => {
  const o = orders.get(r.orderId);
  need('returnRequests', r._id, orders, 'orderId', r.orderId, 'orders'); need('returnRequests', r._id, users, 'userId', r.userId, 'users');
  if (o) {
    if (o.userId !== r.userId) E('returnRequests', r._id, 'userId khác chủ đơn');
    (r.orderItemIds || []).forEach((x) => { if (!(o.items || []).some((it) => it.orderItemId === x)) E('returnRequests', r._id, `orderItemId "${x}" không thuộc đơn`); });
    if (!o.deliveredAt) E('returnRequests', r._id, 'Đơn chưa có deliveredAt nên chưa thể hoàn hàng');
    else if (T(r.createdAt) > T(o.deliveredAt) + cfg.returnWindowDays * 86400000) E('returnRequests', r._id, `Gửi sau ${cfg.returnWindowDays} ngày kể từ deliveredAt`);
    else if (T(r.createdAt) < T(o.deliveredAt)) E('returnRequests', r._id, 'createdAt trước deliveredAt');
  }
  if (!(r.attempt >= 1 && r.attempt <= cfg.maxReturnsPerOrder)) E('returnRequests', r._id, `attempt=${r.attempt} ngoài 1..${cfg.maxReturnsPerOrder}`);
  if (String(r.description || '').length < 20) E('returnRequests', r._id, 'description < 20 ký tự');
  const n = (r.evidenceImages || []).length; if (n < 1 || n > 3) W('returnRequests', r._id, `evidenceImages=${n}, quy tắc 1..3`);
});
A('refunds').forEach((f) => {
  const o = orders.get(f.originalOrderId);
  need('refunds', f._id, orders, 'originalOrderId', f.originalOrderId, 'orders'); if (f.returnRequestId) need('refunds', f._id, returns, 'returnRequestId', f.returnRequestId, 'returnRequests');
  if (o && f.amount > (o.totals || {}).total) E('refunds', f._id, `amount ${f.amount} > tổng đơn ${(o.totals || {}).total}`);
  const b = f.breakdown || [];
  if (b.length) { const s = b.reduce((a, x) => a + (x.approvedAmount || 0), 0); if (s !== f.amount) E('refunds', f._id, `Σ breakdown.approvedAmount=${s} khác amount=${f.amount}`); }
});

// ------------------------------------------------------------------ marketplace
A('listings').forEach((l) => {
  need('listings', l._id, products, 'productId', l.productId, 'products'); need('listings', l._id, users, 'sellerId', l.sellerId, 'users');
  need('listings', l._id, designs, 'designId', l.designId, 'designs');
  const d = designs.get(l.designId); if (d && d.userId !== l.sellerId) E('listings', l._id, 'design không thuộc seller');
  const p = products.get(l.productId); if (p && !p.allowMarketplace) W('listings', l._id, `sản phẩm ${l.productId} có allowMarketplace=false`);
  const fee = money(l.sellerPrice * cfg.platformFeeRate);
  if (l.platformFee !== fee) E('listings', l._id, `platformFee=${l.platformFee}, tính ra ${fee}`);
  if (l.buyerDesignFee !== l.sellerPrice + l.platformFee) E('listings', l._id, `buyerDesignFee phải = sellerPrice + platformFee = ${l.sellerPrice + l.platformFee}`);
  if (String(l.title || '').length > 100) E('listings', l._id, 'title > 100 ký tự');
  if ((l.tags || []).length > 10) E('listings', l._id, 'tags > 10');
});
A('designSales').forEach((s) => {
  const l = listings.get(s.listingId), o = orders.get(s.orderId);
  need('designSales', s._id, listings, 'listingId', s.listingId, 'listings'); need('designSales', s._id, orders, 'orderId', s.orderId, 'orders');
  if (l && l.sellerId !== s.sellerId) E('designSales', s._id, 'sellerId khác chủ tin đăng'); if (s.buyerId === s.sellerId) E('designSales', s._id, 'buyer trùng seller');
  if (o && !(o.items || []).some((it) => it.orderItemId === s.orderItemId)) E('designSales', s._id, 'orderItemId không thuộc đơn');
  if (o && o.paymentStatus !== 'PAID') W('designSales', s._id, 'Doanh số chỉ được ghi khi đơn đã PAID');
});

// ------------------------------------------------------------------ survey
const dimCount = {};
A('surveyQuestions').forEach((q) => { if (q.isActive !== false) dimCount[q.dimension] = (dimCount[q.dimension] || 0) + 1; });
['PU', 'EOU', 'SAT', 'PI'].forEach((d) => { if ((dimCount[d] || 0) < 3) W('surveyQuestions', '-', `Thang ${d} có ${(dimCount[d] || 0)} câu active, cần >= 3`); });
const answered = new Set();
A('surveyResponses').forEach((r) => {
  need('surveyResponses', r._id, users, 'userId', r.userId, 'users');
  if (answered.has(r.userId)) E('surveyResponses', r._id, 'userId trả lời hơn một lần'); answered.add(r.userId);
  (r.answers || []).forEach((a) => {
    const q = surveyQs.get(a.questionId);
    if (!q) return E('surveyResponses', r._id, `questionId="${a.questionId}" không tồn tại`);
    if (a.dimension !== q.dimension) E('surveyResponses', r._id, `${a.questionId}: dimension ${a.dimension} khác câu hỏi (${q.dimension})`);
    if (!Number.isInteger(a.score) || a.score < 1 || a.score > 5) E('surveyResponses', r._id, `${a.questionId}: score=${a.score} ngoài 1..5`);
  });
});

// ------------------------------------------------------------------ so sánh hai thư mục dataset (customer vs admin)
if (cmpDir) {
  const names = (d) => fs.readdirSync(d).filter((f) => f.endsWith('.json'));
  const a = names(dir), b = names(cmpDir);
  a.filter((f) => !b.includes(f)).forEach((f) => W('compare', f, `chỉ có ở ${path.basename(path.dirname(dir))}`));
  b.filter((f) => !a.includes(f)).forEach((f) => W('compare', f, `chỉ có ở ${path.basename(path.dirname(cmpDir))}`));
  a.filter((f) => b.includes(f)).forEach((f) => {
    const x = JSON.stringify(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
    const y = JSON.stringify(JSON.parse(fs.readFileSync(path.join(cmpDir, f), 'utf8')));
    if (x !== y) W('compare', f, 'nội dung khác nhau giữa hai app - nên dùng sync-datasets.js từ một seed gốc');
  });
}

// ------------------------------------------------------------------ báo cáo
const errs = problems.filter((x) => x.level === 'ERROR'), warns = problems.filter((x) => x.level === 'WARN');
console.log(`\nThư mục: ${dir}`);
console.log('Collection: ' + Object.entries(data).map(([k, v]) => `${k}(${v.length})`).join(', '));
for (const lv of ['ERROR', 'WARN']) {
  const list = problems.filter((x) => x.level === lv);
  if (!list.length) continue;
  console.log(`\n== ${lv} (${list.length}) ==`);
  list.forEach((x) => console.log(`  [${x.entity}] ${x.id}: ${x.msg}`));
}
console.log(`\nKết quả: ${errs.length} ERROR, ${warns.length} WARN`);
process.exit(errs.length ? 1 : 0);