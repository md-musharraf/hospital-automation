/**
 * Upload credentials.
 *
 * The folder is the security boundary here. A signed credential is permission to
 * write somewhere, so if a caller could influence where, the tenant isolation the
 * database guard enforces would simply be bypassed one layer down in storage.
 */
const crypto = require('crypto');
const { section, check, report } = require('./helpers/assert');

const KEYS = {
  IMAGEKIT_PUBLIC_KEY: 'public_test',
  IMAGEKIT_PRIVATE_KEY: 'private_test_key',
  IMAGEKIT_URL_ENDPOINT: 'https://ik.imagekit.io/careeai'
};

/** Load the module fresh under a given environment. */
function loadWith(env) {
  const saved = { ...process.env };
  Object.keys(env).forEach((k) => {
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  });
  delete require.cache[require.resolve('../backend/dist/utils/imagekit')];
  const mod = require('../backend/dist/utils/imagekit');
  const result = { mod, restore: () => (process.env = saved) };
  return result;
}

(async () => {
  section('Uploads — the integration is optional');

  const unset = loadWith({
    IMAGEKIT_PUBLIC_KEY: undefined,
    IMAGEKIT_PRIVATE_KEY: undefined,
    IMAGEKIT_URL_ENDPOINT: undefined
  });
  check('With no keys, uploads report themselves as unconfigured', unset.mod.isConfigured() === false);
  check('...and no credential is issued', unset.mod.buildAuthParams() === null);
  unset.restore();

  const partial = loadWith({ ...KEYS, IMAGEKIT_PRIVATE_KEY: undefined });
  check(
    'Partial configuration counts as unconfigured, not half-working',
    partial.mod.isConfigured() === false,
    'a missing private key must not produce an unsigned upload'
  );
  partial.restore();

  section('Uploads — the folder is decided by the server');

  const { mod, restore } = loadWith(KEYS);

  check(
    "A facility's images land under its own id",
    mod.folderFor('city-hospital', 'hero') === '/facilities/city-hospital/branding'
  );
  check(
    'Each purpose has its own sub-folder',
    mod.folderFor('city-hospital', 'gallery') === '/facilities/city-hospital/gallery' &&
      mod.folderFor('city-hospital', 'doctor') === '/facilities/city-hospital/doctors'
  );
  check(
    'A path-traversal id cannot escape the facilities tree',
    mod.folderFor('../../etc', 'hero') === '/facilities/etc/branding',
    mod.folderFor('../../etc', 'hero')
  );
  check(
    'A slash cannot be smuggled in to reach another tenant',
    mod.folderFor('city/../apex-clinic', 'hero') === '/facilities/cityapex-clinic/branding',
    mod.folderFor('city/../apex-clinic', 'hero')
  );
  check('An id of only punctuation is refused outright', mod.folderFor('../..', 'hero') === null);
  check('An unknown purpose is refused', mod.folderFor('city-hospital', 'anything') === null);

  section('Uploads — a report is named after the patient it belongs to');

  check(
    'Reports land in the patient_reports folder',
    mod.folderFor('city-hospital', 'report') === '/facilities/city-hospital/patient_reports',
    mod.folderFor('city-hospital', 'report')
  );
  check(
    'The object is named for the patient and the test',
    mod.reportFileName('abc123', 'Complete Blood Count') === 'patient_abc123_complete_blood_count_report.pdf',
    mod.reportFileName('abc123', 'Complete Blood Count')
  );

  // Two tests for one patient must not resolve to one storage key. Without the
  // test in the name, a thyroid panel would overwrite that patient's CBC — one
  // person, two results, one file, and a doctor reading the wrong panel.
  check(
    'Two tests for the same patient are two different files',
    mod.reportFileName('abc123', 'CBC') !== mod.reportFileName('abc123', 'Thyroid Panel (TSH)'),
    mod.reportFileName('abc123', 'CBC')
  );
  check(
    'Punctuation in a test name cannot become a path',
    !mod.reportFileName('abc123', '../../etc/passwd').includes('/'),
    mod.reportFileName('abc123', '../../etc/passwd')
  );
  check(
    'Neither can a patient id',
    mod.reportFileName('../../secret', 'CBC') === 'patient_secret_cbc_report.pdf',
    mod.reportFileName('../../secret', 'CBC')
  );
  check(
    'A missing patient id still produces a usable name',
    mod.reportFileName(null, 'CBC') === 'patient_unknown_cbc_report.pdf',
    mod.reportFileName(null, 'CBC')
  );
  check(
    'A report with no test name is still named for the patient',
    mod.reportFileName('abc123', '') === 'patient_abc123_report.pdf',
    mod.reportFileName('abc123', '')
  );

  section('Uploads — the credential');

  const auth = mod.buildAuthParams();
  check(
    'A credential carries token, expire and signature',
    Boolean(auth.token && auth.expire && auth.signature)
  );
  check('The public key is shared, the private key never is', auth.publicKey === KEYS.IMAGEKIT_PUBLIC_KEY);
  check(
    'The private key does not appear anywhere in the response',
    !JSON.stringify(auth).includes(KEYS.IMAGEKIT_PRIVATE_KEY)
  );

  const expected = crypto
    .createHmac('sha1', KEYS.IMAGEKIT_PRIVATE_KEY)
    .update(auth.token + auth.expire)
    .digest('hex');
  check('The signature is HMAC-SHA1 over token+expire, as ImageKit expects', auth.signature === expected);

  const now = Math.floor(Date.now() / 1000);
  check('It expires in the future', auth.expire > now);
  check(
    'It expires well inside ImageKit’s one-hour ceiling',
    auth.expire - now <= 3600 && auth.expire - now <= mod.EXPIRY_SECONDS + 2,
    `${auth.expire - now}s`
  );
  check('Two credentials never share a token', mod.buildAuthParams().token !== auth.token);

  section('Uploads — telling our own assets apart');

  check(
    'An asset on our endpoint is recognised',
    mod.isOwnAsset(`${KEYS.IMAGEKIT_URL_ENDPOINT}/facilities/a/b.webp`)
  );
  check('A hotlink to somebody else is not', !mod.isOwnAsset('https://images.unsplash.com/photo-1.jpg'));
  check('Rubbish is not', !mod.isOwnAsset(null) && !mod.isOwnAsset(''));

  check(
    'Only image types are accepted',
    mod.ALLOWED_MIME.includes('image/jpeg') &&
      mod.ALLOWED_MIME.includes('image/webp') &&
      !mod.ALLOWED_MIME.includes('image/svg+xml'),
    'SVG is excluded on purpose: it can carry script and these are shown on public pages'
  );

  restore();
  report();
})();
