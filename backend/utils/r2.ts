/**
 * Lab report PDFs on Cloudflare R2.
 *
 * A lab result used to be a URL somebody typed into `reportPdf` — which asked a
 * lab assistant to have already put the PDF on a web server. They had not, so the
 * field stayed empty and the result travelled as "Normal" with no document behind
 * it. The report is generated on the bench and needs somewhere to live.
 *
 * Why R2 and not the ImageKit account that already exists: ImageKit is an image
 * pipeline (it transforms, resizes and re-encodes), and a PDF is a document that
 * must arrive byte-identical — a lab report is a clinical record. R2 is plain
 * object storage with no egress fee, which matters because these get shared to
 * patients over WhatsApp and read repeatedly.
 *
 * The upload goes browser → R2 directly, never through this server, for the same
 * reason branding does: Render's filesystem is ephemeral, so a multipart upload
 * landing on local disk would vanish on the next deploy, taking the day's reports
 * with it.
 *
 * Signed here with `crypto` rather than the AWS SDK. The server never uploads or
 * downloads an object — it only signs — so the SDK's value would be this file's
 * one function, against ~20MB of dependency that has to be kept patched.
 */

import crypto from 'crypto';

export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  /** Optional public domain (r2.dev or a custom domain) for sharing links. */
  publicBaseUrl: string;
}

/** Configured only when all four required variables are present. */
export function r2Config(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucket,
    // Trailing slash stripped so callers can always join with a single '/'.
    publicBaseUrl: (process.env.R2_PUBLIC_BASE_URL || '').replace(/\/+$/, '')
  };
}

export const isConfigured = (): boolean => r2Config() !== null;

/** R2's S3-compatible endpoint for an account. */
export const endpointFor = (accountId: string): string => `https://${accountId}.r2.cloudflarestorage.com`;

/**
 * How long an upload URL lives.
 *
 * A lab PDF is a few hundred kilobytes on a clinic's connection, so ten minutes
 * is generous; the point is that a URL captured from a browser log is worthless
 * by the time anyone finds it. R2 allows up to seven days — that would be a
 * standing write permission, which is not what a single upload needs.
 */
export const UPLOAD_EXPIRY_SECONDS = 10 * 60;

/**
 * How long a share link lives when the bucket is private.
 *
 * Long enough for a patient to open the WhatsApp message the next morning and
 * still reach their result. When R2_PUBLIC_BASE_URL is set this is unused: the
 * object is served by the public domain and the link does not expire.
 */
export const SHARE_EXPIRY_SECONDS = 24 * 60 * 60;

/** Only PDFs. A lab report is a document, not a place to put arbitrary bytes. */
export const ALLOWED_MIME = 'application/pdf';
export const MAX_BYTES = 10 * 1024 * 1024;

/**
 * Where one facility's reports live.
 *
 * Built from the caller's own session, never from request input — the folder is
 * the tenant boundary in storage, exactly as it is for branding images. The same
 * sanitising as `imagekit.folderFor`: a traversal sequence in a hospital id would
 * otherwise walk out of the facility's prefix and into another's.
 */
export function reportKey(
  hospitalId?: string | null,
  tokenId?: string | null,
  fileName?: string
): string | null {
  const safeId = String(hospitalId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeId) return null;

  const safeToken = String(tokenId || '').replace(/[^a-zA-Z0-9_-]/g, '') || 'misc';

  // The stored name is ours, not the browser's: a report arriving as
  // "../../invoice.pdf" or with a 300-character Windows filename would otherwise
  // decide its own key. The original name is not worth preserving — nobody reads
  // these by filename, they open them from the patient's record.
  const stamp = new Date().toISOString().slice(0, 10);
  const unique = crypto.randomUUID();
  const label = String(fileName || '')
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 40);

  const leaf = label ? `${stamp}-${label}-${unique}.pdf` : `${stamp}-${unique}.pdf`;
  return `facilities/${safeId}/reports/${safeToken}/${leaf}`;
}

