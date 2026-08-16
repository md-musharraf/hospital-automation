/**
 * The nightly close-of-day: archive the day's tokens, clear the boards, and let
 * every facility start tomorrow at T-1.
 */

import Token from '../models/Token';
import Queue from '../models/Queue';
import Doctor from '../models/Doctor';
import ArchivedToken from '../models/ArchivedToken';
import logger from '../utils/logger';
import { toFacility } from '../utils/realtime';
import { pruneOverrides } from '../utils/shiftHelper';

/**
 * Journey stages that mean treatment is still in progress.
 */
export const CARRY_FORWARD_STAGES: Set<string> = new Set([
  'In Consultation',
  'Lab Pending',
  'Lab Complete',
  'Pharmacy Pending'
]);

/** Flatten one token into the archive's denormalized shape. */
export function toArchiveRecord(token: any): Record<string, any> {
  return {
    tokenNumber: token.tokenNumber,
    hospital: token.hospital,
    status: token.status,
    tokenType: token.tokenType,
    patientDetails: token.patient
      ? {
          name: token.patient.name,
          age: token.patient.age,
          gender: token.patient.gender,
          phone: token.patient.phone
        }
      : { name: 'Unknown' },
    doctorDetails: token.doctor
      ? {
          name: token.doctor.name,
          department: token.doctor.department,
          currentRoom: token.doctor.currentRoom
        }
      : { name: 'Unknown' },
    symptoms: token.symptoms,
    calledAt: token.calledAt,
    completedAt: token.completedAt
  };
}

/**
 * Close the day for one facility.
 */
export async function resetFacility(io: any, hospital: string, tokens: any[]): Promise<Record<string, any>> {
  const finished = tokens.filter((t) => !CARRY_FORWARD_STAGES.has(t.journeyStage));
  const carried = tokens.length - finished.length;

  if (finished.length > 0) {
    await (ArchivedToken as any).insertMany(finished.map(toArchiveRecord));
    await (Token as any).deleteMany({ _id: { $in: finished.map((t) => t._id) } });
  }

  const doctors = await (Doctor as any).find({ hospital }).select('_id shiftOverrides');
  if (doctors.length > 0) {
    await (Queue as any).updateMany(
      { doctor: { $in: doctors.map((d: any) => d._id) } },
      { currentToken: null, activeQueue: [], bufferDelay: 0, delayReason: '', delayedUntil: null }
    );

    // Yesterday's "I'll be 30 minutes late" must not survive into today. The
    // lookup is keyed by date so a stale row never applies, but clearing it
    // keeps the record from growing one sub-document per late day forever, and
    // keeps the doctor's own screen from showing a delay banner at 8am.
    for (const doctor of doctors) {
      if (pruneOverrides(doctor)) {
        try {
          doctor.markModified && doctor.markModified('shiftOverrides');
          await doctor.save();
        } catch (err) {
          logger.error('Could not prune stale shift overrides', { err, doctor: String(doctor._id) });
        }
      }
    }
  }

  toFacility(io, hospital, 'queue-reset', { archived: finished.length, carried });

  return { hospital, archived: finished.length, carried, doctors: doctors.length };
}

/**
 * Run the close-of-day for every facility that had activity.
 */
export async function runDailyReset(io?: any): Promise<any[]> {
  const startedAt = Date.now();
  logger.info('[DAILY-RESET] Starting close-of-day');

  const tokens = await (Token as any)
    .find({}, null, { allTenants: true })
    .populate('patient')
    .populate('doctor');

  const byFacility = new Map<string, any[]>();
  for (const token of tokens || []) {
    const hospital = token.hospital || 'general-hospital';
    if (!byFacility.has(hospital)) byFacility.set(hospital, []);
    (byFacility.get(hospital) as any[]).push(token);
  }

  const summaries: any[] = [];
  for (const [hospital, facilityTokens] of byFacility) {
    try {
      summaries.push(await resetFacility(io, hospital, facilityTokens));
    } catch (err: any) {
      logger.error('[DAILY-RESET] Facility failed', { hospital, err: err.message });
      summaries.push({ hospital, failed: true, error: err.message });
    }
  }

  logger.info('[DAILY-RESET] Complete', {
    facilities: summaries.length,
    archived: summaries.reduce((n, s) => n + (s.archived || 0), 0),
    carriedForward: summaries.reduce((n, s) => n + (s.carried || 0), 0),
    failed: summaries.filter((s) => s.failed).length,
    ms: Date.now() - startedAt
  });

  return summaries;
}
