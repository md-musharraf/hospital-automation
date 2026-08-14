import { EventEmitter } from 'events';

// In-Memory Database Store
const store: Record<string, any[]> = {
  Patient: [],
  Doctor: [],
  Staff: [],
  Token: [],
  Queue: [],
  ChatSession: [],
  ArchivedToken: [],
  Reminder: [],
  Hospital: [],
  LabAssistant: [],
  Subscription: [],
  HospitalMessage: []
};

// Auto-increment ID helper
let idCounter = 1;
function generateId(): string {
  return 'mockid' + (idCounter++).toString().padStart(18, '0');
}

// Registry of schemas by model name, populated by model(), so wrapDoc()'s
// save() can enforce the same unique indexes a real Mongo collection would.
const schemaRegistry: Record<string, any> = {};

// Throws a Mongo-style E11000 error (which saveTokenWithRetry etc. already
// know how to catch and retry against) if `candidate` collides with an
// existing document on any unique field/compound index for this model.
function checkUniqueConstraints(modelName: string, candidate: any): void {
  const schema = schemaRegistry[modelName];
  if (!schema) return;
  const existing = store[modelName] || [];

  const isDup = (fields: string[]) =>
    existing.some((doc) => {
      if (doc._id && candidate._id && doc._id.toString() === candidate._id.toString()) return false;
      return fields.every((f) => {
        const a = doc[f];
        const b = candidate[f];
        if (a === undefined || a === null || b === undefined || b === null) return false;
        return a.toString() === b.toString();
      });
    });

  for (const field of schema.uniqueFields || []) {
    if (isDup([field])) {
      const err: any = new Error(`E11000 duplicate key error collection: ${modelName} index: ${field}_1`);
      err.code = 11000;
      throw err;
    }
  }
  for (const fields of schema.compoundUniqueIndexes || []) {
    if (isDup(fields)) {
      const err: any = new Error(
        `E11000 duplicate key error collection: ${modelName} index: ${fields.join('_')}`
      );
      err.code = 11000;
      throw err;
    }
  }
}

// Fill in schema defaults for fields the caller didn't provide — real Mongoose
// does this automatically (array fields default to [], `default: x` fields
// get x). Without this, e.g. `new Token({...})` without `labTests` would leave
// `doc.labTests` as `undefined` instead of `[]`, crashing any `.push()`/`.some()`
// call on it downstream.
function applyDefaults(modelName: string, data: any): any {
  const schema = schemaRegistry[modelName];
  if (!schema || !schema.definition) return data;
  const result = { ...data };
  for (const field in schema.definition) {
    if (result[field] !== undefined) continue;
    const def = schema.definition[field];
    if (Array.isArray(def)) {
      result[field] = [];
    } else if (def && typeof def === 'object' && 'default' in def) {
      result[field] = typeof def.default === 'function' ? def.default() : def.default;
    }
  }
  return result;
}

/**
 * Apply the schema's own value coercion — `trim`, `lowercase`, `uppercase`,
 * `set`, and Number casting — exactly as real Mongoose would on a write.
 */
function applyCoercion(modelName: string, data: any): any {
  const schema = schemaRegistry[modelName];
  if (!schema || !schema.definition || !data || typeof data !== 'object') return data;
  const coerced: Record<string, any> = { ...data };

  for (const [key, rule] of Object.entries(schema.definition)) {
    if (coerced[key] === undefined || coerced[key] === null) continue;
    let val = coerced[key];

    const def: any = Array.isArray(rule) ? rule[0] : rule;
    if (!def || typeof def !== 'object') continue;

    // trim
    if (def.trim && typeof val === 'string') val = val.trim();
    // lowercase / uppercase
    if (def.lowercase && typeof val === 'string') val = val.toLowerCase();
    if (def.uppercase && typeof val === 'string') val = val.toUpperCase();

    // Number casting — "45" posted from a form must become 45, not stay a
    // string that passes `typeof x === 'string'` in an invoice recalculation.
    if (def.type === Number || def.type === 'Number') {
      const parsed = Number(val);
      if (!Number.isNaN(parsed)) val = parsed;
    }

    // Custom setter — e.g. `set: normalizeEmail` / `set: normalizePhone`.
    // Setter takes the candidate and returns the stored shape.
    if (typeof def.set === 'function') {
      val = def.set(val);
    }

    coerced[key] = val;
  }

  return coerced;
}

