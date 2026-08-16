import React, { useEffect, useRef, useState } from 'react';
import { BACKEND_URL } from '../App';
import { Icon } from './dashboard/DashboardKit';

/**
 * The doctor's own timings, and the "I'm running late" announcement.
 *
 * Two things that used to live nowhere. A doctor here typically sits twice —
 * morning OPD and evening OPD — and the only record of that was a sentence on
 * the public page that nothing could compute with, so the queue treated every
 * cabin as open all day. And when a doctor was delayed, the patients waiting on
 * them were told nothing at all; they found out by standing in the corridor.
 *
 * Both controls belong to the person who knows the answer, which is why they are
 * in the doctor's own portal rather than the admin console. Announcing a delay
 * is the one action here that reaches patients, so it says how many will be
 * messaged before it is pressed, and reports how many actually were.
 */

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const BLANK_SHIFT = { label: '', start: '', end: '', days: [] };

const inputCls =
  'w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3 py-2 outline-none text-[13px] font-semibold text-[var(--text-color)] transition-all';

function ShiftRow({ index, shift, onPatch, onRemove }) {
  const toggleDay = (day) => {
    const days = shift.days || [];
    onPatch({ days: days.includes(day) ? days.filter((d) => d !== day) : [...days, day] });
  };

  return (
    <div className="rounded-xl border border-[var(--border-color)]/40 bg-[var(--bg-color)] p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <input
          className="bg-transparent text-[13px] font-black text-[var(--text-color)] outline-none min-w-0 flex-1"
          placeholder={index === 0 ? 'Morning OPD' : 'Evening OPD'}
          value={shift.label}
          onChange={(e) => onPatch({ label: e.target.value })}
        />
        <button
          type="button"
          onClick={onRemove}
          title="Remove this sitting"
          className="w-6 h-6 rounded-lg text-rose-500 hover:bg-rose-500/10 flex items-center justify-center shrink-0 transition-all"
        >
          <Icon name="close" className="text-[15px]" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1">
          <span className="block text-[10px] font-black uppercase tracking-wider text-[var(--text-secondary)]">
            From
          </span>
          <input
            type="time"
            className={inputCls}
            value={shift.start}
            onChange={(e) => onPatch({ start: e.target.value })}
          />
        </label>
        <label className="space-y-1">
          <span className="block text-[10px] font-black uppercase tracking-wider text-[var(--text-secondary)]">
            To
          </span>
          <input
            type="time"
            className={inputCls}
            value={shift.end}
            onChange={(e) => onPatch({ end: e.target.value })}
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-1">
        {DAYS.map((day) => {
          const on = (shift.days || []).includes(day);
          return (
            <button
              key={day}
              type="button"
              onClick={() => toggleDay(day)}
              className={`px-2 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                on
                  ? 'bg-[var(--primary-color)] text-[var(--primary-text)] border-[var(--primary-color)]'
                  : 'bg-[var(--card-bg)] text-[var(--text-secondary)] border-[var(--border-color)]/50 hover:border-[var(--primary-color)]/40'
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-[var(--text-secondary)]">
        {(shift.days || []).length === 0
          ? 'No days picked — this sitting follows your usual OPD days.'
          : `Runs on ${(shift.days || []).join(', ')}.`}
      </p>
    </div>
  );
}

export function DoctorSchedulePanel({ doctorToken, schedule, waitingCount = 0, onSaved }) {
  const [shifts, setShifts] = useState([]);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const [lateMins, setLateMins] = useState('');
  const [newStart, setNewStart] = useState('');
  const [lateReason, setLateReason] = useState('');
  const [announcing, setAnnouncing] = useState(false);

  // Re-seed from the server only when the stored timings genuinely CHANGE.
  //
  // Keyed on the value, not the prop identity. The portal reloads its queue on
  // every `queue-updated` socket event — any patient booking, any token called,
  // anywhere in the facility — and each reload hands down a brand-new
  // `schedule` object. Depending on identity meant a doctor who added a sitting
  // and started typing lost the row the moment someone else booked a token.
  const seededFrom = useRef(null);
  useEffect(() => {
    const next = (schedule && schedule.shifts) || [];
    const key = JSON.stringify(next);
    if (seededFrom.current === key) return;
    seededFrom.current = key;
    setShifts(
      next.map((s) => ({ label: s.label || '', start: s.start || '', end: s.end || '', days: s.days || [] }))
    );
  }, [schedule]);

  const patchShift = (index, patch) =>
    setShifts((prev) => prev.map((s, i) => (i === index ? { ...s, ...patch } : s)));

  const removeShift = (index) => setShifts((prev) => prev.filter((_, i) => i !== index));

  const addShift = () => setShifts((prev) => [...prev, { ...BLANK_SHIFT, days: [] }]);

  const saveSchedule = async () => {
    setError('');
    setNote('');

    const incomplete = shifts.some((s) => !s.start || !s.end);
    if (incomplete) {
      setError('Every sitting needs both a start and an end time.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/doctor/schedule`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${doctorToken}` },
        body: JSON.stringify({ shifts })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'Could not save your timings.');
        return;
      }
      setNote(data.opdHours ? `Saved — your OPD shows as ${data.opdHours}.` : 'Timings cleared.');
      if (onSaved) onSaved();
    } catch (err) {
      setError('Network error — your timings were not saved.');
    } finally {
      setSaving(false);
    }
  };

  /**
   * Announce today's revised start.
   *
   * Sends whichever form the doctor filled in — an exact clock time wins over a
   * number of minutes, because someone who typed "11:30" after tapping "+30"
   * meant the time they typed. The server moves today's sitting, recomputes
   * every waiting patient's estimate and WhatsApps them their own new time.
   */
  const announceLate = async () => {
    setError('');
    setNote('');

    const mins = parseInt(lateMins, 10);
    if (!newStart && (isNaN(mins) || mins < 1)) {
      setError('Say how late you are, or give your new start time.');
      return;
    }

    setAnnouncing(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/doctor/queue/shift-time`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${doctorToken}` },
        body: JSON.stringify(
          newStart ? { start: newStart, reason: lateReason } : { minutes: mins, reason: lateReason }
        )
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'Could not announce the delay.');
        return;
      }
      setNote(data.message || 'Patients notified.');
      setLateMins('');
      setLateReason('');
      setNewStart('');
      if (onSaved) onSaved();
    } catch (err) {
      setError('Network error — nobody was notified.');
    } finally {
      setAnnouncing(false);
    }
  };

  /** "I made it after all" — put the printed hours back. */
  const clearDelay = async () => {
    setError('');
    setNote('');
    setAnnouncing(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/doctor/queue/shift-time`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${doctorToken}` }
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'Could not clear the delay.');
        return;
      }
      setNote(data.message || 'Delay cleared.');
      if (onSaved) onSaved();
    } catch (err) {
      setError('Network error — the delay is still showing.');
    } finally {
      setAnnouncing(false);
    }
  };

  const status = schedule && schedule.status;
  const printed = (schedule && schedule.opdHours) || '';
  const delay = (schedule && schedule.delay) || null;

  return (
    <div className="bg-[var(--card-bg)] border border-[var(--border-color)]/30 rounded-2xl p-5 space-y-5 shadow-[var(--card-shadow)]">
      {/* ---- Sitting hours ---- */}
      <div>
        <h4 className="font-bold text-[var(--text-color)] text-[15px] flex items-center gap-1.5">
          <Icon name="schedule" className="text-[18px] text-[var(--primary-color)]" />
          My OPD timings
        </h4>
        <p className="text-[13px] text-[var(--text-secondary)] mt-0.5">
          Add a sitting for each time you see patients — morning and evening are separate.
        </p>
      </div>

      {status && !status.unscheduled && (
        <div
          className={`rounded-xl px-3 py-2 text-[12px] font-bold border ${
            status.sitting
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600'
              : 'bg-amber-500/10 border-amber-500/30 text-amber-600'
          }`}
        >
          {status.sitting
            ? 'You are inside a sitting right now — patients see a live wait.'
            : status.nextStart
              ? `Not sitting now. Next OPD starts in about ${status.minutesUntilStart} min — new bookings are quoted from then.`
              : 'Not sitting now, and no upcoming OPD is scheduled this week.'}
        </div>
      )}

      <div className="space-y-2.5">
        {shifts.map((shift, i) => (
          <ShiftRow
            key={i}
            index={i}
            shift={shift}
            onPatch={(patch) => patchShift(i, patch)}
            onRemove={() => removeShift(i)}
          />
        ))}

        {shifts.length === 0 && (
          <p className="text-[12px] text-[var(--text-secondary)] bg-[var(--bg-color)] border border-dashed border-[var(--border-color)]/50 rounded-xl px-3 py-3">
            No sittings set. Your cabin is treated as open all day, so waiting times are estimated from the
            queue alone.
          </p>
        )}

        {shifts.length < 3 && (
          <button
            type="button"
            onClick={addShift}
            className="w-full border border-dashed border-[var(--border-color)] hover:border-[var(--primary-color)]/50 rounded-xl py-2.5 text-[12px] font-bold text-[var(--text-secondary)] hover:text-[var(--primary-color)] flex items-center justify-center gap-1.5 transition-all"
          >
            <Icon name="add" className="text-[16px]" />
            Add {shifts.length === 0 ? 'a sitting' : 'another sitting'}
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={saveSchedule}
        disabled={saving}
        className="w-full bg-[var(--primary-color)] hover:bg-[var(--primary-container)] text-[var(--primary-text)] font-black py-2.5 rounded-xl text-[13px] transition-all active:scale-95 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save timings'}
      </button>

      {printed && (
        <p className="text-[11px] text-[var(--text-secondary)] text-center">
          Patients see:{' '}
          <span
            className={`font-bold ${delay?.delayed ? 'text-[var(--text-secondary)] line-through' : 'text-[var(--text-color)]'}`}
          >
            {printed}
          </span>
          {delay?.delayed && schedule?.opdHoursToday && (
            <>
              {' '}
              <span className="font-bold text-amber-600">{schedule.opdHoursToday}</span>{' '}
              <span className="text-amber-600">today</span>
            </>
          )}
        </p>
      )}

      {/* ---- Running late ---- */}
      <div className="pt-4 border-t border-[var(--border-color)]/30 space-y-3">
        <div>
          <h4 className="font-bold text-[var(--text-color)] text-[15px] flex items-center gap-1.5">
            <Icon name="notifications_active" className="text-[18px] text-amber-500" />
            Running late today
          </h4>
          <p className="text-[13px] text-[var(--text-secondary)] mt-0.5">
            {waitingCount > 0
              ? `Your sitting time moves for today only, and all ${waitingCount} waiting patient(s) get a WhatsApp with their new time.`
              : 'Your sitting time moves for today only. Nobody is waiting yet, so anyone booking next is quoted from the new time.'}
          </p>
        </div>

        {/* Already announced — show it, and offer to take it back. */}
        {delay?.delayed && (
          <div className="rounded-xl px-3 py-2.5 bg-amber-500/10 border border-amber-500/30 space-y-2">
            <p className="text-[12px] font-bold text-amber-600">
              Announced: you now start at {delay.revisedStart} instead of {delay.originalStart} (
              {delay.minutesLate} min late){delay.reason ? ` — ${delay.reason}` : ''}.
            </p>
            <button
              type="button"
              onClick={clearDelay}
              disabled={announcing}
              className="text-[11px] font-bold text-amber-700 hover:text-amber-800 underline disabled:opacity-40"
            >
              I made it after all — put my normal hours back
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          {[15, 30, 45, 60].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setLateMins(String(m));
                // The two inputs are alternatives, so choosing one clears the
                // other — otherwise a stale time silently wins at send.
                setNewStart('');
              }}
              className={`p-2 rounded-xl text-[12px] font-bold border transition-all ${
                String(m) === lateMins && !newStart
                  ? 'bg-amber-500 text-white border-amber-500'
                  : 'bg-[var(--bg-color)] border-[var(--border-color)] text-[var(--text-color)] hover:border-amber-500/40'
              }`}
            >
              {m} min late
            </button>
          ))}
        </div>

        <div className="space-y-1">
          <label className="text-[11px] font-bold text-[var(--text-secondary)] uppercase tracking-wide">
            …or the time you will actually start
          </label>
          <input
            type="time"
            className={inputCls}
            value={newStart}
            onChange={(e) => {
              setNewStart(e.target.value);
              if (e.target.value) setLateMins('');
            }}
          />
        </div>

        <input
          type="text"
          maxLength={140}
          className={inputCls}
          placeholder="Reason (optional) — e.g. emergency case, traffic"
          value={lateReason}
          onChange={(e) => setLateReason(e.target.value)}
        />

        <button
          type="button"
          onClick={announceLate}
          disabled={announcing || (!lateMins && !newStart)}
          className="w-full bg-amber-500 hover:bg-amber-600 text-white font-black py-2.5 rounded-xl text-[13px] flex items-center justify-center gap-1.5 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Icon name="send" className="text-[16px]" />
          {announcing ? 'Notifying patients…' : 'Update my start time & tell patients'}
        </button>
      </div>

      {error && (
        <p className="text-[12px] font-bold text-rose-500 flex items-center gap-1">
          <Icon name="error" className="text-[14px]" />
          <span>{error}</span>
        </p>
      )}
      {note && !error && (
        <p className="text-[12px] font-bold text-emerald-600 flex items-center gap-1">
          <Icon name="check_circle" className="text-[14px]" />
          <span>{note}</span>
        </p>
      )}
    </div>
  );
}

export default DoctorSchedulePanel;
