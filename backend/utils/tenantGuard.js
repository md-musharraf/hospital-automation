/**
 * The safety net under multi-tenancy.
 *
 * `utils/tenancy.js` gives every route the right way to scope a query. This file
 * is what happens when a route forgets to use it.
 *
 * Forgetting is the whole problem. A missing `hospital` filter does not throw,
 * does not log, and does not look wrong in review — it returns MORE rows, so the
 * screen fills with data and everything appears to work. The only symptom is one
 * facility seeing another facility's patients, and by the time a human notices,
 * it has already been seen. That asymmetry is why isolation cannot rest on
 * everyone remembering: the failure mode is silent and the blast radius is every
 * tenant on the platform.
 *
 * Postgres would enforce this in the database with row-level security. On
 * MongoDB the closest equivalent is to make an unscoped query on a tenant-owned
 * collection refuse to run.
 *
 * ── Deliberate exemptions ───────────────────────────────────────────────────
 *
 *  - A filter that names `_id`. Fetching one document by its id is inherently
 *    specific — an id from another tenant cannot be guessed — and the routes then
 *    check ownership with `assertSameFacility`. Requiring a redundant hospital
 *    clause on every findById would be churn without safety.
 *
 *  - An explicit `{ allTenants: true }` query option. Some work genuinely spans
 *    facilities: the super-admin console, the close-of-day job, platform metrics.
 *    Those are legitimate, and they should have to say so out loud rather than
 *    being indistinguishable from a bug.
 */

const logger = require('./logger');

/** Collections whose rows belong to exactly one facility. */
const TENANT_MODELS = [
  'ActivityLog',
  'ArchivedToken',
  'BillingConfig',
  'Doctor',
  'HospitalMessage',
  'Invoice',
  'LabAssistant',
  'Medicine',
  'Patient',
  'Pharmacist',
  'RefillRequest',
  'Reminder',
  'Staff',
  'Token'
];

/** Query methods that read or change rows and therefore need a scope. */
const GUARDED_METHODS = [
  'count',
  'countDocuments',
  'deleteMany',
  'deleteOne',
  'find',
  'findOne',
  'findOneAndDelete',
  'findOneAndReplace',
  'findOneAndUpdate',
  'replaceOne',
  'updateMany',
  'updateOne'
];

/**
 * Does this filter identify a single tenant (or a single document)?
 *
 * Exported on its own so the rule can be tested directly, without a live
 * connection — the decision is the part worth pinning down, not the plumbing.
 */
function isScoped(filter) {
  if (!filter || typeof filter !== 'object') return false;

  if (filter.hospital !== undefined) return true;
  if (filter._id !== undefined) return true;

  // `$and: [{ hospital }, …]` is as scoped as a top-level clause.
  if (Array.isArray(filter.$and) && filter.$and.some(isScoped)) return true;

  // `$or` is only safe when EVERY branch is scoped — one unscoped branch widens
  // the whole query back out to the platform.
  if (Array.isArray(filter.$or) && filter.$or.length > 0 && filter.$or.every(isScoped)) return true;

  return false;
}

/**
 * How to react to an unscoped query.
 *
 * Strict outside production so a developer meets the mistake on their own
 * machine, at the moment they write it. Report-only in production so this guard
 * cannot itself become an outage on a path that was never exercised in
 * development — a leak is serious, but so is turning a false positive into a
 * dead endpoint during a clinic's morning OPD.
 *
 * Set TENANT_GUARD=strict once the logs have been quiet for a while; that is the
 * end state, and this is the way to reach it without gambling.
 */
function guardMode() {
  const configured = (process.env.TENANT_GUARD || '').toLowerCase();
  if (configured === 'strict' || configured === 'report' || configured === 'off') return configured;
  return process.env.NODE_ENV === 'production' ? 'report' : 'strict';
}

/**
 * Mongoose plugin. Applied to every tenant-owned schema by models/index.js.
 */
function tenantGuardPlugin(schema, { modelName } = {}) {
  const check = function check() {
    if (guardMode() === 'off') return;

    // The caller asked for platform-wide data on purpose.
    if (this.getOptions && this.getOptions().allTenants === true) return;

    const filter = typeof this.getFilter === 'function' ? this.getFilter() : this.getQuery();
    if (isScoped(filter)) return;

    const message =
      `Unscoped query on ${modelName}: no 'hospital' filter. ` +
      `This would read or modify every facility's rows. ` +
      `Scope it, or pass { allTenants: true } if that is genuinely intended.`;

    if (guardMode() === 'strict') {
      throw new Error(message);
    }

    // Report mode: a stack trace is the only thing that makes this findable,
    // because the query itself looks perfectly ordinary at the call site.
    logger.error('[TENANT-GUARD] ' + message, {
      model: modelName,
      filter: JSON.stringify(filter),
      stack: new Error('unscoped query').stack
    });
  };

  GUARDED_METHODS.forEach((method) => schema.pre(method, check));
}

module.exports = { tenantGuardPlugin, isScoped, guardMode, TENANT_MODELS, GUARDED_METHODS };
