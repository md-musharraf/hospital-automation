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
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useRef(`upload-${purpose}-${Math.random().toString(36).slice(2, 8)}`);

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

  const fallbackDataUrl = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (typeof e.target?.result === 'string') {
        onChange(e.target.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleFile = async (rawFile: any) => {
    if (!rawFile) return;
    setError('');
    setBusy(true);

    try {
      const types = allowedTypes.length ? allowedTypes : ['image/jpeg', 'image/png', 'image/webp'];
      if (rawFile.type && !types.includes(rawFile.type)) {
        throw new Error(
          `That file is a ${rawFile.type}. Please choose a ${types
            .map((t: string) => t.replace('image/', '').toUpperCase())
            .join(', ')} image.`
        );
      }

      const file = await shrink(rawFile, purpose);

      // If ImageKit is configured and facility id is available (if required), attempt signed upload
      if (configured && (hospitalId || !adminSecret)) {
        try {
          const authRes = await fetch(`${BACKEND_URL}/api/v1/uploads/imagekit/auth`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(adminSecret ? { 'X-Admin-Secret': adminSecret } : {}),
              ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {})
            },
            body: JSON.stringify({ purpose, hospitalId })
          });

          if (authRes.ok) {
            const auth = await authRes.json();
            if (auth.maxBytes && file.size > auth.maxBytes) {
              const asMb = (n: number) => `${(n / (1024 * 1024)).toFixed(1)}MB`;
              throw new Error(
                `That image is ${asMb(file.size)}, over the ${asMb(auth.maxBytes)} limit. Please pick a smaller image.`
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

            if (uploadRes.ok) {
              const uploadData = await uploadRes.json();
              onChange(uploadData.url);
              return;
            }
          }
        } catch {
          // Cloud upload failed or offline — fall through to local optimized data URL
        }
      }

      // Seamless fallback: convert compressed file to Data URI so device upload always succeeds
      fallbackDataUrl(file);
    } catch (err: any) {
      setError(err.message || 'Could not load photo from device.');
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

  const acceptTypes = (allowedTypes.length ? allowedTypes : ['image/jpeg', 'image/png', 'image/webp']).join(
    ','
  );

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

      <input
        ref={inputRef}
        id={inputId.current}
        type="file"
        accept={acceptTypes}
        onChange={(e) => handleFile(e.target.files?.[0])}
        className="hidden"
        disabled={busy}
      />

      {value ? (
        <div className="relative group inline-flex items-center gap-3 p-2.5 rounded-2xl border border-[var(--border-color)]/60 bg-[var(--card-bg)] shadow-sm max-w-full">
          <img
            src={value}
            alt="Preview"
            className="h-20 w-24 rounded-xl object-cover border border-[var(--border-color)]/40 bg-[var(--bg-color)] shrink-0"
            onError={(e: any) => {
              e.target.style.display = 'none';
            }}
          />
          <div className="flex flex-col gap-1.5 pr-2 min-w-0">
            <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <Icon name="check_circle" className="text-[14px]" />
              <span>Photo selected from device</span>
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                disabled={busy}
                className="px-3 py-1.5 rounded-lg border border-[var(--border-color)]/60 hover:border-[var(--primary-color)] bg-[var(--bg-color)] text-[11px] font-extrabold text-[var(--text-color)] flex items-center gap-1 shadow-sm transition-all hover:bg-[var(--primary-color)]/5"
              >
                <Icon name={busy ? 'hourglass_top' : 'cached'} className="text-[14px]" />
                <span>{busy ? 'Processing…' : 'Change Photo'}</span>
              </button>
              <button
                type="button"
                onClick={handleClear}
                disabled={busy}
                className="px-2.5 py-1.5 rounded-lg border border-rose-500/30 text-rose-500 hover:bg-rose-500/10 text-[11px] font-extrabold flex items-center gap-1 transition-all"
                title="Remove photo"
              >
                <Icon name="delete" className="text-[14px]" />
                <span>Remove</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
          }}
          onClick={() => inputRef.current?.click()}
          className={`cursor-pointer rounded-2xl border-2 border-dashed p-4 flex flex-col items-center justify-center text-center transition-all group ${
            dragOver
              ? 'border-[var(--primary-color)] bg-[var(--primary-color)]/10'
              : 'border-[var(--border-color)]/60 hover:border-[var(--primary-color)]/80 bg-[var(--bg-color)]/60 hover:bg-[var(--bg-color)]'
          } ${busy ? 'opacity-50 pointer-events-none' : ''}`}
        >
          <div className="w-10 h-10 rounded-full bg-[var(--primary-color)]/10 text-[var(--primary-color)] flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
            <Icon name={busy ? 'hourglass_top' : 'add_photo_alternate'} className="text-[22px]" />
          </div>
          <p className="text-[12px] font-extrabold text-[var(--text-color)]">
            {busy ? 'Uploading photo from device…' : 'Upload photo from device'}
          </p>
          <p className="text-[11px] text-[var(--text-secondary)] font-medium mt-0.5">
            Click to browse phone/computer files or drag & drop (JPG, PNG, WebP)
          </p>
        </div>
      )}

      {error && (
        <p className="text-[11px] font-bold text-rose-500 flex items-center gap-1 mt-1">
          <Icon name="error" className="text-[13px]" />
          <span>{error}</span>
        </p>
      )}

      {hint && !error && (
        <p className="text-[11px] font-medium text-[var(--text-secondary)] leading-relaxed mt-1">{hint}</p>
      )}
    </div>
  );
}

export default ImageUploadField;
