/**
 * Signed uploads to ImageKit.
 *
 * A facility's logo, hero image and doctor photos used to be plain URL text
 * boxes. That asks an administrator for something they do not have: the photo is
 * on their phone, not on a web server, so the field stayed empty and every
 * facility fell back to the same stock picture.
 *
 * The upload therefore goes browser → ImageKit directly, never through this
 * server. That is not only faster: Render's filesystem is ephemeral, so a
 * multipart upload landing on local disk would vanish on the next restart or
 * deploy, taking every facility's branding with it.
 *
 * What this server does provide is the signature. The private key must never
 * reach the browser, so the client asks for short-lived upload credentials and
 * — critically — the FOLDER those credentials are valid for is decided here,
 * from the caller's own session. A client that could name its own folder could
 * write into another facility's, which is the same tenant boundary the database
 * guard defends, just moved into storage.
 */

import crypto from 'crypto';

export interface ImageKitConfig {
  publicKey: string;
  privateKey: string;
  urlEndpoint: string;
}

/** Configured only when all three variables are present — partial config is a bug. */
export function imagekitConfig(): ImageKitConfig | null {
  const publicKey = process.env.IMAGEKIT_PUBLIC_KEY;
  const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
  const urlEndpoint = process.env.IMAGEKIT_URL_ENDPOINT;

  if (!publicKey || !privateKey || !urlEndpoint) return null;
  return { publicKey, privateKey, urlEndpoint };
}

export const isConfigured = (): boolean => imagekitConfig() !== null;

/**
 * How long an upload credential lives.
 *
 * Long enough for someone on a clinic's slow connection to finish a photo,
 * short enough that a leaked token is worthless by the time it is found.
 * ImageKit rejects anything more than an hour ahead.
 */
export const EXPIRY_SECONDS = 10 * 60;

/**
 * What a caller is allowed to upload, and where it goes.
 *
 * Keeping the purposes enumerated means the folder layout is decided in one
 * place. `maxBytes` is advisory — the browser checks it before spending the
 * user's data, and ImageKit enforces its own account limits — but the shape
 * of the tree is not negotiable from the client side.
 */
export const PURPOSES: Record<string, { folder: string; maxBytes: number }> = {
  logo: { folder: 'branding', maxBytes: 2 * 1024 * 1024 },
  hero: { folder: 'branding', maxBytes: 5 * 1024 * 1024 },
  gallery: { folder: 'gallery', maxBytes: 5 * 1024 * 1024 },
  doctor: { folder: 'doctors', maxBytes: 3 * 1024 * 1024 }
};

export const ALLOWED_MIME: string[] = ['image/jpeg', 'image/png', 'image/webp'];

/** A facility's folder for one purpose. Never built from client input. */
export function folderFor(hospitalId?: string | null, purpose?: string): string | null {
  if (!purpose) return null;
  const rule = PURPOSES[purpose];
  if (!rule) return null;

  // Defensive: a hospital id reaches this from a JWT claim or an admin-chosen
  // facility, but a traversal sequence in either would escape the tenant's tree.
  const safeId = String(hospitalId || '').replace(/[^a-zA-Z0-9_-]/g, '');
  if (!safeId) return null;

  return `/facilities/${safeId}/${rule.folder}`;
}

export interface AuthParams {
  token: string;
  expire: number;
  signature: string;
  publicKey: string;
  urlEndpoint: string;
}

/**
 * Short-lived upload credentials.
 *
 * ImageKit's scheme: sign `token + expire` with the private key using HMAC-SHA1.
 * Implemented here with `crypto` rather than pulling in the SDK — the server
 * never uploads anything, so the SDK's entire value would be this one line.
 */
export function buildAuthParams(): AuthParams | null {
  const config = imagekitConfig();
  if (!config) return null;

  const token = crypto.randomUUID();
  const expire = Math.floor(Date.now() / 1000) + EXPIRY_SECONDS;
  const signature = crypto
    .createHmac('sha1', config.privateKey)
    .update(token + expire)
    .digest('hex');

  return { token, expire, signature, publicKey: config.publicKey, urlEndpoint: config.urlEndpoint };
}

/**
 * Is this URL one we issued?
 *
 * `facilityProfile.safeUrl` accepts any https address, which was right when an
 * administrator pasted a link. Once uploads exist, an image that is not on our
 * endpoint is either a hotlink to someone else's bandwidth or a URL that will
 * 404 the month after it is entered. Callers can use this to prefer our own.
 */
export function isOwnAsset(url?: string | null): boolean {
  const config = imagekitConfig();
  if (!config || typeof url !== 'string') return false;
  return url.startsWith(config.urlEndpoint);
}
