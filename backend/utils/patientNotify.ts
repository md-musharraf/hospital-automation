/**
 * Telling a patient something, so that it actually reaches them.
 *
 * Before this module a bill and a lab report each had exactly one delivery
 * route: a WhatsApp text. `sendWhatsAppNotification` RESOLVES on a Meta
 * rejection rather than throwing, so the routes correctly reported "not sent" —
 * and then nothing happened. The patient had no bill, no report, and no trace
 * anywhere that anyone had tried. The tracker they were told to watch showed the
 * visit moving on without ever mentioning the document, and recovery depended on
 * a human at the counter noticing a warning and pressing Resend, per patient.
 *
 * That single channel is the fragile one. The Meta token here has expired or
 * been blocked repeatedly (see the notes in utils/whatsappHelper) — an outage
 * measured in hours, during which every discharge and every filed report is a
 * patient who was silently never told.
 *
 * So the order is inverted. The alert is WRITTEN DOWN FIRST, onto the token, and
 * WhatsApp becomes one of three ways to deliver a record that already exists:
 *
 *   1. In-app  — `token.patientAlerts`, rendered by the live tracker. Always
 *                happens, even for a patient with no phone number on file.
 *   2. Push    — a web push to whoever enabled notifications for this token.
 *   3. Socket  — `patient-alert` into the patient's room, for a tracker that is
 *                open right now.
 *   4. WhatsApp — and when that fails, it is queued and retried on a backoff
 *                rather than dropped.
 *
 * The retry is the follow-up. When the token is dead at 15:00 and someone
 * refreshes it at 16:00, every unsent bill and report goes out by itself.
 */

import Token from '../models/Token';
import Patient from '../models/Patient';
import { sendWhatsAppNotification } from './whatsappHelper';
import { toPatient, logActivity } from './realtime';
import { toId } from './ids';
import logger from './logger';

const log = logger.child({ module: 'patient-notify' });

/** Keep one visit's feed bounded; a token is a day, not a lifetime. */
const MAX_ALERTS_PER_TOKEN = 40;

/**
 * Waits before each retry, in minutes.
 *
 * Front-loaded, then long. The first couple of minutes cover a transient network
 * blip; the long tail covers the real failure here, which is a credential a
 * human has to go and replace in the Meta dashboard. Beyond the last entry the
 * alert is abandoned and reception is told to phone the patient — a message that
 * arrives a day late is not a notification, it is a confusion.
 */
const RETRY_BACKOFF_MINUTES = [3, 12, 45, 150];

/** First attempt plus every retry. */
export const MAX_WHATSAPP_ATTEMPTS = RETRY_BACKOFF_MINUTES.length + 1;

export type AlertKind = 'bill' | 'report' | 'prescription' | 'queue' | 'info';

export interface NotifyPatientOptions {
  io?: any;
  /** A Token document, or its id. A document is used in place, not re-read. */
  token: any;
  /** Populated patient if the caller already has one — saves a lookup. */
  patient?: any;
  kind: AlertKind;
  /** Heading for the in-app card, e.g. "Your bill is ready". */
  title: string;
  /** One or two lines for the in-app card. Not the WhatsApp body. */
  body: string;
  /** The full WhatsApp body. Omit to record the alert without messaging. */
  message?: string;
  /** An https link only — never a data URI. Ignored if it is not one. */
  link?: string;
  linkLabel?: string;
  /**
   * Identifies the thing being announced (this invoice, this report revision).
   * A second call with the same key updates the existing entry instead of
   * stacking a duplicate in the patient's feed.
   */
  dedupeKey?: string;
  /** Skip WhatsApp entirely and record the alert only. */
  whatsapp?: boolean;
  /**
   * Leave the save to the caller. For routes that already hold the token and
   * are about to save it themselves — two saves of the same document would
   * race, and the second would be working from a stale copy.
   */
  deferSave?: boolean;
}

export interface NotifyPatientResult {
  /** Did a WhatsApp message actually leave? */
  sent: boolean;
  /** Was the alert recorded where the patient can see it? */
  recorded: boolean;
  /** Did at least one device get a push? */
  pushed: boolean;
  reason?: string;
  /** Queued for another WhatsApp attempt. */
  willRetry?: boolean;
  retryAt?: Date | null;
}

/** Only a real link belongs in a message body or an href. */
function isHttpLink(value?: string | null): boolean {
  return typeof value === 'string' && /^https?:\/\/\S+$/i.test(value.trim()) && value.length <= 2000;
}

/**
 * The earliest outstanding retry on this token, or null.
 *
 * Kept on a top-level field so the sweep can find the few tokens that need
 * attention with one indexed query rather than walking every alert array on the
 * platform.
 */