/**
 * Where one facility's billing invoices live.
 */
export function invoiceKey(
  hospitalId?: string | null,
  invoiceNumber?: string | null,
  fileName?: string
): string | null {
  const safeId = String(hospitalId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeId) return null;

  const safeInvoice = String(invoiceNumber || '').replace(/[^a-zA-Z0-9_-]/g, '') || 'misc';
  const stamp = new Date().toISOString().slice(0, 10);
  const unique = crypto.randomUUID();
  const label = String(fileName || '')
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 40);

  const leaf = label ? `${stamp}-${label}-${unique}.pdf` : `${stamp}-${unique}.pdf`;
  return `facilities/${safeId}/invoices/${safeInvoice}/${leaf}`;
}

const enc = (value: string): string =>
  encodeURIComponent(value).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());

/** Encode an object key for a URL path, preserving the '/' separators. */
const encodeKey = (key: string): string => key.split('/').map(enc).join('/');

const sha256Hex = (value: string | Buffer): string => crypto.createHash('sha256').update(value).digest('hex');

const hmac = (key: Buffer | string, value: string): Buffer =>
  crypto.createHmac('sha256', key).update(value).digest();

export interface SignParams {
  method: 'PUT' | 'GET';
  host: string;
  /** Object key WITHOUT a leading slash. */
  key: string;
  region: string;
  service: string;
  accessKeyId: string;
  secretAccessKey: string;
  expiresIn: number;
  /** Signing instant. Injectable so the result is reproducible under test. */
  now?: Date;
  /** Payload hash. S3 presigning uses the literal string, not a digest. */
  payloadHash?: string;
}

/**
 * A presigned SigV4 URL.
 *
 * Written as a pure function of its parameters — rather than reading the R2
 * config directly — for one reason: it makes the signature reproducible, so the
 * test can drive it with AWS's own published example (us-east-1, a fixed date,
 * the documented key pair) and compare against the documented signature. A
 * SigV4 bug does not show up as a wrong-looking URL; it shows up as a 403 from
 * storage weeks later, and the only way to rule it out is a known vector.
 *
 * R2 speaks the S3 API, so this is the standard query-string procedure: build a
 * canonical request whose payload hash is the literal UNSIGNED-PAYLOAD, derive a
 * date/region/service-scoped key, then sign the resulting string.
 */
export interface SignedParts {
  /** The exact string SigV4 hashes. Exposed so a test can assert it verbatim. */
  canonicalRequest: string;
  stringToSign: string;
  query: string;
  signature: string;
  url: string;
}

/**
 * Every intermediate SigV4 value for a request.
 *
 * Returned rather than kept internal because the canonical request is where
 * signing bugs actually live — percent-encoding, the sort order of the query,
 * the blank line that terminates the header block, the literal UNSIGNED-PAYLOAD.
 * A test that can only see the final hex digest cannot tell which of those is
 * wrong, or even that anything is.
 */
export function signedParts(params: SignParams): SignedParts {
  const { method, host, key, region, service, accessKeyId, secretAccessKey, expiresIn } = params;

  const now = params.now || new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);

  const scope = `${dateStamp}/${region}/${service}/aws4_request`;

  // Canonical query: percent-encoded, then sorted by the ENCODED pair. Sorting
  // before encoding gives a different order for some inputs, and the signature
  // would silently stop matching.
  const query = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${accessKeyId}/${scope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(expiresIn)],
    ['X-Amz-SignedHeaders', 'host']
  ]
    .map(([k, v]) => `${enc(k as string)}=${enc(v as string)}`)
    .sort()
    .join('&');

  // The canonical header block is terminated by its own newline AND followed by
  // a blank line before the signed-header list — hence the trailing \n here plus
  // the one the join adds.
  const canonicalRequest = [
    method,
    `/${encodeKey(key)}`,
    query,
    `host:${host}\n`,
    'host',
    params.payloadHash || 'UNSIGNED-PAYLOAD'
  ].join('\n');

  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');

  // The documented four-step derivation: date, then region, then service, then
  // the aws4_request terminator, each HMAC keyed by the previous result.
  const signingKey = hmac(
    hmac(hmac(hmac(`AWS4${secretAccessKey}`, dateStamp), region), service),
    'aws4_request'
  );
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  return {
    canonicalRequest,
    stringToSign,
    query,
    signature,
    url: `https://${host}/${encodeKey(key)}?${query}&X-Amz-Signature=${signature}`
  };
}

