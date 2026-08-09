const Token = require('../models/Token');
const logger = require('./logger');

/**
 * Generates a daily resetting token number (T-1, T-2, T-3...) for current date.
 * Filtered by today's date (createdAt >= startOfDay), ensuring every new day tokens
 * start at 1 while keeping ALL historical patient data, visits, and tokens 100% safe in DB.
 *
 * @param {string} [hospitalId] Optional hospital tenant ID
 * @returns {Promise<string>} Daily token number, e.g. "T-1", "T-2"
 */
async function generateUniqueTokenNumber(hospitalId) {
  try {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const query = {};
    if (hospitalId) {
      query.hospital = hospitalId;
    }

    // Tokens of this facility, narrowed to TODAY here in JS rather than with a
    // `createdAt: { $gte: startOfDay }` clause in the query. The in-memory dev DB
    // (USE_MOCK_DB) stores createdAt as an ISO string, so that clause matched
    // nothing there: every booking of the day was handed "T-1", collided on the
    // (tokenNumber, hospital) unique index, and the patient's token was silently
    // lost. Same reasoning as queueHelper.getTodayTokenCount.
    const allTokens = await Token.find(query).select('tokenNumber createdAt');
    const todayTokens = (allTokens || []).filter(
      (t) => t && t.createdAt && new Date(t.createdAt).getTime() >= startOfDay.getTime()
    );
    let maxNum = 0;

    for (const t of todayTokens) {
      if (t && t.tokenNumber) {
        const match = t.tokenNumber.match(/T-(\d+)/i) || t.tokenNumber.match(/\d+/);
        if (match) {
          const num = parseInt(match[1] || match[0], 10);
          if (!isNaN(num) && num > maxNum) {
            maxNum = num;
          }
        }
      }
    }

    let nextNum = maxNum + 1;
    let tokenNumber = `T-${nextNum}`;

    // Collision check against the numbers already handed out today (same in-JS
    // date filter, for the same reason).
    const takenToday = new Set(todayTokens.map((t) => t.tokenNumber));
    while (takenToday.has(tokenNumber)) {
      nextNum++;
      tokenNumber = `T-${nextNum}`;
    }

    return tokenNumber;
  } catch (err) {
    logger.error('Error generating daily token number', { err: err });
    return `T-${Date.now().toString().slice(-4)}${Math.floor(Math.random() * 90 + 10)}`;
  }
}

/**
 * Saves a Token document with automatic retry for duplicate key handling.
 *
 * @param {object} tokenDoc Mongoose Token document instance
 * @returns {Promise<object>} Saved token document
 */
async function saveTokenWithRetry(tokenDoc) {
  let saved = false;
  let retryCount = 0;

  while (!saved && retryCount < 5) {
    try {
      await tokenDoc.save();
      saved = true;
    } catch (err) {
      if (err.code === 11000 || (err.message && err.message.includes('E11000'))) {
        retryCount++;
        const newNum = await generateUniqueTokenNumber(tokenDoc.hospital);
        tokenDoc.tokenNumber = newNum;
        console.warn(
          `[E11000 DUP KEY RESOLVED] Automatically regenerated token number to ${tokenDoc.tokenNumber} (Attempt ${retryCount})`
        );
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

module.exports = {
  generateUniqueTokenNumber,
  saveTokenWithRetry
};
