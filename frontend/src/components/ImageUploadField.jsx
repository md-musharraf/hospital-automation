import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { BACKEND_URL } from '../App';
import { Icon } from './dashboard/DashboardKit';

/**
 * Who is uploading, and for which facility.
 *
 * Supplied by the console once rather than threaded through every editor: the
 * landing editor and the doctor-profile fields are rendered from six places in
 * the super-admin portal, and a prop that has to be passed at six call sites is
 * a prop that will be forgotten at the seventh.
 *
 * `hospitalId` is a hint for the super-admin path only. For signed-in staff the
 * server ignores it entirely and uses their token's own facility.
 */
export const UploadContext = createContext({ adminSecret: '', hospitalId: '' });

export const UploadCredentialsProvider = UploadContext.Provider;

/**
 * Pick an image from the device, or paste a URL.
 *
 * The editor used to offer only a URL box. An administrator filling in their own
 * hospital does not have a URL — the photo is in their phone's camera roll — so
 * the field was left blank and every facility inherited the same stock image.
 *
 * The file goes straight from this browser to ImageKit. This app's server only
 * signs the request, and it decides the destination folder itself, so a facility
 * cannot upload into another facility's space (see backend/routes/uploads.js).
 *
 * When ImageKit is not configured — a fresh deployment, a fork, a local machine
 * without the keys — the component degrades to the URL box it replaced rather
 * than showing a broken button. Uploading is an improvement to this form, not a
 * new requirement for running the app.
 */

/** Endpoint ImageKit expects a browser upload on. */
const IMAGEKIT_UPLOAD_URL = 'https://upload.imagekit.io/api/v1/files/upload';

/**
 * Longest edge we keep, per purpose.
 *
 * Resizing before upload rather than after is deliberate. The free tier's
 * bandwidth is shared across every facility on the platform, and a 12MP photo
 * straight off a phone spends that allowance on pixels no layout ever shows.
 * It also spends the administrator's mobile data, which they are paying for
 * while standing at their own reception desk.
 */
const MAX_EDGE = { logo: 512, hero: 1920, gallery: 1400, doctor: 800 };

/**
 * Downscale in a canvas and re-encode as WebP.
 *
 * Returns the original file untouched if anything goes wrong: a failed resize
 * must not become a failed upload. Worst case the full-size image is sent, which
 * is exactly what would have happened without this step.
 */
async function shrink(file, purpose) {
  const maxEdge = MAX_EDGE[purpose] || 1400;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));

    // Already small enough, and already a compact format — leave it alone.
    if (scale === 1 && file.size < 400 * 1024) return file;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.85));
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.webp', { type: 'image/webp' });
  } catch {
    return file;
  }
}

