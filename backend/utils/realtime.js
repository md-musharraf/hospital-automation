// Realtime backbone for CareeAi.
//
// Before this module every change in the building emitted one blunt
// `queue-updated` into a single global room, so: (a) every facility's dashboards
// woke up for every other facility's events — a tenant leak in the live layer and
// a lot of pointless re-fetching, and (b) a portal could not tell "a lab report
// landed" apart from "a doctor added buffer time", so it just re-fetched
// everything or ignored it.
//
// Here events are addressed to a FACILITY and, optionally, to a ROLE inside it,
// and they carry a specific name. `queue-updated` is still emitted alongside the
// new events so nothing that listens for it today breaks.

const ActivityLog = require('../models/ActivityLog');

/** Room names. Every portal joins `hospital:<id>` and `role:<role>:<id>`. */
const facilityRoom = (hospital) => `hospital:${hospital || 'general-hospital'}`;
const roleRoom = (role, hospital) => `role:${role}:${hospital || 'general-hospital'}`;
const doctorRoom = (doctorId) => `doctor:${doctorId}`;
const patientRoom = (tokenId) => `patient:${tokenId}`;

/**
 * Emit an event to everyone in one facility.
 * `alsoLegacy` additionally fires the old global `queue-updated` so existing
 * listeners (PublicTVDisplay, PatientLiveTracker, older portals) keep working.
 */
function toFacility(io, hospital, event, payload = {}, { alsoLegacy = false } = {}) {
  if (!io) return;
  try {
    const body = { hospital, at: new Date().toISOString(), ...payload };
    io.to(facilityRoom(hospital)).emit(event, body);
    if (alsoLegacy) {
      io.to(facilityRoom(hospital)).emit('queue-updated', body);
      io.to('queue:global').emit('queue-updated', body);
    }
  } catch (err) {
    console.error(`[REALTIME] emit ${event} failed:`, err.message);
  }
}

/** Emit to one role inside one facility (e.g. only the lab bench screens). */
function toRole(io, role, hospital, event, payload = {}) {
  if (!io) return;
  try {
    io.to(roleRoom(role, hospital)).emit(event, { hospital, at: new Date().toISOString(), ...payload });
  } catch (err) {
    console.error(`[REALTIME] role emit ${event} failed:`, err.message);
  }
}

/** Emit to a single doctor's console. */
function toDoctor(io, doctorId, event, payload = {}) {
  if (!io || !doctorId) return;
  try {
    io.to(doctorRoom(doctorId)).emit(event, { at: new Date().toISOString(), ...payload });
  } catch (err) {
    console.error(`[REALTIME] doctor emit ${event} failed:`, err.message);
  }
}

/** Emit to the patient watching one specific token (live tracker / portal). */
function toPatient(io, tokenId, event, payload = {}) {
  if (!io || !tokenId) return;
  try {
    io.to(patientRoom(tokenId)).emit(event, { at: new Date().toISOString(), ...payload });
  } catch (err) {
    console.error(`[REALTIME] patient emit ${event} failed:`, err.message);
  }
}

/**
 * Record one line in the facility's activity feed AND push it live.
 * Always best-effort: the feed is an observability nicety, so a failure here must
 * never break the clinical action that triggered it.
 */
async function logActivity(io, entry = {}) {
  const {
    hospital = 'general-hospital', type = 'system', role = 'system',
    actor, message, tokenNumber, refId, severity = 'info'
  } = entry;

  if (!message) return null;

  let saved = null;
  try {
    saved = await new ActivityLog({
      hospital, type, role, actor, message, tokenNumber,
      refId: refId ? String(refId) : undefined,
      severity
    }).save();
  } catch (err) {
    console.error('[ACTIVITY] persist failed:', err.message);
  }

  // Push even if persistence failed — a live viewer still wants to see it.
  toFacility(io, hospital, 'activity', {
    _id: saved && saved._id, type, role, actor, message, tokenNumber,
    refId: refId ? String(refId) : undefined, severity,
    createdAt: (saved && saved.createdAt) || new Date()
  });

  return saved;
}

/**
 * The one call a route makes after changing a token: tell the whole facility the
 * patient moved, keep legacy listeners alive, and (optionally) drop a feed line.
 */
async function announceJourney(io, { hospital, token, stage, actor, role, message, type, severity }) {
  toFacility(io, hospital, 'journey-updated', {
    tokenId: token && String(token._id),
    tokenNumber: token && token.tokenNumber,
    stage,
    doctorId: token && token.doctor && String(token.doctor._id || token.doctor)
  }, { alsoLegacy: true });

  if (token) {
    toPatient(io, String(token._id), 'journey-updated', { stage, tokenNumber: token.tokenNumber });
  }

  if (message) {
    await logActivity(io, {
      hospital, type: type || 'system', role, actor, message,
      tokenNumber: token && token.tokenNumber,
      refId: token && token._id,
      severity
    });
  }
}

module.exports = {
  facilityRoom, roleRoom, doctorRoom, patientRoom,
  toFacility, toRole, toDoctor, toPatient,
  logActivity, announceJourney
};
