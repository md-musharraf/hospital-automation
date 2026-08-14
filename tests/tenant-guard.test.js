/**
 * The rule that decides whether a query is allowed to run.
 *
 * Tested on its own, without a database, because the rule is the part that has
 * to be right: everything else is Mongoose plumbing. A false negative here lets
 * one facility read another's patients; a false positive breaks a working screen.
 */
const {
  isScoped,
  guardMode,
  tenantGuardPlugin,
  TENANT_MODELS,
  GUARDED_METHODS
} = require('../backend/dist/utils/tenantGuard');
const { section, check, report } = require('./helpers/assert');

/**
 * A stand-in for a Mongoose schema that just records the hooks registered on it,
 * so the plugin's wiring can be exercised without a database connection.
 */
function stubSchema() {
  const hooks = {};
  return {
    hooks,
    pre(method, fn) {
      hooks[method] = fn;
    },
    /** Run a registered hook as Mongoose would, with `this` bound to a query. */
    run(method, filter, options = {}) {
      return hooks[method].call({
        getFilter: () => filter,
        getOptions: () => options
      });
    }
  };
}

/** Did calling this throw? */
function threw(fn) {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}

(async () => {
  section('Tenant guard — which filters count as scoped');

  check('A hospital filter is scoped', isScoped({ hospital: 'city-hospital' }));
  check('A filter on _id is scoped (an id cannot be guessed)', isScoped({ _id: 'tk-1' }));
  check('Hospital alongside other fields is scoped', isScoped({ hospital: 'apex', status: 'Waiting' }));

  check('An empty filter is NOT scoped', !isScoped({}));
  check('A bare status filter is NOT scoped', !isScoped({ status: 'Waiting' }));
  check('A token number alone is NOT scoped', !isScoped({ tokenNumber: 'T-5' }));
  check('A phone number alone is NOT scoped', !isScoped({ phone: '+919000000001' }));
  check('undefined is NOT scoped', !isScoped(undefined));
  check('null is NOT scoped', !isScoped(null));

  section('Tenant guard — compound filters');

  check(
    '$and with a scoped branch is scoped',
    isScoped({ $and: [{ hospital: 'apex' }, { status: 'Paid' }] })
  );
  check('$and with no scoped branch is NOT scoped', !isScoped({ $and: [{ status: 'Paid' }] }));

  check('$or is scoped only when EVERY branch is', isScoped({ $or: [{ hospital: 'a' }, { hospital: 'b' }] }));
  check(
    'One unscoped $or branch widens the whole query back out',
    !isScoped({ $or: [{ hospital: 'a' }, { phone: '+919000000001' }] }),
    'a single unscoped branch must fail the whole filter'
  );
  check('An empty $or is NOT scoped', !isScoped({ $or: [] }));

  section('Tenant guard — rollout behaviour');

  const original = { env: process.env.NODE_ENV, guard: process.env.TENANT_GUARD };

  delete process.env.TENANT_GUARD;
  process.env.NODE_ENV = 'development';
  check('Development throws, so a developer meets the mistake immediately', guardMode() === 'strict');

  process.env.NODE_ENV = 'production';
  check('Production reports rather than throwing, so the guard is not an outage', guardMode() === 'report');

  process.env.TENANT_GUARD = 'strict';
  check('Production can be promoted to strict once the logs are quiet', guardMode() === 'strict');

  process.env.TENANT_GUARD = 'off';
  check('There is an escape hatch if the guard itself misbehaves', guardMode() === 'off');

  process.env.NODE_ENV = original.env;
  if (original.guard === undefined) delete process.env.TENANT_GUARD;
  else process.env.TENANT_GUARD = original.guard;

  section('Tenant guard — coverage');

  check('Every tenant-owned collection is listed', TENANT_MODELS.length === 15, TENANT_MODELS.length);
  check('Token is guarded', TENANT_MODELS.includes('Token'));
  check('Patient is guarded', TENANT_MODELS.includes('Patient'));
  check('Invoice is guarded', TENANT_MODELS.includes('Invoice'));
  check('ArchivedToken is guarded', TENANT_MODELS.includes('ArchivedToken'));
  // The facility passwords. An unscoped query here would hand back every
  // facility's hash at once — the single worst read on the platform.
  check('FacilityCredential is guarded', TENANT_MODELS.includes('FacilityCredential'));

  check('Reads are guarded', GUARDED_METHODS.includes('find') && GUARDED_METHODS.includes('findOne'));
  check(
    'Bulk writes are guarded — an unscoped updateMany is the most destructive case',
    GUARDED_METHODS.includes('updateMany') && GUARDED_METHODS.includes('deleteMany')
  );

  section('Tenant guard — the plugin actually blocks the query');

  const before = process.env.TENANT_GUARD;
  process.env.TENANT_GUARD = 'strict';

  const schema = stubSchema();
  tenantGuardPlugin(schema, { modelName: 'Token' });

  check(
    'A hook is registered for every guarded method',
    GUARDED_METHODS.every((m) => typeof schema.hooks[m] === 'function')
  );

  check(
    'An unscoped find is refused',
    threw(() => schema.run('find', {}))
  );
  check('A scoped find is allowed through', !threw(() => schema.run('find', { hospital: 'apex' })));
  check(
    'An unscoped deleteMany is refused — this is the platform-wipe case',
    threw(() => schema.run('deleteMany', {}))
  );
  check(
    'allTenants:true lets deliberate platform-wide work through',
    !threw(() => schema.run('deleteMany', {}, { allTenants: true }))
  );
  check(
    'A token number without a facility is refused',
    threw(() => schema.run('findOne', { tokenNumber: 'T-5' })),
    'T-5 exists once per facility — this is the chat status-lookup leak'
  );

  process.env.TENANT_GUARD = 'off';
  check('Guard off lets everything through', !threw(() => schema.run('find', {})));

  if (before === undefined) delete process.env.TENANT_GUARD;
  else process.env.TENANT_GUARD = before;

  report();
})();
