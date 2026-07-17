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
  Reminder: []
};

// Auto-increment ID helper
let idCounter = 1;
function generateId() {
  return 'mockid' + (idCounter++).toString().padStart(18, '0');
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

  async exec() {
    let result = await this.executor();
    
    // Process populate
    if (result) {
      if (Array.isArray(result)) {
        for (let doc of result) {
          await this._populateDoc(doc);
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
  const doc = clone(data);
  if (!doc._id) doc._id = generateId();

  if (!doc.createdAt) doc.createdAt = new Date();
  doc.updatedAt = new Date();

  Object.defineProperty(doc, 'save', {
    enumerable: false,
    writable: true,
    value: async function() {
      const idx = store[modelName].findIndex(d => d._id.toString() === this._id.toString());
      const rawData = { ...this };
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

  return doc;
}

// Mock Model Factory
function model(name, schema) {
  if (store[name] === undefined) {
    store[name] = [];
  }

  class MockModel {
    constructor(data) {
      return wrapDoc(name, data);
    }

    static find(query = {}) {
      return new Query(name, async () => {
        let items = store[name];
        if (Object.keys(query).length > 0) {
          items = items.filter(item => {
            for (let key in query) {
              if (query[key] && typeof query[key] === 'object' && query[key].$ne) {
                if (item[key] === query[key].$ne) return false;
              } else {
                if (item[key] !== query[key]) return false;
              }
            }
            return true;
          });
        }
        return items.map(d => wrapDoc(name, d));
      });
    }

    static findOne(query = {}) {
      return new Query(name, async () => {
        let items = store[name];
        if (Object.keys(query).length > 0) {
          items = items.filter(item => {
            for (let key in query) {
              if (item[key] !== query[key]) return false;
            }
            return true;
          });
        }
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
      return store[name].length;
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
      if (Object.keys(query).length === 0) {
        store[name] = [];
      } else {
        store[name] = store[name].filter(item => {
          for (let key in query) {
            if (item[key] === query[key]) return false;
          }
          return true;
        });
      }
      return { deletedCount: initialCount - store[name].length };
    }

    static async updateMany(query = {}, update = {}) {
      let count = 0;
      store[name] = store[name].map(item => {
        let matches = true;
        for (let key in query) {
          if (item[key] !== query[key]) matches = false;
        }
        if (matches) {
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
  }

  return MockModel;
}

async function connect(uri) {
  console.log(`\n[MOCK CONNECTED] In-memory SQLite/JSON simulator active on: ${uri}\n`);
  return true;
}

module.exports = {
  Schema,
  model,
  connect,
  connection: new EventEmitter()
};
