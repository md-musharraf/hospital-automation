/**
 * Multi-tenant scoping — the rule that one facility can never see another's data.
 *
 * This logic ("find the doctors of this hospital, then keep the tokens whose
 * doctor is one of them") was hand-rolled in lab.js, pharmacy.js, ops.js and
 * chat.js. Every copy is a chance to forget the filter, and forgetting it here
 * does not throw an error — it silently leaks one hospital's patients into
 * another hospital's screen. That makes it exactly the wrong thing to duplicate.
 *
 * Everything below is READ-side scoping. Write paths should still verify
 * ownership explicitly before mutating (see `assertSameFacility`).
 */

const Doctor = require('../models/Doctor');
const Token = require('../models/Token');
const { toId, idIn } = require('./ids');
const { HttpError } = require('../middleware/asyncHandler');

/** The hospital this authenticated request belongs to. */
function facilityOf(req) {
  return (req.user && req.user.hospital) || 'general-hospital';
}

/** Every doctor registered at this facility (never across facilities). */
async function facilityDoctors(hospital, projection = '-passwordHash') {
  return (await Doctor.find({ hospital }, projection)) || [];
}

/** Just their ids — the usual input to a `$in` filter. */
async function facilityDoctorIds(hospital) {
  return (await facilityDoctors(hospital)).map((doctor) => toId(doctor));
}

/**
 * Tokens belonging to this facility.
 *
 * Filters on BOTH the token's own `hospital` field and its doctor's facility:
 * the two can only disagree if data was written incorrectly, and when they do we
 * choose to show less rather than leak.
 */
async function facilityTokens(hospital, { populate = true } = {}) {
  const doctorIds = await facilityDoctorIds(hospital);

  let query = Token.find({ hospital });
  if (populate) query = query.populate('patient').populate('doctor', '-passwordHash');

  const tokens = (await query) || [];
  return tokens.filter((token) => idIn(token.doctor, doctorIds));
}

/**
 * Guard a write: throws 403 unless `document` belongs to `hospital`.
 * Reads the facility from the document's own field or a related doctor.
 */
function assertSameFacility(document, hospital, label = 'record') {
  const owner = document && (document.hospital || (document.doctor && document.doctor.hospital));
  if (!document || owner !== hospital) {
    throw new HttpError(403, `This ${label} belongs to another facility.`);
  }
  return document;
}

module.exports = { facilityOf, facilityDoctors, facilityDoctorIds, facilityTokens, assertSameFacility };