function recomputeAlertRetryAt(token: any): void {
  const due = (token.patientAlerts || [])
    .filter((a: any) => a.whatsappStatus === 'failed' && a.nextRetryAt)
    .map((a: any) => new Date(a.nextRetryAt).getTime());
  token.alertRetryAt = due.length ? new Date(Math.min(...due)) : null;
}

/** Where the next attempt lands, or null once the cap is reached. */
function scheduleNextRetry(attempts: number): Date | null {
  const wait = RETRY_BACKOFF_MINUTES[attempts - 1];
  if (!wait) return null;
  return new Date(Date.now() + wait * 60 * 1000);
}

/** Best-effort web push. Never allowed to fail the clinical action behind it. */
async function pushToToken(tokenId: string, payload: Record<string, any>): Promise<boolean> {
  try {
    const pushHelper = require('./pushHelper');
    const results = await pushHelper.notifyByTokenId(tokenId, payload);
    return Array.isArray(results) && results.some(Boolean);
  } catch (err: any) {
    log.error('Patient push failed', { err: err.message, tokenId });
    return false;
  }
}

/**
 * Record one thing the patient needs to know, and deliver it every way we can.
 *
 * Returns what happened on each channel. `sent` refers to WhatsApp alone —
 * callers that report to staff should say "recorded but WhatsApp is down, we
 * will keep trying" rather than a bare failure, because the patient CAN see it.
 */
export async function notifyPatient(options: NotifyPatientOptions): Promise<NotifyPatientResult> {
  const {
    io,
    kind,
    title,
    body,
    message = '',
    link = '',
    linkLabel = '',
    dedupeKey = '',
    whatsapp = true,
    deferSave = false
  } = options;

  // A live document is used IN PLACE, never re-read. A caller that passed one is
  // about to save it, and mutating a second copy would mean the alert is written
  // to an object nobody saves — or saved twice, from two stale views of the same
  // token. Presence of `save` is the test, not presence of `patientAlerts`: an
  // older token predates the field and would look like a bare id.
  let token = options.token;
  try {
    if (!token) return { sent: false, recorded: false, pushed: false, reason: 'no_token' };
    if (typeof token.save !== 'function') {
      token = await (Token as any).findById(toId(token));
    }
    if (!token) return { sent: false, recorded: false, pushed: false, reason: 'no_token' };
  } catch (err: any) {
    log.error('Could not load the token for a patient alert', { err: err.message });
    return { sent: false, recorded: false, pushed: false, reason: 'no_token' };
  }

  const tokenId = String(token._id);
  const safeLink = isHttpLink(link) ? String(link).trim() : '';

  // Resolve the patient last, and tolerate its absence: a missing phone must
  // still leave a visible alert, which is the entire point of this module.
  let patient = options.patient;
  if (!patient && token.patient) {
    try {
      patient = await (Patient as any).findById(toId(token.patient));
    } catch (err: any) {
      log.error('Could not load the patient for an alert', { err: err.message, tokenId });
    }
  }
  const phone = patient && patient.phone ? String(patient.phone) : '';

  token.patientAlerts = token.patientAlerts || [];

  // Same announcement as before? Update that entry rather than stacking a
  // second card saying the same thing.
  let alert = dedupeKey
    ? (token.patientAlerts || []).find((a: any) => a.dedupeKey && a.dedupeKey === dedupeKey)
    : null;

  if (alert) {
    alert.kind = kind;
    alert.title = title;
    alert.body = body;
    alert.link = safeLink;
    alert.linkLabel = linkLabel;
    if (message) alert.message = message;
  } else {
    alert = {
      kind,
      title,
      body,
      link: safeLink,
      linkLabel,
      message,
      dedupeKey,
      createdAt: new Date(),
      readAt: null,
      whatsappStatus: 'skipped',
      attempts: 0,
      nextRetryAt: null,
      pushed: false
    };
    token.patientAlerts.push(alert);
    // Trim the oldest first; the newest is what the patient came to read.
    if (token.patientAlerts.length > MAX_ALERTS_PER_TOKEN) {
      token.patientAlerts.splice(0, token.patientAlerts.length - MAX_ALERTS_PER_TOKEN);
    }
    // Re-read what was actually stored. Mongoose CASTS a plain object on push,
    // so the literal above is a detached copy from here on — every delivery
    // result recorded against it would be silently dropped at save time.
    alert = token.patientAlerts[token.patientAlerts.length - 1];
  }

  // ── Channel 2: the patient's device, if they enabled notifications ────────
  const pushed = await pushToToken(tokenId, {
    title,
    body,
    icon: '/icon.svg',
    url: `/live-tracker/${tokenId}`
  });
  if (pushed) alert.pushed = true;

  // ── Channel 3: a tracker that is open right now ───────────────────────────
  toPatient(io, tokenId, 'patient-alert', {
    kind,
    title,
    body,
    link: safeLink,
    linkLabel
  });

  // ── Channel 4: WhatsApp, and the queue behind it ──────────────────────────
  let sent = false;
  let reason: string | undefined;
  let willRetry = false;

  if (!whatsapp || !message) {
    alert.whatsappStatus = 'skipped';
    reason = 'not_messaged';
  } else if (!phone) {
    alert.whatsappStatus = 'skipped';
    alert.lastError = 'No phone number on file';
    reason = 'no_phone';
  } else {
    alert.attempts = (alert.attempts || 0) + 1;
    let result: any = null;
    try {
      result = await sendWhatsAppNotification(phone, message, io);
    } catch (err: any) {
      log.error('WhatsApp threw while sending a patient alert', { err: err.message, tokenId, kind });
      result = { status: 'failed', error: err.message };
    }

    sent = Boolean(result && result.status === 'sent');
    if (sent) {
      alert.whatsappStatus = 'sent';
      alert.whatsappAt = new Date();
      alert.nextRetryAt = null;
      alert.lastError = undefined;
    } else {
      alert.lastError = String((result && result.error) || 'delivery_failed').slice(0, 300);
      const next = scheduleNextRetry(alert.attempts);
      if (next) {
        alert.whatsappStatus = 'failed';
        alert.nextRetryAt = next;
        willRetry = true;
      } else {
        alert.whatsappStatus = 'abandoned';
        alert.nextRetryAt = null;
      }
      reason = 'delivery_failed';
    }
  }

  recomputeAlertRetryAt(token);
  token.markModified && token.markModified('patientAlerts');

  if (!deferSave) {
    try {
      await token.save();
    } catch (err: any) {
      log.error('Could not persist a patient alert', { err: err.message, tokenId, kind });
      return { sent, recorded: false, pushed, reason: reason || 'save_failed', willRetry };
    }
  }

  return {
    sent,
    recorded: true,
    pushed,
    ...(reason ? { reason } : {}),
    willRetry,
    retryAt: alert.nextRetryAt || null
  };
}

