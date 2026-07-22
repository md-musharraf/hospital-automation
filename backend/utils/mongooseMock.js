const { EventEmitter } = require('events');

// In-Memory Database Store
const store = {
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
function generateId() {
  return 'mockid' + (idCounter++).toString().padStart(18, '0');
}

// Registry of schemas by model name, populated by model(), so wrapDoc()'s
// save() can enforce the same unique indexes a real Mongo collection would.
const schemaRegistry = {};

// Throws a Mongo-style E11000 error (which saveTokenWithRetry etc. already
// know how to catch and retry against) if `candidate` collides with an
// existing document on any unique field/compound index for this model.
function checkUniqueConstraints(modelName, candidate) {
  const schema = schemaRegistry[modelName];
  if (!schema) return;
  const existing = store[modelName];

  const isDup = (fields) => existing.some(doc => {
    if (doc._id && candidate._id && doc._id.toString() === candidate._id.toString()) return false;
    return fields.every(f => {
      const a = doc[f];
      const b = candidate[f];
      if (a === undefined || a === null || b === undefined || b === null) return false;
      return a.toString() === b.toString();
    });
  });

  for (const field of schema.uniqueFields || []) {
    if (isDup([field])) {
      const err = new Error(`E11000 duplicate key error collection: ${modelName} index: ${field}_1`);
      err.code = 11000;
      throw err;
    }
  }
  for (const fields of schema.compoundUniqueIndexes || []) {
    if (isDup(fields)) {
      const err = new Error(`E11000 duplicate key error collection: ${modelName} index: ${fields.join('_')}`);
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
function applyDefaults(modelName, data) {
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

// Deep clone helper
function clone(val) {
  if (val === undefined) return undefined;
  return JSON.parse(JSON.stringify(val));
}

// Simple schema constructor
class Schema {
  constructor(definition, options) {
    this.definition = definition;
    this.options = options;
    this.compoundUniqueIndexes = [];
    // Pick up inline `{ unique: true }` field definitions (e.g. Hospital.id, Queue.doctor)
    this.uniqueFields = Object.keys(definition || {}).filter(
      key => definition[key] && typeof definition[key] === 'object' && definition[key].unique === true
    );
  }
  index(fields, options) {
    // Record compound unique indexes (e.g. { tokenNumber: 1, hospital: 1 }, { unique: true })
    // so the in-memory store can enforce them the same way a real Mongo unique index would.
    if (options && options.unique && fields && typeof fields === 'object') {
      this.compoundUniqueIndexes.push(Object.keys(fields));
    }
    return this;
  }
}

// Types definition
Schema.Types = {
  ObjectId: 'ObjectId'
};

// Query Builder that supports populate, select, then
class Query {
  constructor(modelName, executor) {
    this.modelName = modelName;
    this.executor = executor;
    this.populatePaths = [];
  }

  populate(path) {
    this.populatePaths.push(path);
    return this;
  }

  select(fields) {
    return this;
  }

  sort(fields) {
    this._sort = fields;
    return this;
  }

  limit(n) {
    // Store limit for exec
    this._limit = n;
    return this;
  }

  async exec() {
    let result = await this.executor();

    // Apply sort (supports { field: 1|-1 } or 'field'/'-field' shorthand)
    if (this._sort && Array.isArray(result)) {
      const sortEntries = typeof this._sort === 'string'
        ? this._sort.split(/\s+/).filter(Boolean).map(f => f.startsWith('-') ? [f.slice(1), -1] : [f, 1])
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
        for (let doc of result) {
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

  then(onResolve, onReject) {
    return this.exec().then(onResolve, onReject);
  }

  async _populateDoc(doc) {
    if (!doc || typeof doc !== 'object') return;
    
    for (let p of this.populatePaths) {
      let pathName = typeof p === 'string' ? p : p.path;
      let subPopulate = typeof p === 'object' && p.populate ? p.populate : null;
      
      let val = doc[pathName];
      if (!val) continue;

      let refModelName = '';
      if (pathName === 'patient') refModelName = 'Patient';
      else if (pathName === 'doctor') refModelName = 'Doctor';
      else if (pathName === 'currentToken') refModelName = 'Token';
      else if (pathName === 'activeQueue') refModelName = 'Token';
      else if (pathName === 'token') refModelName = 'Token';

      if (!refModelName) continue;

      const refCollection = store[refModelName];
      if (Array.isArray(val)) {
        const populatedArr = val.map(id => {
          const matched = refCollection.find(d => d._id.toString() === id.toString());
          return matched ? wrapDoc(refModelName, matched) : id;
        });

        if (subPopulate) {
          for (let subDoc of populatedArr) {
            if (subDoc && typeof subDoc === 'object') {
              let subPath = subPopulate.path;
              let subRef = subPath === 'patient' ? 'Patient' : subPath === 'doctor' ? 'Doctor' : '';
              if (subRef && subDoc[subPath]) {
                const matchedSub = store[subRef].find(d => d._id.toString() === subDoc[subPath].toString());
                if (matchedSub) subDoc[subPath] = wrapDoc(subRef, matchedSub);
              }
            }
          }
        }
        doc[pathName] = populatedArr;
      } else {
        const matched = refCollection.find(d => d._id.toString() === val.toString());
        if (matched) {
          doc[pathName] = wrapDoc(refModelName, matched);
          
          if (subPopulate && doc[pathName]) {
            let subPath = subPopulate.path;
            let subRef = subPath === 'patient' ? 'Patient' : subPath === 'doctor' ? 'Doctor' : '';
            if (subRef && doc[pathName][subPath]) {
              const matchedSub = store[subRef].find(d => d._id.toString() === doc[pathName][subPath].toString());
              if (matchedSub) doc[pathName][subPath] = wrapDoc(subRef, matchedSub);
            }
          }
        }
      }
    }
  }
}

// Document wrapper that supports .save()
function wrapDoc(modelName, data) {
  if (!data) return null;
  const doc = clone(applyDefaults(modelName, data));
  if (!doc._id) doc._id = generateId();

  if (!doc.createdAt) doc.createdAt = new Date();
  doc.updatedAt = new Date();

  Object.defineProperty(doc, 'save', {
    enumerable: false,
    writable: true,
    value: async function() {
      const idx = store[modelName].findIndex(d => d._id.toString() === this._id.toString());
      const rawData = { ...this };
      checkUniqueConstraints(modelName, rawData);
      if (idx >= 0) {
        store[modelName][idx] = rawData;
      } else {
        store[modelName].push(rawData);
      }
      return this;
    }
  });

  Object.defineProperty(doc, 'toObject', {
    enumerable: false,
    writable: true,
    value: function() {
      const raw = { ...this };
      delete raw.save;
      delete raw.toObject;
      return raw;
    }
  });

  Object.defineProperty(doc, 'markModified', {
    enumerable: false,
    writable: true,
    value: function() {
      // Noop for mock - marks a path as modified for Mongoose change tracking
    }
  });

  return doc;
}

// Resolve a dot-notated path against a document, mirroring MongoDB's array
// traversal: if a segment lands on an array of subdocuments, the remaining
// path is resolved against each element and all results are collected.
function resolvePath(item, path) {
  const parts = path.split('.');
  let values = [item];
  for (const part of parts) {
    const next = [];
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

// Helper to match document against standard MongoDB query operators
function matchesQuery(item, query) {
  if (!query || typeof query !== 'object') return true;

  for (let key in query) {
    if (key === '$or') {
      if (!Array.isArray(query.$or)) continue;
      // At least one condition in the $or array must match
      const matched = query.$or.some(subQuery => matchesQuery(item, subQuery));
      if (!matched) return false;
    } else if (key === '$and') {
      if (!Array.isArray(query.$and)) continue;
      const matched = query.$and.every(subQuery => matchesQuery(item, subQuery));
      if (!matched) return false;
    } else {
      const val = query[key];
      // Resolve dot-notated / array-of-subdocument paths (e.g. 'labTests.status')
      const resolved = key.includes('.') || Array.isArray(item[key])
        ? resolvePath(item, key)
        : [item[key]];

      if (val && typeof val === 'object' && !Array.isArray(val)) {
        if ('$ne' in val) {
          if (resolved.some(v => v === val.$ne)) return false;
        } else if ('$in' in val) {
          if (!Array.isArray(val.$in) || !resolved.some(v => val.$in.includes(v))) return false;
        } else if ('$lte' in val) {
          if (!resolved.some(v => v <= val.$lte)) return false;
        } else if ('$gte' in val) {
          if (!resolved.some(v => v >= val.$gte)) return false;
        } else if ('$lt' in val) {
          if (!resolved.some(v => v < val.$lt)) return false;
        } else if ('$gt' in val) {
          if (!resolved.some(v => v > val.$gt)) return false;
        } else {
          // Deep or fallback comparison for other nested objects
          if (!resolved.some(v => JSON.stringify(v) === JSON.stringify(val))) return false;
        }
      } else {
        if (!resolved.some(v => v === val)) return false;
      }
    }
  }
  return true;
}

// Mock Model Factory
function model(name, schema) {
  if (store[name] === undefined) {
    store[name] = [];
  }
  if (schema) {
    schemaRegistry[name] = schema;
  }

  class MockModel {
    constructor(data) {
      return wrapDoc(name, data);
    }

    static find(query = {}) {
      return new Query(name, async () => {
        let items = store[name];
        items = items.filter(item => matchesQuery(item, query));
        return items.map(d => wrapDoc(name, d));
      });
    }

    static findOne(query = {}) {
      return new Query(name, async () => {
        let items = store[name];
        items = items.filter(item => matchesQuery(item, query));
        return items.length > 0 ? wrapDoc(name, items[0]) : null;
      });
    }

    static findById(id) {
      return new Query(name, async () => {
        if (!id) return null;
        let matched = store[name].find(d => d._id.toString() === id.toString());
        return matched ? wrapDoc(name, matched) : null;
      });
    }

    static async countDocuments(query = {}) {
      return store[name].filter(item => matchesQuery(item, query)).length;
    }

    static async insertMany(docs) {
      const wrapped = docs.map(d => wrapDoc(name, d));
      for (let w of wrapped) {
        store[name].push({ ...w });
      }
      return wrapped;
    }

    static async deleteMany(query = {}) {
      const initialCount = store[name].length;
      store[name] = store[name].filter(item => !matchesQuery(item, query));
      return { deletedCount: initialCount - store[name].length };
    }

    static async updateMany(query = {}, update = {}) {
      let count = 0;
      store[name] = store[name].map(item => {
        if (matchesQuery(item, query)) {
          count++;
          let updated = { ...item };
          if (update.$set) {
            updated = { ...updated, ...update.$set };
          } else {
            updated = { ...updated, ...update };
          }
          return updated;
        }
        return item;
      });
      return { modifiedCount: count };
    }

    static async deleteOne(query = {}) {
      const idx = store[name].findIndex(item => matchesQuery(item, query));
      if (idx >= 0) {
        store[name].splice(idx, 1);
        return { deletedCount: 1 };
      }
      return { deletedCount: 0 };
    }

    static async findByIdAndUpdate(id, update) {
      const idx = store[name].findIndex(d => d._id && d._id.toString() === id.toString());
      if (idx >= 0) {
        const updated = { ...store[name][idx], ...update };
        store[name][idx] = updated;
        return wrapDoc(name, updated);
      }
      return null;
    }
  }

  return MockModel;
}

async function connect(uri) {
  console.log(`\n[MOCK CONNECTED] In-memory SQLite/JSON simulator active on: ${uri}\n`);
  return true;
}

const connectionObj = new EventEmitter();
connectionObj.readyState = 1; // 1 = connected (mock is always "connected")

module.exports = {
  Schema,
  model,
  connect,
  connection: connectionObj
};
