const express = require('express');
const { getDb } = require('../config/db');
const { handle, getPublicConfig } = require('../utils/shop-common');

/*
 *   GET /api/config/public  -> phí ship, phí sàn, phút thanh toán, ảnh QR
 *   GET /api/config/print-areas -> { productId: {x,y,width,height} } (vùng in dùng chung Editor + mockup Marketplace)
 */
const router = express.Router();

router.get('/public', handle(async (_req, res) => {
  res.json(await getPublicConfig());
}));

router.get('/print-areas', handle(async (_req, res) => {
  const products = await getDb().collection('products').find({}, { projection: { printArea: 1 } }).toArray();
  res.json(Object.fromEntries(products.filter((p) => p.printArea).map((p) => [p._id, p.printArea])));
}));

module.exports = router;
