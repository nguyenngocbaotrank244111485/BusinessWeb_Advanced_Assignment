require('dotenv').config();

const express = require('express');
const session = require('express-session');
const MongoStoreExport = require('connect-mongo');
const MongoStore = MongoStoreExport.default ?? MongoStoreExport;
const helmet = require('helmet');
const { connectDb } = require('./config/db');
const surveyRoutes = require('./routes/survey');

async function main() {
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 24) {
    throw new Error('Please configure a strong SESSION_SECRET in .env');
  }
  if (!process.env.MONGO_URI) {
    throw new Error('Please configure MONGO_URI in .env');
  }

  await connectDb();

  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(express.json({ limit: '100kb' }));

  // The Customer Angular dev server forwards /api/** to localhost:3000.
  // IMPORTANT: Do not duplicate this session middleware when merging into
  // an existing server. Existing Customer login must populate session.userId.
  app.use(session({
    name: 'pf.sid',
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI,
      dbName: process.env.DB_NAME || 'printify'
    }),
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: 2 * 60 * 60 * 1000
    }
  }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', application: 'PrintiFy API' });
  });

  app.use('/api/survey', surveyRoutes);

  app.use((err, _req, res, _next) => {
    console.error('API error:', err);
    res.status(500).json({ code: 'INTERNAL_SERVER_ERROR' });
  });

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, () => {
    console.log(`PrintiFy backend running at http://localhost:${port}`);
  });
}

main().catch(error => {
  console.error('Cannot start PrintiFy backend:', error.message);
  process.exit(1);
});
