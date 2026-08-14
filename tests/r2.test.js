/**
 * Lab report storage on R2.
 *
 * Two things are worth testing here and they are different in kind.
 *
 * The first is the signing input. A wrong SigV4 implementation does not look
 * wrong — it produces a perfectly well-formed URL that storage rejects with a
 * 403 the first time a real lab tries to file a report. Nearly all of that risk
 * is in the CANONICAL REQUEST: percent-encoding, the sort order of the query,
 * the blank line terminating the header block, the literal UNSIGNED-PAYLOAD. So
 * the canonical request is asserted verbatim against the string the SigV4 spec
 * defines for this request, rather than checking only the final digest — which
 * would say "different" without saying which part.
 *
 * What is deliberately NOT asserted here is a hard-coded expected signature.
 * Verifying the digest end-to-end needs a trusted vector, and this repo has no
 * independent SigV4 implementation to cross-check against. An invented constant
 * would test nothing except that the code still does what it did yesterday. The
 * remaining risk — the HMAC chain itself — is one live upload with real keys.
 *
 * The second is the folder, which is the tenant boundary in storage — the same
 * property tests/uploads.test.js defends for branding images.
 */
const { section, check, report } = require('./helpers/assert');

const KEYS = {
  R2_ACCOUNT_ID: 'acct123',
  R2_ACCESS_KEY_ID: 'ak_test',
  R2_SECRET_ACCESS_KEY: 'sk_test_value',
  R2_BUCKET: 'careeai-reports'
};

function loadWith(env) {
  const saved = { ...process.env };
  Object.keys(env).forEach((k) => {
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  });
  delete require.cache[require.resolve('../backend/dist/utils/r2')];
  const mod = require('../backend/dist/utils/r2');
  return { mod, restore: () => (process.env = saved) };
}

const param = (url, name) => new URL(url).searchParams.get(name);