export default function ImageUploadField({
  label,
  value,
  onChange,
  purpose = 'gallery',
  hospitalId: hospitalIdProp,
  adminSecret: adminSecretProp,
  hint
}) {
  const ctx = useContext(UploadContext);
  const hospitalId = hospitalIdProp || ctx.hospitalId;
  const adminSecret = adminSecretProp || ctx.adminSecret;

  const [configured, setConfigured] = useState(null); // null = still asking
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const inputId = useRef(`upload-${purpose}-${Math.random().toString(36).slice(2, 8)}`);

  useEffect(() => {
    let alive = true;
    fetch(`${BACKEND_URL}/api/v1/uploads/config`)
      .then((r) => r.json())
      .then((d) => alive && setConfigured(Boolean(d.configured)))
      // A server that cannot answer is treated as "not configured": the URL box
      // still works, so the administrator is never blocked by our outage.
      .catch(() => alive && setConfigured(false));
    return () => {
      alive = false;
    };
  }, []);

  const upload = useCallback(
    async (file) => {
      setError('');
      setBusy(true);
      try {
        const authRes = await fetch(`${BACKEND_URL}/api/v1/uploads/imagekit/auth`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(adminSecret ? { 'X-Admin-Secret': adminSecret } : {}),
            ...(localStorage.getItem('token')
              ? { Authorization: `Bearer ${localStorage.getItem('token')}` }
              : {})
          },
          body: JSON.stringify({ purpose, hospitalId })
        });

        const auth = await authRes.json();
        if (!authRes.ok) throw new Error(auth.message || 'Could not get permission to upload.');

        if (!auth.allowedTypes.includes(file.type)) {
          throw new Error('Please choose a JPEG, PNG or WebP image.');
        }

        const prepared = await shrink(file, purpose);
        if (prepared.size > auth.maxBytes) {
          throw new Error(
            `That image is ${(prepared.size / 1048576).toFixed(1)} MB — the limit here is ${(
              auth.maxBytes / 1048576
            ).toFixed(0)} MB.`
          );
        }

        const form = new FormData();
        form.append('file', prepared);
        form.append('fileName', prepared.name);
        // The folder comes from the signed response, never from this component —
        // it is the server's decision about which facility owns these bytes.
        form.append('folder', auth.folder);
        form.append('useUniqueFileName', 'true');
        form.append('publicKey', auth.publicKey);
        form.append('token', auth.token);
        form.append('expire', String(auth.expire));
        form.append('signature', auth.signature);

        const upRes = await fetch(IMAGEKIT_UPLOAD_URL, { method: 'POST', body: form });
        const uploaded = await upRes.json();
        if (!upRes.ok) throw new Error(uploaded.message || 'The image service rejected the upload.');

        onChange(uploaded.url);
      } catch (err) {
        setError(err.message || 'Upload failed.');
      } finally {
        setBusy(false);
        if (inputRef.current) inputRef.current.value = '';
      }
    },
    [adminSecret, hospitalId, onChange, purpose]
  );

  return (
    <div>
      <label
        htmlFor={inputId.current}
        className="block text-[11px] font-bold mb-1 text-[var(--text-secondary)]"
      >
        {label}
      </label>

      <div className="flex items-start gap-2.5">
        {value ? (
          <img
            src={value}
            alt=""
            className="w-16 h-16 rounded-lg object-cover border border-[var(--border-color)] shrink-0 bg-[var(--card-bg)]"
            // A stored URL can rot — an old paste, a deleted asset. Say so
            // instead of leaving a broken-image glyph the admin has to interpret.
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              setError('This image did not load. It may have been moved or deleted.');
            }}
          />
        ) : (
          <span className="w-16 h-16 rounded-lg border border-dashed border-[var(--border-color)] flex items-center justify-center shrink-0 text-[var(--text-secondary)]">
            <Icon name="image" className="text-[22px]" />
          </span>
        )}

        <div className="flex-1 min-w-0 space-y-1.5">
          {configured && (
            <div className="flex flex-wrap items-center gap-2">
              <input
                id={inputId.current}
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={busy}
                onChange={(e) => e.target.files[0] && upload(e.target.files[0])}
                className="sr-only"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => inputRef.current && inputRef.current.click()}
                className="px-3 py-2 rounded-lg text-[12px] font-bold bg-[var(--primary-color)] text-[var(--primary-text)] disabled:opacity-60 active:scale-95 transition-all duration-200 flex items-center gap-1.5"
              >
                {/* A Material Symbol is a ligature, so without this the button
                    announces "upload Upload from device" — the glyph's own name
                    read out ahead of the label. */}
                <span aria-hidden="true" className="flex items-center">
                  <Icon
                    name={busy ? 'progress_activity' : 'upload'}
                    className={`text-[16px] ${busy ? 'animate-spin' : ''}`}
                  />
                </span>
                {busy ? 'Uploading…' : value ? 'Replace' : 'Upload from device'}
              </button>

              {value && (
                <button
                  type="button"
                  onClick={() => {
                    setError('');
                    onChange('');
                  }}
                  className="px-3 py-2 rounded-lg text-[12px] font-bold border border-[var(--border-color)] text-[var(--text-secondary)] active:scale-95 transition-all duration-200"
                >
                  Remove
                </button>
              )}
            </div>
          )}

          <input
            type="url"
            value={value || ''}
            placeholder={configured ? '…or paste an image URL' : 'https://…'}
            onChange={(e) => onChange(e.target.value)}
            className="w-full text-[12px]"
            // Named for screen readers: when uploading is available this box is
            // the secondary path and the visible label belongs to the button.
            aria-label={`${label} — image address`}
          />

          {hint && !error && <p className="text-[11px] text-[var(--text-secondary)]">{hint}</p>}
          {error && (
            <p role="alert" className="text-[11px] font-bold text-[var(--error-color)]">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
