import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { BACKEND_URL } from '../App';
import { Icon } from './dashboard/DashboardKit';

// `token` is the facility/staff session JWT. The server signs an upload for
// EITHER the platform admin secret or a staff token, and picks the storage
// folder from whichever one it got — so a console that mounts these fields
// without being the super-admin has to pass its session, or every upload comes
// back 401. Today only SuperAdminPortal mounts them, but the branding editor is
// the obvious thing for a facility to be given next.
export const UploadContext = createContext({ adminSecret: '', hospitalId: '', token: '' });
export const UploadCredentialsProvider = UploadContext.Provider;

const IMAGEKIT_UPLOAD_URL = 'https://upload.imagekit.io/api/v1/files/upload';
const MAX_EDGE: Record<string, number> = { logo: 512, hero: 1920, gallery: 1400, doctor: 800 };

/**
 * Whether uploads are switched on, asked once per page rather than once per field.
 *
 * The answer is the same for every field on the screen and cannot change while
 * it is open, but the branding forms render six to ten of these at a time — the
 * registration form alone mounts one per gallery slot — so a per-field fetch put
 * ten identical requests on the wire before the administrator had done anything.
 */
interface UploadConfig {
  configured: boolean;
  purposes?: string[];
  allowedTypes?: string[];
}

let configPromise: Promise<UploadConfig> | null = null;
function uploadConfig(): Promise<UploadConfig> {
  if (!configPromise) {
    configPromise = fetch(`${BACKEND_URL}/api/v1/uploads/config`)
      .then((r) => r.json())
      .catch(() => {
        // Don't cache a failure: a field mounted during a blip would otherwise
        // stay stuck on "not configured" for the life of the page.
        configPromise = null;
        return { configured: false };
      });
  }
  return configPromise;
}

async function shrink(file: any, purpose: string) {
  const maxEdge = MAX_EDGE[purpose] || 1400;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 400 * 1024) return file;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob: any = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.85));
    if (!blob || blob.size >= file.size) return file;

    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.webp', { type: 'image/webp' });
  } catch {
    return file;
  }
}

