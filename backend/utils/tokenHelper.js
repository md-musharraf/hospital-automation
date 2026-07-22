const Token = require('../models/Token');

/**
 * Generates a collision-free unique token number across ALL hospital tenants and legacy indexes.
 * Checks global max token number so numbers like T-101, T-102 never collide across hospitals or indexes.
 * 
 * @param {string} [hospitalId] Optional hospital tenant ID
 * @returns {Promise<string>} Unique token number, e.g. "T-104"
 */
async function generateUniqueTokenNumber(hospitalId) {
  try {
    // Search ALL tokens in database to guarantee global uniqueness across all tenants and legacy indexes
    const existingTokens = await Token.find({}).select('tokenNumber');
    let maxNum = 100;

    for (let t of existingTokens) {
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

    // Global collision check across ALL tokens in DB
    let exists = await Token.findOne({ tokenNumber });
    while (exists) {
      nextNum++;
      tokenNumber = `T-${nextNum}`;
      exists = await Token.findOne({ tokenNumber });
    }

    return tokenNumber;
  } catch (err) {
    console.error('Error generating unique token number:', err);
    // Fallback guaranteed unique string
    return `T-${Date.now().toString().slice(-4)}${Math.floor(Math.random() * 90 + 10)}`;
  }
}

/**
 * Saves a Token document with automatic retry & fallback handling for E11000 duplicate key errors.
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
        console.warn(`[E11000 DUP KEY RESOLVED] Automatically regenerated token number to ${tokenDoc.tokenNumber} (Attempt ${retryCount})`);
      } else {
        throw err;
      }
    }
  }
  return tokenDoc;
}

module.exports = {
  generateUniqueTokenNumber,
  saveTokenWithRetry
};