// Deep clone helper
function clone(val: any): any {
  if (val === undefined) return undefined;
  return JSON.parse(JSON.stringify(val));
}

// Simple schema constructor
export class MockSchema {
  definition: any;
  options: any;
  compoundUniqueIndexes: string[][];
  uniqueFields: string[];

  static Types = {
    ObjectId: 'ObjectId',
    Mixed: 'Mixed'
  };

  constructor(definition: any, options?: any) {
    this.definition = definition;
    this.options = options;
    this.compoundUniqueIndexes = [];
    this.uniqueFields = Object.keys(definition || {}).filter(
      (key) => definition[key] && typeof definition[key] === 'object' && definition[key].unique === true
    );
  }

  index(fields: any, options?: any): this {
    if (options && options.unique && fields && typeof fields === 'object') {
      this.compoundUniqueIndexes.push(Object.keys(fields));
    }
    return this;
  }

  pre(..._args: any[]): this {
    return this;
  }

  post(..._args: any[]): this {
    return this;
  }

  plugin(fn: any, options?: any): this {
    if (typeof fn === 'function') fn(this, options);
    return this;
  }
}

// Query Builder that supports populate, select, then
export class MockQuery {
  modelName: string;
  executor: () => Promise<any>;
  populatePaths: any[];
  _sort?: any;
  _limit?: number;

  constructor(modelName: string, executor: () => Promise<any>) {
    this.modelName = modelName;
    this.executor = executor;
    this.populatePaths = [];
  }

  populate(path: any): this {
    this.populatePaths.push(path);
    return this;
  }

  select(_fields: any): this {
    return this;
  }

  sort(fields: any): this {
    this._sort = fields;
    return this;
  }

  limit(n: number): this {
    this._limit = n;
    return this;
  }

  async exec(): Promise<any> {
    let result = await this.executor();

    // Apply sort
    if (this._sort && Array.isArray(result)) {
      const sortEntries: [string, number][] =
        typeof this._sort === 'string'
          ? this._sort
              .split(/\s+/)
              .filter(Boolean)
              .map((f: string) => (f.startsWith('-') ? [f.slice(1), -1] : [f, 1]))
          : Object.entries(this._sort);

      result = [...result].sort((a, b) => {
        for (const [field, dir] of sortEntries) {
          const av = a[field];
          const bv = b[field];
          if (av === bv) continue;
          if (av === undefined || av === null) return 1;
          if (bv === undefined || bv === null) return -1;
          return av > bv ? dir : -dir;
        }
        return 0;
      });
    }

    // Process populate
    if (result) {
      if (Array.isArray(result)) {
        for (const doc of result) {
          await this._populateDoc(doc);
        }
        // Apply limit if set
        if (this._limit && Array.isArray(result)) {
          result = result.slice(0, this._limit);
        }
      } else {
        await this._populateDoc(result);
      }
    }
    return result;
  }

  then(onResolve?: any, onReject?: any): Promise<any> {
    return this.exec().then(onResolve, onReject);
  }