export function ImageUploadField(props: any) {
  const { label, value, onChange, purpose = 'gallery', hint = '' } = props;

  const ctx = useContext(UploadContext);
  const hospitalId = props.hospitalId || ctx.hospitalId;
  const adminSecret = props.adminSecret || ctx.adminSecret;
  const sessionToken = props.token || ctx.token;

  const [configured, setConfigured] = useState<boolean | null>(null);
  const [allowedTypes, setAllowedTypes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useRef(`upload-${purpose}-${Math.random().toString(36).slice(2, 8)}`);

  // An admin-signed upload names its own facility, so it cannot be signed before
  // the administrator has typed one. Registration is the case that matters: the
  // form is filled top-down, and a picker that opens before the id exists spends
  // the user's file on a request the server is bound to refuse.
  //
  // Only meaningful when uploads are configured at all: with no ImageKit keys
  // this field is a plain URL box, and telling someone to fill in a Facility ID
  // "so we know where to store the image" describes a feature that isn't there.
  const awaitingFacilityId = Boolean(configured) && Boolean(adminSecret) && !hospitalId;

  useEffect(() => {
    let alive = true;
    uploadConfig()
      .then((d) => {
        if (!alive) return;
        setConfigured(Boolean(d.configured));
        setAllowedTypes(Array.isArray(d.allowedTypes) ? d.allowedTypes : []);
      })
      .catch(() => alive && setConfigured(false));
    return () => {
      alive = false;
    };
  }, []);

  const handleFile = async (rawFile: any) => {
    if (!rawFile) return;
    setError('');
    setBusy(true);

    try {
      // Check the file the user actually picked, before it is re-encoded. A
      // picker's `accept` list is a filter, not a guarantee — a file can be
      // dragged in or chosen through "All files" — and the server's allowlist
      // deliberately excludes SVG, which can carry script and would run from our
      // own image domain on a public facility page.
      if (allowedTypes.length && !allowedTypes.includes(rawFile.type)) {
        throw new Error(
          `That file is a ${rawFile.type || 'unknown type'}. Please choose a ${allowedTypes
            .map((t: string) => t.replace('image/', '').toUpperCase())
            .join(', ')} image.`
        );
      }

      const file = await shrink(rawFile, purpose);
      const authRes = await fetch(`${BACKEND_URL}/api/v1/uploads/imagekit/auth`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(adminSecret ? { 'X-Admin-Secret': adminSecret } : {}),
          ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {})
        },
        body: JSON.stringify({ purpose, hospitalId })
      });

      const auth = await authRes.json();
      if (!authRes.ok) {
        throw new Error(auth.message || 'Could not sign upload request.');
      }

      // The server states a ceiling per purpose; honour it here rather than
      // spending a clinic's connection on bytes that would be rejected at the
      // other end. `shrink` has already run, so this is the size actually sent.
      if (auth.maxBytes && file.size > auth.maxBytes) {
        const asMb = (n: number) => `${(n / (1024 * 1024)).toFixed(1)}MB`;
        throw new Error(
          `That image is ${asMb(file.size)}, over the ${asMb(auth.maxBytes)} limit for this slot. Please pick a smaller one.`
        );
      }

      const form = new FormData();
      form.append('file', file);
      form.append('fileName', file.name);
      form.append('publicKey', auth.publicKey);
      form.append('signature', auth.signature);
      form.append('expire', String(auth.expire));
      form.append('token', auth.token);
      form.append('folder', auth.folder);
      form.append('useUniqueFileName', 'true');

      const uploadRes = await fetch(IMAGEKIT_UPLOAD_URL, {
        method: 'POST',
        body: form
      });

      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) {
        throw new Error(uploadData.message || 'Upload to storage failed.');
      }

      onChange(uploadData.url);
    } catch (err: any) {
      setError(err.message || 'Upload failed. Please try again or paste a URL.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleClear = () => {
    setError('');
    onChange('');
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="space-y-1.5">
      {label && (
        <label
          htmlFor={inputId.current}
          className="block text-[11px] font-black uppercase tracking-wider text-[var(--text-secondary)]"
        >
          {label}
        </label>
      )}

      <div className="space-y-2">
        {value && (
          <div className="relative group inline-block max-w-full">
            <img
              src={value}
              alt="Preview"
              className="h-24 w-auto max-w-full rounded-xl border border-[var(--border-color)]/60 object-cover bg-[var(--bg-color)] shadow-sm"
              onError={(e: any) => {
                e.target.style.display = 'none';
              }}
            />
            <button
              type="button"
              onClick={handleClear}
              className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-md hover:bg-rose-600 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
              title="Remove image"
            >
              <Icon name="close" className="text-[14px]" />
            </button>
          </div>
        )}

        <div className="flex items-center gap-2">
          {configured && (
            <>
              <input
                ref={inputRef}
                id={inputId.current}
                type="file"
                accept={(allowedTypes.length ? allowedTypes : ['image/jpeg', 'image/png', 'image/webp']).join(
                  ','
                )}
                onChange={(e) => handleFile(e.target.files?.[0])}
                className="hidden"
                disabled={busy || awaitingFacilityId}
              />
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={busy || awaitingFacilityId}
                title={awaitingFacilityId ? 'Enter the Facility ID above first' : undefined}
                className="px-3 py-2 rounded-xl border border-[var(--border-color)]/60 hover:border-[var(--primary-color)] bg-[var(--bg-color)] text-[12px] font-bold text-[var(--text-color)] flex items-center gap-1.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
              >
                <Icon name={busy ? 'hourglass_top' : 'upload'} className="text-[16px]" />
                <span>{busy ? 'Uploading…' : value ? 'Replace' : 'Upload photo'}</span>
              </button>
            </>
          )}

          <div className="flex-1 min-w-0">
            <input
              type="url"
              placeholder={configured ? '…or paste an image URL' : 'Paste an image URL (https://…)'}
              value={value || ''}
              onChange={(e) => {
                setError('');
                onChange(e.target.value);
              }}
              className="w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3 py-2 outline-none text-[12px] font-semibold text-[var(--text-color)] truncate transition-all"
            />
          </div>
        </div>
      </div>

      {error && (
        <p className="text-[11px] font-bold text-rose-500 flex items-center gap-1">
          <Icon name="error" className="text-[13px]" />
          <span>{error}</span>
        </p>
      )}

      {awaitingFacilityId && !error && (
        <p className="text-[11px] font-bold text-amber-500 flex items-center gap-1">
          <Icon name="info" className="text-[13px]" />
          <span>Enter the Facility ID first — it decides where this image is stored.</span>
        </p>
      )}

      {hint && !error && !awaitingFacilityId && (
        <p className="text-[11px] font-medium text-[var(--text-secondary)] leading-relaxed">{hint}</p>
      )}
    </div>
  );
}

export default ImageUploadField;
