const { MongoClient } = require('mongodb');

let client;
let database;

async function connectDb() {
  if (database) return database;
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is missing');
  client = new MongoClient(process.env.MONGO_URI);
  await client.connect();
  database = client.db(process.env.DB_NAME || 'printify');
  return database;
}

function getDb() {
  if (!database) throw new Error('MongoDB not connected. Call connectDb() first.');
  return database;
}

module.exports = { connectDb, getDb };