export function presignedUrl(params: SignParams): string {
  return signedParts(params).url;
}

/** R2's flavour: always region `auto`, service `s3`, bucket-in-host. */
function presign(config: R2Config, method: 'PUT' | 'GET', key: string, expiresIn: number): string {
  return presignedUrl({
    method,
    host: `${config.bucket}.${config.accountId}.r2.cloudflarestorage.com`,
    key,
    region: 'auto',
    service: 's3',
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    expiresIn
  });
}

export interface UploadTicket {
  uploadUrl: string;
  key: string;
  shareUrl: string;
  expiresInSeconds: number;
  maxBytes: number;
  contentType: string;
}

/**
 * Permission to write exactly one object, plus the URL it will be readable at.
 *
 * The share URL is returned now rather than after the upload so the caller can
 * store it against the lab test in the same request — the object it points at
 * appears the moment the browser's PUT completes.
 */
export function presignUpload(hospitalId: string, tokenId: string, fileName?: string): UploadTicket | null {
  const config = r2Config();
  if (!config) return null;

  const key = reportKey(hospitalId, tokenId, fileName);
  if (!key) return null;

  return {
    uploadUrl: presign(config, 'PUT', key, UPLOAD_EXPIRY_SECONDS),
    key,
    shareUrl: shareUrlFor(key) || '',
    expiresInSeconds: UPLOAD_EXPIRY_SECONDS,
    maxBytes: MAX_BYTES,
    contentType: ALLOWED_MIME
  };
}

/**
 * Permission to write exactly one billing invoice PDF, and the URL it will be readable at.
 */
export function presignInvoiceUpload(
  hospitalId: string,
  invoiceNumber: string,
  fileName?: string
): UploadTicket | null {
  const config = r2Config();
  if (!config) return null;

  const key = invoiceKey(hospitalId, invoiceNumber, fileName);
  if (!key) return null;

  return {
    uploadUrl: presign(config, 'PUT', key, UPLOAD_EXPIRY_SECONDS),
    key,
    shareUrl: shareUrlFor(key) || '',
    expiresInSeconds: UPLOAD_EXPIRY_SECONDS,
    maxBytes: MAX_BYTES,
    contentType: ALLOWED_MIME
  };
}

/**
 * A link to give a patient.
 *
 * A public bucket domain produces a stable link, which is what a WhatsApp message
 * wants — a presigned one would expire while sitting in the chat history. Without
 * that domain the bucket is private and the only thing that can be shared is a
 * time-limited signed URL, so that is what comes back.
 */
export function shareUrlFor(key?: string | null): string | null {
  const config = r2Config();
  if (!config || !key) return null;

  if (config.publicBaseUrl) {
    return `${config.publicBaseUrl}/${encodeKey(key)}`;
  }
  return presign(config, 'GET', key, SHARE_EXPIRY_SECONDS);
}

/** Is this URL one we issued? Mirrors imagekit.isOwnAsset. */
export function isOwnAsset(url?: string | null): boolean {
  const config = r2Config();
  if (!config || typeof url !== 'string') return false;

  if (config.publicBaseUrl && url.startsWith(config.publicBaseUrl)) return true;
  return (
    url.startsWith(endpointFor(config.accountId)) ||
    url.includes(`.${config.accountId}.r2.cloudflarestorage.com`)
  );
}