  async _populateDoc(doc: any): Promise<void> {
    if (!doc || typeof doc !== 'object') return;

    for (const p of this.populatePaths) {
      const pathName = typeof p === 'string' ? p : p.path;
      const subPopulate = typeof p === 'object' && p.populate ? p.populate : null;

      const val = doc[pathName];
      if (!val) continue;

      let refModelName = '';
      if (pathName === 'patient') refModelName = 'Patient';
      else if (pathName === 'doctor') refModelName = 'Doctor';
      else if (pathName === 'currentToken') refModelName = 'Token';
      else if (pathName === 'activeQueue') refModelName = 'Token';
      else if (pathName === 'token') refModelName = 'Token';

      if (!refModelName) continue;

      const refCollection = store[refModelName] || [];
      if (Array.isArray(val)) {
        const populatedArr = val.map((id) => {
          const matched = refCollection.find((d) => d._id && d._id.toString() === id.toString());
          return matched ? wrapDoc(refModelName, matched) : id;
        });

        if (subPopulate) {
          for (const subDoc of populatedArr) {
            if (subDoc && typeof subDoc === 'object') {
              const subPath = subPopulate.path;
              const subRef = subPath === 'patient' ? 'Patient' : subPath === 'doctor' ? 'Doctor' : '';
              if (subRef && subDoc[subPath]) {
                const matchedSub = (store[subRef] || []).find(
                  (d) => d._id && d._id.toString() === subDoc[subPath].toString()
                );
                if (matchedSub) subDoc[subPath] = wrapDoc(subRef, matchedSub);
              }
            }
          }
        }
        doc[pathName] = populatedArr;
      } else {
        const matched = refCollection.find((d) => d._id && d._id.toString() === val.toString());
        if (matched) {
          doc[pathName] = wrapDoc(refModelName, matched);

          if (subPopulate && doc[pathName]) {
            const subPath = subPopulate.path;
            const subRef = subPath === 'patient' ? 'Patient' : subPath === 'doctor' ? 'Doctor' : '';
            if (subRef && doc[pathName][subPath]) {
              const matchedSub = (store[subRef] || []).find(
                (d) => d._id && d._id.toString() === doc[pathName][subPath].toString()
              );
              if (matchedSub) doc[pathName][subPath] = wrapDoc(subRef, matchedSub);
            }
          }
        }
      }
    }
  }
}

// Document wrapper that supports .save()
function wrapDoc(modelName: string, data: any): any {
  if (!data) return null;
  const doc = clone(applyCoercion(modelName, applyDefaults(modelName, data)));
  if (!doc._id) doc._id = generateId();

  if (!doc.createdAt) doc.createdAt = new Date();
  doc.updatedAt = new Date();

  Object.defineProperty(doc, 'save', {
    enumerable: false,
    writable: true,
    value: async function () {
      const collection = store[modelName] || [];
      const idx = collection.findIndex((d) => d._id && d._id.toString() === this._id.toString());
      const rawData = applyCoercion(modelName, { ...this });
      Object.assign(this, rawData);
      checkUniqueConstraints(modelName, rawData);
      if (idx >= 0) {
        collection[idx] = rawData;
      } else {
        collection.push(rawData);
      }
      return this;
    }
  });

  Object.defineProperty(doc, 'toObject', {
    enumerable: false,
    writable: true,
    value: function () {
      const raw = { ...this };
      delete raw.save;
      delete raw.toObject;
      return raw;
    }
  });

  Object.defineProperty(doc, 'markModified', {
    enumerable: false,
    writable: true,
    value: function () {}
  });

  return doc;
}

function resolvePath(item: any, path: string): any[] {
  const parts = path.split('.');
  let values = [item];
  for (const part of parts) {
    const next: any[] = [];
    for (const v of values) {
      if (v === undefined || v === null) continue;
      if (Array.isArray(v)) {
        for (const el of v) {
          if (el && typeof el === 'object') next.push(el[part]);
        }
      } else if (typeof v === 'object') {
        next.push(v[part]);
      }
    }
    values = next;
  }
  return values;
}

function matchesQuery(item: any, query: any): boolean {
  if (!query || typeof query !== 'object') return true;

  for (const key in query) {
    if (key === '$or') {
      if (!Array.isArray(query.$or)) continue;
      const matched = query.$or.some((subQuery: any) => matchesQuery(item, subQuery));
      if (!matched) return false;
    } else if (key === '$and') {
      if (!Array.isArray(query.$and)) continue;
      const matched = query.$and.every((subQuery: any) => matchesQuery(item, subQuery));
      if (!matched) return false;
    } else {
      const val = query[key];
      const resolved = key.includes('.') || Array.isArray(item[key]) ? resolvePath(item, key) : [item[key]];

      if (val && typeof val === 'object' && !Array.isArray(val)) {
        if ('$ne' in val) {
          if (resolved.some((v) => v === val.$ne)) return false;
        } else if ('$in' in val) {
          if (!Array.isArray(val.$in) || !resolved.some((v) => val.$in.includes(v))) return false;
        } else if ('$lte' in val) {
          if (!resolved.some((v) => v <= val.$lte)) return false;
        } else if ('$gte' in val) {
          if (!resolved.some((v) => v >= val.$gte)) return false;
        } else if ('$lt' in val) {
          if (!resolved.some((v) => v < val.$lt)) return false;
        } else if ('$gt' in val) {
          if (!resolved.some((v) => v > val.$gt)) return false;
        } else {
          if (!resolved.some((v) => JSON.stringify(v) === JSON.stringify(val))) return false;
        }
      } else {
        if (!resolved.some((v) => v === val)) return false;
      }
    }
  }
  return true;
}

