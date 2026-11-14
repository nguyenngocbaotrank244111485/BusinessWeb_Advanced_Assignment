/**
 * MongoDB giả lập trong bộ nhớ – CHỈ dùng cho test (máy chấm / máy chưa cài MongoDB vẫn chạy được `npm test`).
 * Hỗ trợ đúng phần driver mà backend dùng:
 *  find / findOne / countDocuments / insertOne / updateOne (upsert) / bulkWrite / deleteOne / deleteMany / createIndex(unique)
 *  filter: bằng, $in, $ne, $gte, $lte, $gt, $lt, $regex, $or; update: $set, $setOnInsert, $push; sort / skip / limit; projection.
 * createIndex({..}, { unique: true }) chặn trùng giống MongoDB (lỗi code 11000).
 */
const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

function matchValue(value, cond) {
  if (cond && typeof cond === 'object' && !Array.isArray(cond) && Object.keys(cond).some((k) => k.startsWith('$'))) {
    return Object.entries(cond).every(([op, arg]) => {
      if (op === '$in') return arg.includes(value);
      if (op === '$ne') return value !== arg;
      if (op === '$gte') return value >= arg;
      if (op === '$lte') return value <= arg;
      if (op === '$gt') return value > arg;
      if (op === '$lt') return value < arg;
      if (op === '$regex') return new RegExp(arg).test(String(value ?? ''));
      throw new Error('fake-db: unsupported operator ' + op);
    });
  }
  // giống MongoDB: so với null / undefined khớp cả trường không có
  if (cond === undefined || cond === null) return value === undefined || value === null;
  return value === cond;
}

function matches(doc, filter = {}) {
  return Object.entries(filter).every(([k, cond]) => {
    if (k === '$or') return cond.some((f) => matches(doc, f));
    return matchValue(doc[k], cond);
  });
}

function project(doc, projection) {
  if (!projection) return clone(doc);
  const keys = Object.keys(projection);
  const out = clone(doc);
  if (keys.every((k) => !projection[k])) { keys.forEach((k) => delete out[k]); return out; }
  return Object.fromEntries(Object.entries(out).filter(([k]) => projection[k] || k === '_id'));
}

class Cursor {
  constructor(docs) { this.docs = docs; }
  sort(spec) {
    const keys = Object.entries(spec);
    this.docs.sort((a, b) => {
      for (const [k, dir] of keys) {
        if (a[k] === b[k]) continue;
        if (a[k] === undefined) return 1;
        if (b[k] === undefined) return -1;
        return (a[k] > b[k] ? 1 : -1) * dir;
      }
      return 0;
    });
    return this;
  }
  skip(n) { this.docs = this.docs.slice(n); return this; }
  limit(n) { this.docs = this.docs.slice(0, n); return this; }
  async toArray() { return this.docs; }
}

const dupError = () => { const e = new Error('E11000 duplicate key'); e.code = 11000; return e; };

class Collection {
  constructor(name) { this.name = name; this.docs = []; this.uniques = []; }
  find(filter, opts = {}) { return new Cursor(this.docs.filter((d) => matches(d, filter)).map((d) => project(d, opts.projection))); }
  async findOne(filter, opts = {}) { const d = this.docs.find((x) => matches(x, filter)); return d ? project(d, opts.projection) : null; }
  async countDocuments(filter) { return this.docs.filter((d) => matches(d, filter)).length; }
  checkUnique(doc, ignore) {
    for (const fields of this.uniques) {
      if (this.docs.some((d) => d !== ignore && fields.every((f) => d[f] !== undefined && d[f] === doc[f]))) throw dupError();
    }
  }
  async insertOne(doc) {
    if (this.docs.some((d) => d._id === doc._id)) throw dupError();
    this.checkUnique(doc);
    this.docs.push(clone(doc));
    return { insertedId: doc._id };
  }
  async updateOne(filter, update, opts = {}) {
    const doc = this.docs.find((d) => matches(d, filter));
    if (!doc) {
      if (!opts.upsert) return { matchedCount: 0, modifiedCount: 0 };
      const base = Object.fromEntries(Object.entries(filter).filter(([k, v]) => !k.startsWith('$') && (v === null || typeof v !== 'object')));
      const next = { ...base, ...clone(update.$setOnInsert || {}), ...clone(update.$set || {}) };
      for (const [k, v] of Object.entries(update.$push || {})) next[k] = [...(next[k] || []), clone(v)];
      if (this.docs.some((d) => d._id === next._id)) throw dupError();
      this.checkUnique(next);
      this.docs.push(next);
      return { matchedCount: 0, modifiedCount: 0, upsertedCount: 1 };
    }
    const next = { ...doc, ...clone(update.$set || {}) };
    for (const [k, v] of Object.entries(update.$push || {})) next[k] = [...(next[k] || []), clone(v)];
    this.checkUnique(next, doc);
    Object.keys(doc).forEach((k) => { if (!(k in next)) delete doc[k]; });
    Object.assign(doc, next);
    return { matchedCount: 1, modifiedCount: 1 };
  }
  async bulkWrite(ops) { for (const op of ops) await this.updateOne(op.updateOne.filter, op.updateOne.update, { upsert: op.updateOne.upsert }); }
  async deleteOne(filter) { const i = this.docs.findIndex((d) => matches(d, filter)); if (i >= 0) this.docs.splice(i, 1); return { deletedCount: i >= 0 ? 1 : 0 }; }
  async deleteMany(filter) { const before = this.docs.length; this.docs = this.docs.filter((d) => !matches(d, filter)); return { deletedCount: before - this.docs.length }; }
  async createIndex(spec, opts = {}) { if (opts.unique) this.uniques.push(Object.keys(spec)); return Object.keys(spec).join('_'); }
}

function createFakeDb() {
  const cols = new Map();
  return {
    databaseName: 'printify-test',
    collection(name) {
      if (!cols.has(name)) cols.set(name, new Collection(name));
      return cols.get(name);
    },
  };
}

module.exports = { createFakeDb };
