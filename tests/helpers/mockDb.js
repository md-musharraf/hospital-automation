/**
 * Minimal in-memory stand-in for the Mongoose models, injected into `require.cache`
 * BEFORE the code under test loads.
 *
 * Why not use the app's own utils/mongooseMock.js? That one replaces the whole
 * `mongoose` module and is wired for running the real server. This is smaller and
 * purpose-built for tests: no server, no sockets, no network — so the chat state
 * engine can be exercised in milliseconds with zero setup.
 */
const path = require('path');

let idCounter = 0;
const nextId = (prefix) => `${prefix}${++idCounter}`;

/** Supports the query shapes the routes actually use: equality, $ne, $in, $gte, $or. */
function matches(doc, query) {
  for (const [key, expected] of Object.entries(query || {})) {
    if (key === '$or') {
      if (!expected.some((sub) => matches(doc, sub))) return false;
      continue;
    }
    const actual = key === '_id' ? String(doc._id) : doc[key];

    if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
      if ('$ne' in expected && String(actual) === String(expected.$ne)) return false;
      if ('$in' in expected && !expected.$in.map(String).includes(String(actual))) return false;
      if ('$gte' in expected && !(new Date(actual) >= new Date(expected.$gte))) return false;
      continue;
    }

    // Reference fields may hold either an id or a populated document.
    if (key === 'doctor' || key === 'patient' || key === '_id') {
      const normalised = actual && actual._id ? String(actual._id) : String(actual);
      if (normalised !== String(expected)) return false;
    } else if (actual !== expected) {
      return false;
    }
  }
  return true;
}

const REF_MODEL = { doctor: 'Doctor', patient: 'Patient', activeQueue: 'Token', currentToken: 'Token' };

function createModel(name, prefix, registry) {
  const rows = [];

  class Model {
    constructor(doc = {}) {
      Object.assign(this, doc);
      if (!this._id) this._id = nextId(prefix);
      if (!this.createdAt) this.createdAt = new Date();
    }
    markModified() {}
    toObject() {
      return { ...this };
    }
    async save() {
      this.updatedAt = new Date();
      if (!rows.includes(this)) rows.push(this);
      return this;
    }
  }

  const resolveRef = (doc, field) => {
    if (!doc || !doc[field]) return;
    const target = registry[REF_MODEL[field]];
    if (!target) return;
    const lookup = (value) =>
      target._rows.find((row) => String(row._id) === String(value && value._id ? value._id : value)) || value;
    doc[field] = Array.isArray(doc[field]) ? doc[field].map(lookup) : lookup(doc[field]);
  };

  /** Thenable so `await Model.find()` and `.populate(...).populate(...)` both work. */
  const asQuery = (result) => {
    const query = {
      populate(arg) {
        const spec = typeof arg === 'string' ? { path: arg } : arg;
        const apply = (doc) => {
          resolveRef(doc, spec.path);
          if (!spec.populate) return;
          const nested = doc[spec.path];
          if (Array.isArray(nested)) nested.forEach((child) => resolveRef(child, spec.populate.path));
          else resolveRef(nested, spec.populate.path);
        };
        if (Array.isArray(result)) result.forEach(apply);
        else if (result) apply(result);
        return query;
      },
      sort() {
        return query;
      },
      // Field projection does not change what the tests assert on, but it must
      // exist: `tokenHelper.generateUniqueTokenNumber` chains `.select()`, and
      // without it every token fell into the helper's catch-and-fallback path.
      // The new structured logging is what made that visible.
      select() {
        return query;
      },
      lean() {
        return query;
      },
      limit() {
        return query;
      },
      then(onResolve, onReject) {
        return Promise.resolve(result).then(onResolve, onReject);
      }
    };
    return query;
  };

  Model.modelName = name;
  Model._rows = rows;
  Model.find = (query = {}) => asQuery(rows.filter((row) => matches(row, query)));
  Model.findOne = (query = {}) => asQuery(rows.find((row) => matches(row, query)) || null);
  Model.findById = (id) => asQuery(rows.find((row) => String(row._id) === String(id)) || null);
  Model.findByIdAndUpdate = async (id, update) => {
    const row = rows.find((r) => String(r._id) === String(id));
    if (row) Object.assign(row, update);
    return row || null;
  };
  Model.findByIdAndDelete = async (id) => {
    const index = rows.findIndex((r) => String(r._id) === String(id));
    return index >= 0 ? rows.splice(index, 1)[0] : null;
  };
  Model.countDocuments = async (query = {}) => rows.filter((row) => matches(row, query)).length;
  Model.insertMany = async (docs = []) =>
    docs.map((doc) => new Model(doc)).map((doc) => (rows.push(doc), doc));
  Model.deleteMany = async (query = {}) => {
    const keep = rows.filter((row) => !matches(row, query));
    const deletedCount = rows.length - keep.length;
    rows.length = 0;
    rows.push(...keep);
    return { deletedCount };
  };
  Model.updateMany = async (query = {}, update = {}) => {
    const targets = rows.filter((row) => matches(row, query));
    targets.forEach((row) => Object.assign(row, update));
    return { modifiedCount: targets.length };
  };
  return Model;
}

const MODELS = [
  ['ChatSession', 'cs'],
  ['Patient', 'pt'],
  ['Doctor', 'doc'],
  ['Token', 'tk'],
  ['ArchivedToken', 'atk'],
  ['Queue', 'q'],
  ['Hospital', 'h'],
  ['RefillRequest', 'rf'],
  ['Medicine', 'med'],
  ['ActivityLog', 'act'],
  ['Invoice', 'inv'],
  ['BillingConfig', 'bcfg']
];

/**
 * Install the fake models (and stub the outbound integrations) for `backendDir`.
 * Returns the model registry plus the list of captured outbound messages.
 */
function installMockDb(backendDir) {
  const registry = {};
  for (const [name, prefix] of MODELS) {
    registry[name] = createModel(name, prefix, registry);
    const file = path.resolve(backendDir, 'models', `${name}.js`);
    require.cache[file] = { id: file, filename: file, loaded: true, exports: registry[name] };
  }

  // Nothing in a test may touch the network.
  const outbound = [];
  const whatsappFile = path.resolve(backendDir, 'utils', 'whatsappHelper.js');
  require.cache[whatsappFile] = {
    id: whatsappFile,
    filename: whatsappFile,
    loaded: true,
    exports: {
      sendWhatsAppNotification: async (phone, message, options) => {
        outbound.push({ phone, message, options });
        return { status: 'sent' };
      },
      getWhatsAppConfig: () => ({ whatsappNumber: '+917484043690' }),
      setWhatsAppConfig: () => ({}),
      getWhatsAppHistory: () => [],
      getPrimaryWhatsAppNumber: () => '+917484043690',
      checkMetaToken: async () => ({ ok: true })
    }
  };

  const pushFile = path.resolve(backendDir, 'utils', 'pushHelper.js');
  require.cache[pushFile] = {
    id: pushFile,
    filename: pushFile,
    loaded: true,
    exports: { notifyByRole: async () => {}, notifyByTokenId: async () => {} }
  };

  return { models: registry, outbound };
}

module.exports = { installMockDb };