// Mock Model Factory
export function model(name: string, schema?: any): any {
  if (store[name] === undefined) {
    store[name] = [];
  }
  if (schema) {
    schemaRegistry[name] = schema;
  }

  class MockModel {
    constructor(data: any) {
      return wrapDoc(name, data);
    }

    static find(query: any = {}) {
      return new MockQuery(name, async () => {
        let items = store[name] || [];
        items = items.filter((item) => matchesQuery(item, query));
        return items.map((d) => wrapDoc(name, d));
      });
    }

    static findOne(query: any = {}) {
      return new MockQuery(name, async () => {
        let items = store[name] || [];
        items = items.filter((item) => matchesQuery(item, query));
        return items.length > 0 ? wrapDoc(name, items[0]) : null;
      });
    }

    static findById(id: any) {
      return new MockQuery(name, async () => {
        if (!id) return null;
        const matched = (store[name] || []).find((d) => d._id && d._id.toString() === id.toString());
        return matched ? wrapDoc(name, matched) : null;
      });
    }

    static async countDocuments(query: any = {}): Promise<number> {
      return (store[name] || []).filter((item) => matchesQuery(item, query)).length;
    }

    static async insertMany(docs: any[]): Promise<any[]> {
      const wrapped = docs.map((d) => wrapDoc(name, d));
      for (const w of wrapped) {
        if (!store[name]) store[name] = [];
        store[name].push({ ...w });
      }
      return wrapped;
    }

    static async deleteMany(query: any = {}): Promise<{ deletedCount: number }> {
      const collection = store[name] || [];
      const initialCount = collection.length;
      store[name] = collection.filter((item) => !matchesQuery(item, query));
      return { deletedCount: initialCount - store[name].length };
    }

    static async updateMany(query: any = {}, update: any = {}): Promise<{ modifiedCount: number }> {
      let count = 0;
      const collection = store[name] || [];
      store[name] = collection.map((item) => {
        if (matchesQuery(item, query)) {
          count++;
          let updated = { ...item };
          if (update.$set) {
            updated = { ...updated, ...update.$set };
          } else {
            updated = { ...updated, ...update };
          }
          return applyCoercion(name, updated);
        }
        return item;
      });
      return { modifiedCount: count };
    }

    static async deleteOne(query: any = {}): Promise<{ deletedCount: number }> {
      const collection = store[name] || [];
      const idx = collection.findIndex((item) => matchesQuery(item, query));
      if (idx >= 0) {
        collection.splice(idx, 1);
        return { deletedCount: 1 };
      }
      return { deletedCount: 0 };
    }

    static async findByIdAndUpdate(id: any, update: any): Promise<any> {
      const collection = store[name] || [];
      const idx = collection.findIndex((d) => d._id && d._id.toString() === id.toString());
      if (idx >= 0) {
        const updated = { ...collection[idx], ...update };
        collection[idx] = updated;
        return wrapDoc(name, updated);
      }
      return null;
    }
  }

  return MockModel;
}

/** A connection string with any username/password stripped out. */
function redactUri(uri?: string | null): string {
  return String(uri || '').replace(/\/\/[^@/]*@/, '//***:***@');
}

export async function connect(uri?: string | null): Promise<boolean> {
  console.log(`\n[MOCK CONNECTED] In-memory simulator active (target: ${redactUri(uri)})\n`);
  return true;
}

export const connection: any = new EventEmitter();
connection.readyState = 1; // 1 = connected

const mongooseMock = {
  Schema: MockSchema,
  model,
  connect,
  connection
};

export default mongooseMock;
module.exports = mongooseMock;