export interface RetrySweepResult {
  attempted: number;
  sent: number;
  abandoned: number;
}

export interface RetrySweepOptions {
  /**
   * Ignore the backoff and the give-up cap, and try every undelivered alert
   * right now. For the human who has just fixed the Meta credential.
   */
  force?: boolean;
  /** Limit to one facility. Omitted for the background sweep, which is global. */
  hospital?: string;
}

/**
 * The automatic WhatsApp follow-up.
 *
 * Sweeps every alert whose delivery failed and whose backoff has elapsed, and
 * tries again. This is what turns "the Meta token was dead this afternoon" from
 * a list of patients nobody told into a list of patients who get their bill and
 * their report the moment the credential is replaced — without anyone at the
 * counter having to remember who was affected.
 *
 * Cross-tenant on purpose: it runs for the platform, not for one facility, so it
 * says `allTenants` out loud rather than looking like a missing scope. See
 * utils/tenantGuard.
 *
 * The phone number is re-read rather than stored on the alert, because "we had
 * the wrong number" is one of the reasons a send fails and correcting it at the
 * counter should be enough to make the next attempt land.
 */
export async function retryPatientAlerts(
  io?: any,
  options: RetrySweepOptions = {}
): Promise<RetrySweepResult> {
  const { force = false, hospital = '' } = options;
  const now = new Date();
  const summary: RetrySweepResult = { attempted: 0, sent: 0, abandoned: 0 };

  let due: any[] = [];
  try {
    if (force) {
      // "Try everything now", pressed by a human who has just replaced the Meta
      // credential. Backoff timers and the abandoned cap are both ignored —
      // waiting out a two-hour wait for a problem that is already fixed is
      // exactly what this button exists to skip.
      //
      // Scanning one facility's tokens is affordable because the close-of-day
      // job archives finished visits nightly: this collection holds roughly a
      // day of work, not the whole history.
      const scope = hospital ? { hospital } : {};
      const rows = (await (Token as any).find(scope, null, hospital ? {} : { allTenants: true })) || [];
      due = rows.filter((t: any) =>
        (t.patientAlerts || []).some(
          (a: any) => (a.whatsappStatus === 'failed' || a.whatsappStatus === 'abandoned') && a.message
        )
      );
    } else {
      const filter: Record<string, any> = { alertRetryAt: { $lte: now } };
      if (hospital) filter.hospital = hospital;
      const rows = (await (Token as any).find(filter, null, hospital ? {} : { allTenants: true })) || [];
      // A null `alertRetryAt` never matches `$lte` on a real Mongo (comparison
      // operators are type-bracketed), but it does under the in-memory mock,
      // where null coerces to 0. Filtering here keeps the two behaving the same.
      due = rows.filter((t: any) => t && t.alertRetryAt);
    }
  } catch (err: any) {
    log.error('Could not read the alert retry queue', { err: err.message });
    return summary;
  }

  for (const token of due) {
    const pending = (token.patientAlerts || []).filter((a: any) =>
      force
        ? (a.whatsappStatus === 'failed' || a.whatsappStatus === 'abandoned') && a.message
        : a.whatsappStatus === 'failed' && a.nextRetryAt && new Date(a.nextRetryAt) <= now
    );
    if (pending.length === 0) {
      // Nothing actually due — reconcile the denormalised field so this token
      // stops being picked up every sweep.
      recomputeAlertRetryAt(token);
      token.markModified && token.markModified('patientAlerts');
      try {
        await token.save();
      } catch (err: any) {
        log.error('Could not reconcile an alert retry stamp', { err: err.message });
      }
      continue;
    }

    let patient: any = null;
    try {
      patient = token.patient ? await (Patient as any).findById(toId(token.patient)) : null;
    } catch (err: any) {
      log.error('Could not load a patient for an alert retry', { err: err.message });
    }
    const phone = patient && patient.phone ? String(patient.phone) : '';

    for (const alert of pending) {
      summary.attempted += 1;

      if (!phone || !alert.message) {
        alert.whatsappStatus = 'skipped';
        alert.nextRetryAt = null;
        alert.lastError = phone ? 'Nothing to send' : 'No phone number on file';
        continue;
      }

      // A forced attempt does not spend the automatic budget. Someone pressing
      // "try now" to check a freshly replaced credential should not be able to
      // burn the last scheduled retry out from under a patient.
      if (!force) alert.attempts = (alert.attempts || 0) + 1;

      let result: any = null;
      try {
        result = await sendWhatsAppNotification(phone, alert.message, io);
      } catch (err: any) {
        result = { status: 'failed', error: err.message };
      }

      if (result && result.status === 'sent') {
        alert.whatsappStatus = 'sent';
        alert.whatsappAt = new Date();
        alert.nextRetryAt = null;
        alert.lastError = undefined;
        summary.sent += 1;
        continue;
      }

      alert.lastError = String((result && result.error) || 'delivery_failed').slice(0, 300);

      // Forced and still refused: leave the schedule exactly as it was. The
      // alert keeps whatever automatic attempts it had left, and one that was
      // already given up on stays given up on.
      if (force) continue;

      const next = scheduleNextRetry(alert.attempts);
      if (next) {
        alert.nextRetryAt = next;
      } else {
        alert.whatsappStatus = 'abandoned';
        alert.nextRetryAt = null;
        summary.abandoned += 1;

        // Hand it to a human. An abandoned alert is the one case where the
        // patient may genuinely still not know, and the facility is the only
        // party who can pick up a phone.
        await logActivity(io, {
          hospital: token.hospital,
          type: 'patient-alert-abandoned',
          role: 'system',
          actor: 'Auto follow-up',
          message:
            `Could not deliver the ${alert.kind} notification for ${token.tokenNumber} on WhatsApp ` +
            `after ${alert.attempts} attempts — please call the patient. ` +
            `It is still visible on their tracker.`,
          tokenNumber: token.tokenNumber,
          refId: token._id,
          severity: 'warning'
        });
      }
    }

    recomputeAlertRetryAt(token);
    token.markModified && token.markModified('patientAlerts');
    try {
      await token.save();
    } catch (err: any) {
      log.error('Could not save retried patient alerts', { err: err.message });
    }

    // A tracker sitting open should pick the delivered alert up without waiting
    // for its next poll.
    toPatient(io, String(token._id), 'patient-alert', { refresh: true });
  }

  if (summary.attempted > 0) {
    log.info('Patient alert follow-up sweep complete', summary);
  }
  return summary;
}

/**
 * Clear the unread badge for one visit.
 *
 * Deliberately unauthenticated at the route above, like the rest of the tracker:
 * the token id IS the patient's credential here, and the worst a stranger with
 * one can do is mark someone's own notifications read.
 */
export async function markAlertsRead(tokenId: string): Promise<number> {
  const token = await (Token as any).findById(tokenId);
  if (!token) return 0;

  let changed = 0;
  for (const alert of token.patientAlerts || []) {
    if (!alert.readAt) {
      alert.readAt = new Date();
      changed += 1;
    }
  }
  if (changed > 0) {
    token.markModified && token.markModified('patientAlerts');
    await token.save();
  }
  return changed;
}
