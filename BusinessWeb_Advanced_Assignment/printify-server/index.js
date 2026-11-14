require('dotenv').config();

const MongoStoreExport = require('connect-mongo');
const MongoStore = MongoStoreExport.default ?? MongoStoreExport;
const { connectDb } = require('./config/db');
const { buildApp } = require('./app');

/*
 * PrintiFy backend – Express + MongoDB.
 * Chạy: npm run dev (cần MongoDB đang chạy, đã nạp dữ liệu bằng npm run seed).
 * Angular Customer (4200) và Admin (4300) chuyển /api/** về cổng 3000 qua proxy.conf.json.
 */
async function main() {
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 24) {
    throw new Error('Please configure a strong SESSION_SECRET in .env');
  }
  if (!process.env.MONGO_URI) throw new Error('Please configure MONGO_URI in .env');

  await connectDb();
  const app = buildApp({
    secret: process.env.SESSION_SECRET,
    secureCookie: process.env.NODE_ENV === 'production',
    makeStore: (collectionName) => MongoStore.create({ mongoUrl: process.env.MONGO_URI, dbName: process.env.DB_NAME || 'printify', collectionName }),
  });
  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => console.log(`PrintiFy backend running at http://localhost:${port}`));
}

main().catch((error) => {
  console.error('Cannot start PrintiFy backend:', error.message);
  process.exit(1);
});