(async () => {
  section('R2 — the canonical request is exactly what SigV4 defines');

  const { mod, restore } = loadWith(KEYS);

  // The S3 presigned-URL example: GET examplebucket.s3.amazonaws.com/test.txt,
  // 86400s, us-east-1, signed at 2013-05-24T00:00:00Z.
  const parts = mod.signedParts({
    method: 'GET',
    host: 'examplebucket.s3.amazonaws.com',
    key: 'test.txt',
    region: 'us-east-1',
    service: 's3',
    accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
    secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
    expiresIn: 86400,
    now: new Date(Date.UTC(2013, 4, 24, 0, 0, 0)),
    payloadHash: 'UNSIGNED-PAYLOAD'
  });

  const expectedCanonical = [
    'GET',
    '/test.txt',
    'X-Amz-Algorithm=AWS4-HMAC-SHA256' +
      '&X-Amz-Credential=AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request' +
      '&X-Amz-Date=20130524T000000Z&X-Amz-Expires=86400&X-Amz-SignedHeaders=host',
    'host:examplebucket.s3.amazonaws.com',
    '',
    'host',
    'UNSIGNED-PAYLOAD'
  ].join('\n');

  check(
    'The canonical request matches the SigV4 specification byte for byte',
    parts.canonicalRequest === expectedCanonical,
    JSON.stringify(parts.canonicalRequest)
  );
  check(
    "The credential's slashes are percent-encoded inside the query",
    parts.query.includes('AKIAIOSFODNN7EXAMPLE%2F20130524%2Fus-east-1%2Fs3%2Faws4_request')
  );
  check(
    'The string-to-sign is algorithm / date / scope / hash of the canonical request',
    parts.stringToSign.split('\n').length === 4 &&
      parts.stringToSign.startsWith(
        'AWS4-HMAC-SHA256\n20130524T000000Z\n20130524/us-east-1/s3/aws4_request\n'
      ),
    JSON.stringify(parts.stringToSign)
  );
  check('The signature is a SHA-256 hex digest', /^[0-9a-f]{64}$/.test(parts.signature), parts.signature);
  check('The signing date is the AMZ basic format', param(parts.url, 'X-Amz-Date') === '20130524T000000Z');
  check('Only the host header is signed', param(parts.url, 'X-Amz-SignedHeaders') === 'host');

  // The signing key is scoped: a different secret, date, region or service must
  // all produce a different signature, or the derivation chain is not wired up.
  const vary = (over) =>
    mod.signedParts({
      method: 'GET',
      host: 'examplebucket.s3.amazonaws.com',
      key: 'test.txt',
      region: 'us-east-1',
      service: 's3',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY',
      expiresIn: 86400,
      now: new Date(Date.UTC(2013, 4, 24, 0, 0, 0)),
      payloadHash: 'UNSIGNED-PAYLOAD',
      ...over
    }).signature;

  check('Signing is deterministic for identical input', vary({}) === parts.signature);
  check('A different secret changes the signature', vary({ secretAccessKey: 'other' }) !== parts.signature);
  check('A different region changes it', vary({ region: 'auto' }) !== parts.signature);
  check('A different service changes it', vary({ service: 'r2' }) !== parts.signature);
  check(
    'A different day changes it',
    vary({ now: new Date(Date.UTC(2013, 4, 25, 0, 0, 0)) }) !== parts.signature
  );
  check('A different object key changes it', vary({ key: 'other.txt' }) !== parts.signature);

  section('R2 — the integration is optional');

  const unset = loadWith({
    R2_ACCOUNT_ID: undefined,
    R2_ACCESS_KEY_ID: undefined,
    R2_SECRET_ACCESS_KEY: undefined,
    R2_BUCKET: undefined,
    R2_PUBLIC_BASE_URL: undefined
  });
  check('With no keys, reports report themselves as unconfigured', unset.mod.isConfigured() === false);
  check('...and no upload ticket is issued', unset.mod.presignUpload('a', 'b') === null);
  check('...and nothing can be shared', unset.mod.shareUrlFor('some/key') === null);
  unset.restore();

  const partial = loadWith({ ...KEYS, R2_SECRET_ACCESS_KEY: undefined });
  check(
    'Partial configuration counts as unconfigured, not half-working',
    partial.mod.isConfigured() === false,
    'a missing secret must not produce an unsigned upload URL'
  );
  partial.restore();

  section('R2 — the key is decided by the server');

  const keyed = loadWith(KEYS);

  const k1 = keyed.mod.reportKey('city-hospital', 'tok-12', 'blood-panel.pdf');
  check('A report lands under its own facility', k1.startsWith('facilities/city-hospital/reports/tok-12/'));
  check('...and is always a .pdf', k1.endsWith('.pdf'));
  check(
    'A path-traversal facility id cannot escape the facilities tree',
    keyed.mod.reportKey('../../etc', 'tok-1', 'x.pdf').startsWith('facilities/etc/reports/'),
    keyed.mod.reportKey('../../etc', 'tok-1', 'x.pdf')
  );
  check(
    'A traversal in the token id cannot climb either',
    keyed.mod
      .reportKey('city-hospital', '../../../root', 'x.pdf')
      .startsWith('facilities/city-hospital/reports/root/'),
    keyed.mod.reportKey('city-hospital', '../../../root', 'x.pdf')
  );
  check(
    'A traversal in the FILENAME cannot climb',
    !keyed.mod.reportKey('city-hospital', 'tok-1', '../../secret.pdf').includes('..'),
    keyed.mod.reportKey('city-hospital', 'tok-1', '../../secret.pdf')
  );
  check(
    'A facility id of only punctuation is refused outright',
    keyed.mod.reportKey('../..', 't', 'x.pdf') === null
  );
  check(
    'Two reports for the same token never collide',
    keyed.mod.reportKey('h', 't', 'r.pdf') !== keyed.mod.reportKey('h', 't', 'r.pdf')
  );

  section('R2 — the upload ticket');

  const ticket = keyed.mod.presignUpload('city-hospital', 'tok-12', 'result.pdf');
  check(
    'It is a PUT URL on the bucket host',
    ticket.uploadUrl.includes(`${KEYS.R2_BUCKET}.${KEYS.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`)
  );
  check('It carries a signature', Boolean(param(ticket.uploadUrl, 'X-Amz-Signature')));
  check('R2 is signed for region "auto"', param(ticket.uploadUrl, 'X-Amz-Credential').includes('/auto/s3/'));
  check(
    'It expires well inside a day',
    Number(param(ticket.uploadUrl, 'X-Amz-Expires')) === keyed.mod.UPLOAD_EXPIRY_SECONDS &&
      keyed.mod.UPLOAD_EXPIRY_SECONDS <= 3600
  );
  check('The secret never appears in the URL', !ticket.uploadUrl.includes(KEYS.R2_SECRET_ACCESS_KEY));
  check('Only PDFs are accepted', keyed.mod.ALLOWED_MIME === 'application/pdf');

  section('R2 — sharing the result with a patient');

  check(
    'Without a public domain the bucket is private, so a share link is signed and expiring',
    Boolean(param(keyed.mod.shareUrlFor('facilities/h/reports/t/x.pdf'), 'X-Amz-Signature'))
  );
  check(
    '...and it outlives the upload window, so a patient can open it tomorrow',
    keyed.mod.SHARE_EXPIRY_SECONDS > keyed.mod.UPLOAD_EXPIRY_SECONDS
  );
  keyed.restore();

  const publicR2 = loadWith({ ...KEYS, R2_PUBLIC_BASE_URL: 'https://reports.careeai.in/' });
  const shared = publicR2.mod.shareUrlFor('facilities/h/reports/t/x.pdf');
  check(
    'With a public domain the link is stable, so it survives in a chat history',
    shared === 'https://reports.careeai.in/facilities/h/reports/t/x.pdf',
    shared
  );
  check('A trailing slash on the domain does not double up', !shared.includes('//facilities'));
  check('Our own assets are recognised', publicR2.mod.isOwnAsset(shared));
  check('A stranger’s link is not', !publicR2.mod.isOwnAsset('https://evil.example/report.pdf'));
  publicR2.restore();

  restore();
  report();
})();
