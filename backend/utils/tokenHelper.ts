import Token from '../models/Token';
import logger from './logger';
import { startOfToday } from './dates';

// Retries before booking gives up. Each one now proposes a genuinely different
// number, so this is a bound on concurrent bookings racing for the same slot,
// not (as before) five identical attempts at a number the index had refused.
const MAX_TOKEN_SAVE_ATTEMPTS = 10;

/**
 * Generates a daily resetting token number (T-1, T-2, T-3...) for current date.
 * Filtered by today's date (createdAt >= startOfDay), ensuring every new day tokens
 * start at 1 while keeping ALL historical patient data, visits, and tokens 100% safe in DB.
 */
export async function generateUniqueTokenNumber(
  hospitalId?: string | null,
  avoid?: Iterable<string> | null
): Promise<string> {
  try {
    const startOfDay = startOfToday();

    const query: Record<string, any> = {};
    if (hospitalId) {
      query.hospital = hospitalId;
    }

    // Tokens of this facility, narrowed to TODAY here in JS rather than with a
    // `createdAt: { $gte: startOfDay }` clause in the query. The in-memory dev DB
    // (USE_MOCK_DB) stores createdAt as an ISO string, so that clause matched
    // nothing there: every booking of the day was handed "T-1", collided on the
    // (tokenNumber, hospital) unique index, and the patient's token was silently
    // lost. Same reasoning as queueHelper.getTodayTokenCount.
    const allTokens = await (Token as any).find(query).select('tokenNumber createdAt');
    const todayTokens = (allTokens || []).filter(
      (t: any) => t && t.createdAt && new Date(t.createdAt).getTime() >= startOfDay.getTime()
    );

    // WHERE the counter starts: today's highest number, so each morning opens at
    // T-1 for the patients and the boards.
    let maxNum = 0;
    for (const t of todayTokens) {
      const num = parseTokenNumber(t && t.tokenNumber);
      if (num > maxNum) maxNum = num;
    }

    // WHAT is actually forbidden: every number this facility still holds in the
    // collection, of ANY date — because that is precisely what the unique index
    // `{tokenNumber, hospital}` enforces.
    //
    // This used to be today's numbers only, and the mismatch deadlocked booking.
    // The close-of-day (jobs/dailyReset) deliberately CARRIES FORWARD any token
    // still mid-treatment — In Consultation, Lab Pending, Lab Complete, Pharmacy
    // Pending — so yesterday's T-1 can still be sitting in the collection this
    // morning. Today's view saw no tokens, proposed T-1, the index rejected it,
    // and saveTokenWithRetry asked for another number — getting the identical
    // T-1 every time, because nothing about the calculation had changed. Five
    // attempts later the patient was told "Could not allocate a free token
    // number", which is the failure in the bug report. The same deadlock hit any
    // facility whose close-of-day had not run (a restarted or sleeping host):
    // then EVERY one of yesterday's tokens blocked its number.
    const taken = new Set<string>((allTokens || []).map((t: any) => t && t.tokenNumber).filter(Boolean));
    // Numbers already tried and rejected inside the current save loop. The write
    // that beat us to a number may not be visible to this read yet (a concurrent
    // booking, or a replica lag), so a collision we have already SEEN counts as
    // taken even when the query says otherwise.
    for (const n of avoid || []) taken.add(n);

    let nextNum = maxNum + 1;
    let tokenNumber = `T-${nextNum}`;
    while (taken.has(tokenNumber)) {
      nextNum++;
      tokenNumber = `T-${nextNum}`;
    }

    return tokenNumber;
  } catch (err) {
    logger.error('Error generating daily token number', { err });
    return `T-${Date.now().toString().slice(-4)}${Math.floor(Math.random() * 90 + 10)}`;
  }
}

/** The numeric part of "T-42" (or a bare "42"); 0 when there isn't one. */
function parseTokenNumber(value?: string | null): number {
  if (!value) return 0;
  const match = value.match(/T-(\d+)/i) || value.match(/\d+/);
  if (!match) return 0;
  const num = parseInt(match[1] || match[0], 10);
  return isNaN(num) ? 0 : num;
}

/**
 * Saves a Token document with automatic retry for duplicate key handling.
 */
export async function saveTokenWithRetry(tokenDoc: any): Promise<any> {
  let saved = false;
  let retryCount = 0;

  // Every number the index has already rejected for this document. Feeding it
  // back into the generator is what makes a retry actually try something NEW —
  // without it the loop re-proposed the same number five times and gave up.
  const rejected = new Set<string>();

  while (!saved && retryCount < MAX_TOKEN_SAVE_ATTEMPTS) {
    try {
      await tokenDoc.save();
      saved = true;
    } catch (err: any) {
      if (err.code === 11000 || (err.message && err.message.includes('E11000'))) {
        retryCount++;
        if (tokenDoc.tokenNumber) rejected.add(tokenDoc.tokenNumber);
        const newNum = await generateUniqueTokenNumber(tokenDoc.hospital, rejected);
        tokenDoc.tokenNumber = newNum;
        logger.warn('[TOKEN] Duplicate token number resolved, retrying', {
          hospital: tokenDoc.hospital,
          tokenNumber: newNum,
          attempt: retryCount
        });
      } else {
        throw err;
      }
    }
  }

  // Never hand back an UNSAVED token. This used to return the document anyway
  // once the retries ran out, so the caller pushed a token id that exists in no
  // collection into the doctor's queue: the patient was told "Booking Complete"
  // for a token nobody could ever see. Failing loudly is the only honest answer.
  if (!saved) {
    throw new Error(
      `Could not allocate a free token number for ${tokenDoc.hospital} after ${retryCount} attempts`
    );
  }
  return tokenDoc;
}
