/**
 * Opening a stored clinical document, whichever of its two forms it is in.
 *
 * `labTests[].reportPdf` (and `invoice.pdfUrl`) hold one of two very different
 * things: a cloud object URL, or — when cloud storage is unconfigured — the
 * entire PDF inlined as a base64 data URI. Every screen used to render both
 * straight into `<a href>`, which looks correct and is not:
 *
 *   Chrome, Edge and Firefox all refuse top-level navigation to a `data:` URL.
 *   The link renders, the patient taps "Download PDF", and NOTHING HAPPENS —
 *   no error, no tab, no download. So a facility running without ImageKit keys
 *   filed reports its patients could never open, and the only symptom was
 *   people coming back to the counter to ask for a printout.
 *
 * Converting the data URI to a Blob and opening an object URL is the supported
 * path for exactly this, and it also gives the browser a real file name for the
 * download instead of "download.pdf".
 */

/** Is this a link a browser can simply follow? */
export function isRemoteDocument(value?: string | null): boolean {
  return typeof value === 'string' && /^https?:\/\/\S+$/i.test(value.trim());
}

/** Is anything stored at all? */
export function hasStoredDocument(value?: string | null): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Decode a `data:<mime>;base64,<payload>` string into a Blob. */
function dataUriToBlob(value: string): Blob | null {
  const match = value.match(/^data:([^;,]+)(;base64)?,(.*)$/s);
  if (!match) return null;

  const [, mime = 'application/pdf', base64, payload = ''] = match;
  try {
    if (!base64) {
      return new Blob([decodeURIComponent(payload)], { type: mime });
    }
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  } catch (err) {
    console.error('Stored document could not be decoded:', err);
    return null;
  }
}

/**
 * Open a URL in a new tab, by clicking a link rather than calling window.open.
 *
 * `window.open(url, '_blank', 'noopener,…')` RETURNS NULL BY SPECIFICATION —
 * whether or not the tab opened. So the old code could never tell a blocked
 * popup from a successful one, and got it wrong in both directions: a cloud
 * report opened fine and was reported as a failure, while an inlined one opened
 * a tab AND fired the "popup was blocked" download fallback, handing the user a
 * file they had not asked for on every single view.
 *
 * A synthetic anchor click inside the user's own gesture is not treated as a
 * popup at all, so it is not blocked, and `rel` keeps the opener isolation that
 * `noopener` was there to provide. No `download` attribute: this is the VIEW
 * path, and `download` would send a PDF the doctor wants to read on screen
 * straight to the downloads folder instead.
 */
function openInNewTab(url: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/**
 * Show a stored document in a new tab.
 *
 * Returns false only when there is genuinely nothing to show — nothing stored,
 * or a data URI that will not decode. Those are the two cases a caller must
 * report, because they are the two where the user presses a button and nothing
 * can possibly happen; every caller should surface them rather than leaving a
 * dead button on screen.
 */
export function openStoredDocument(value?: string | null, fileName?: string): boolean {
  if (!hasStoredDocument(value)) return false;
  const stored = String(value).trim();

  if (isRemoteDocument(stored)) {
    openInNewTab(stored);
    return true;
  }

  const blob = dataUriToBlob(stored);
  if (!blob) return false;

  const url = URL.createObjectURL(blob);
  openInNewTab(url);

  // Long enough for the new tab to have read it; revoking immediately races the
  // load and produces a blank viewer.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}

/**
 * Save a stored document to disk. The deliberate counterpart to viewing it —
 * here the `download` attribute is the point, and it also gives the file a real
 * clinical name instead of the storage key or "download.pdf".
 */
export function downloadStoredDocument(value?: string | null, fileName?: string): boolean {
  if (!hasStoredDocument(value)) return false;
  const stored = String(value).trim();
  const name = fileName || 'report.pdf';

  // A cross-origin URL ignores `download` — the browser navigates instead — so
  // there is nothing to gain by treating the cloud case differently here.
  if (isRemoteDocument(stored)) {
    openInNewTab(stored);
    return true;
  }

  const blob = dataUriToBlob(stored);
  if (!blob) return false;

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}
