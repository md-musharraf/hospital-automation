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
 * Show a stored document in a new tab. Returns false when there was nothing to
 * open or the browser blocked the tab, so the caller can say so rather than
 * leaving the user pressing a button that appears to do nothing.
 */
export function openStoredDocument(value?: string | null, fileName?: string): boolean {
  if (!hasStoredDocument(value)) return false;
  const stored = String(value).trim();

  if (isRemoteDocument(stored)) {
    return Boolean(window.open(stored, '_blank', 'noopener,noreferrer'));
  }

  const blob = dataUriToBlob(stored);
  if (!blob) return false;

  const url = URL.createObjectURL(blob);
  const opened = window.open(url, '_blank', 'noopener,noreferrer');

  if (!opened) {
    // Popup blocked — fall back to a click-driven download, which is allowed
    // because we are still inside the user's own gesture.
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName || 'report.pdf';
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  // Long enough for the new tab to have read it; revoking immediately races the
  // load and produces a blank viewer.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}
