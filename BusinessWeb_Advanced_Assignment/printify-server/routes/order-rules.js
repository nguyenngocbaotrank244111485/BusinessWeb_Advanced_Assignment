const { getDb } = require('../config/db');
const { ApiError, newId } = require('../utils/shop-common');

/*
 * Luật kho dùng chung (đã chốt):
 *  - Tạo đơn: KHÔNG trừ kho.
 *  - Staff xác nhận thanh toán (PAID): trừ đủ số lượng mọi dòng trong 1 lần (ORDER_DEDUCTION); thiếu hàng -> 409, không trừ dở dang.
 *  - Hủy đơn đã PAID, chưa in mẫu: hoàn đúng 1 lần (ORDER_RELEASE).
 *  - In lại mẫu: trừ thêm 1 (SAMPLE_ADDITIONAL). Admin điều chỉnh: ADMIN_ADJUST. Tạo sản phẩm: INITIAL_STOCK.
 * Mỗi lần thay đổi ghi 1 dòng inventoryMovements có dedupeKey UNIQUE -> gọi lại cũng không trừ / hoàn 2 lần.
 * Sửa tồn kho dùng khóa lạc quan (stockVersion) để 2 request cùng lúc không ghi đè nhau.
 */

async function changeVariantStock(productId, variantId, delta) {
  const col = getDb().collection('products');
  for (let attempt = 0; attempt < 5; attempt++) {
    const p = await col.findOne({ _id: productId });
    const v = p?.variants?.find((x) => x._id === variantId);
    if (!v) throw new ApiError(404, 'VARIANT_NOT_FOUND', 'Không tìm thấy biến thể.');
    if (v.stock + delta < 0) throw new ApiError(409, 'INSUFFICIENT_STOCK', `Không đủ hàng: ${p.name} (${v.color}${v.size ? ' ' + v.size : ''}) còn ${v.stock}.`);
    const variants = p.variants.map((x) => (x._id === variantId ? { ...x, stock: x.stock + delta } : x));
    const version = p.stockVersion ?? 0;
    const r = await col.updateOne({ _id: productId, stockVersion: p.stockVersion }, { $set: { variants, stockVersion: version + 1, updatedAt: new Date().toISOString() } });
    if (r.matchedCount) return v.stock + delta;
  }
  throw new ApiError(409, 'STOCK_BUSY', 'Kho đang được cập nhật, thử lại.');
}

/** Ghi movement trước (dedupe), rồi mới đổi tồn. Trả false nếu đã làm rồi */
async function moveStock({ productId, variantId, delta, type, dedupeKey, orderId = null, reason = null, actorId }) {
  const mov = getDb().collection('inventoryMovements');
  try {
    await mov.insertOne({ _id: newId('mov'), type, productId, variantId, quantityDelta: delta, originalOrderId: orderId, reason, actorId, dedupeKey, recordedAt: new Date().toISOString() });
  } catch (e) {
    if (e && e.code === 11000) return false;
    throw e;
  }
  try {
    await changeVariantStock(productId, variantId, delta);
  } catch (e) {
    await mov.deleteOne({ dedupeKey }); // không đổi được tồn thì bỏ dòng lịch sử vừa ghi
    throw e;
  }
  return true;
}

/** Kiểm tra đủ hàng cho cả đơn rồi mới trừ (không trừ nửa chừng) */
async function deductOrderStock(order, items, type, keyPrefix, actorId) {
  const need = new Map();
  for (const it of items) need.set(it.productId + '|' + it.variantId, (need.get(it.productId + '|' + it.variantId) ?? 0) + it.qty);
  const products = new Map((await getDb().collection('products').find({ _id: { $in: [...new Set(items.map((i) => i.productId))] } }).toArray()).map((p) => [p._id, p]));
  for (const [k, qty] of need) {
    const [pid, vid] = k.split('|');
    const p = products.get(pid);
    const v = p?.variants?.find((x) => x._id === vid);
    if (!v || v.stock < qty) {
      throw new ApiError(409, 'INSUFFICIENT_STOCK', `Không đủ hàng: ${p?.name ?? pid} (${v?.color ?? ''}${v?.size ? ' ' + v.size : ''}) còn ${v?.stock ?? 0}, đơn cần ${qty}. Hãy từ chối thanh toán với lý do hết hàng.`, { productId: pid, variantId: vid, stock: v?.stock ?? 0, need: qty });
    }
  }
  const done = [];
  try {
    for (const it of items) {
      if (await moveStock({ productId: it.productId, variantId: it.variantId, delta: -it.qty, type, dedupeKey: `${keyPrefix}:${it.orderItemId}`, orderId: order._id, actorId })) done.push(it);
    }
  } catch (e) {
    // hoàn lại phần đã trừ nếu giữa chừng hết hàng (do request khác vừa mua)
    for (const it of done) {
      await getDb().collection('inventoryMovements').deleteOne({ dedupeKey: `${keyPrefix}:${it.orderItemId}` });
      await changeVariantStock(it.productId, it.variantId, it.qty);
    }
    throw e;
  }
}

async function restoreOrderStock(order, actorId) {
  for (const it of order.items) {
    // chỉ hoàn dòng đã từng trừ
    const deducted = await getDb().collection('inventoryMovements').findOne({ dedupeKey: `deduct:${order._id}:${it.orderItemId}` });
    if (!deducted) continue;
    await moveStock({ productId: it.productId, variantId: it.variantId, delta: it.qty, type: 'ORDER_RELEASE', dedupeKey: `release:${order._id}:${it.orderItemId}`, orderId: order._id, actorId });
  }
}

module.exports = { moveStock, deductOrderStock, restoreOrderStock, changeVariantStock };
