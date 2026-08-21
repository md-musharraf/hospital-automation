import React, { useEffect, useRef, useState } from 'react';
import { BACKEND_URL } from '../App';
import { Icon } from './dashboard/DashboardKit';

/**
 * "I am not coming in on these days."
 *
 * Sits next to the sitting hours and the running-late announcement, because it
 * is the third answer to the same question — when will this cabin be open — and
 * a doctor looking for one of the three should not have to know which screen
 * each of them lives on.
 *
 * The design decision that matters here is the IMPACT PREVIEW. Filing leave is
 * not a private calendar entry: bookings are placed up to a week ahead, so the
 * dates a doctor is about to block usually already have people on them, and
 * pressing the button messages every one of them. A control that reaches
 * patients has to say so before it is pressed, not after — the same rule the
 * delay announcement next door follows. So the moment both dates are filled the
 * panel asks the server who is booked, and the button itself carries the count.
 */

/** Today as "YYYY-MM-DD" in the browser's own timezone, matching the server's keys. */
function todayKey() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

/** "2026-08-28" → "28 Aug". Never numeric — 08/28 and 28/08 read the same. */
function pretty(key) {
  if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return '';
  const date = new Date(`${key}T00:00:00`);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

/** How a range reads on one line. */
function span(leave) {
  if (!leave) return '';
  return leave.from === leave.to ? pretty(leave.from) : `${pretty(leave.from)} – ${pretty(leave.to)}`;
}

const inputCls =
  'w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3 py-2 outline-none text-[13px] font-semibold text-[var(--text-color)] transition-all';

/** One filed leave, with the way out of it. */
function LeaveRow({ leave, onCancel, busy }) {
  return (
    <div className="rounded-xl border border-[var(--border-color)]/40 bg-[var(--bg-color)] px-3 py-2.5 flex items-center gap-3">
      <span className="w-9 h-9 rounded-lg bg-amber-500/12 text-amber-600 flex items-center justify-center shrink-0">
        <Icon name="event_busy" className="text-[19px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-black text-[var(--text-color)] truncate">{span(leave)}</span>
        <span className="block text-[11.5px] font-semibold text-[var(--text-secondary)] truncate">
          {leave.reason || 'No reason given'}
          {leave.by ? ` · filed by ${leave.by}` : ''}
        </span>
      </span>
      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        title="Cancel this leave — you will be back on the board"
        className="px-2.5 py-1.5 rounded-lg text-[11.5px] font-black text-rose-500 hover:bg-rose-500/10 disabled:opacity-50 shrink-0 transition-all"
      >
        {busy ? '…' : 'Cancel'}
      </button>
    </div>
  );
}

/**
 * The people already booked into the dates being blocked.
 *
 * Shown as names and numbers rather than a bare count, because the count alone
 * ("6 patients") does not tell a doctor whether this is the week they can
 * afford to be away — six strangers and six of their own follow-ups are
 * different decisions.
 */
function AffectedList({ rows, notified }) {
  if (!rows || rows.length === 0) return null;
  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.07] p-3 space-y-2">
      <p className="text-[12px] font-black text-amber-600 flex items-center gap-1.5">
        <Icon name="group" className="text-[16px]" />
        {rows.length} patient{rows.length === 1 ? ' is' : 's are'} already booked on{' '}
        {rows.length === 1 ? 'that day' : 'those days'}
        {notified ? ' — all told' : ''}
      </p>
      <div className="space-y-1 max-h-40 overflow-y-auto">
        {rows.map((row) => (
          <div
            key={row.tokenId || row.tokenNumber}
            className="flex items-center gap-2 text-[11.5px] bg-[var(--card-bg)] rounded-lg px-2.5 py-1.5"
          >
            <span className="font-black text-[var(--text-color)] shrink-0">{row.tokenNumber}</span>
            <span className="text-[var(--text-secondary)] font-semibold truncate min-w-0 flex-1">
              {row.patientName || 'Unnamed'} · {pretty(row.appointmentDate)}
            </span>
            {row.patientPhone && (
              <a
                href={`tel:${row.patientPhone}`}
                className="font-bold text-[var(--primary-color)] shrink-0 hover:underline"
              >
                {row.patientPhone}
              </a>
            )}
          </div>
        ))}
      </div>
      <p className="text-[11px] font-semibold text-[var(--text-secondary)]">
        {notified
          ? 'They have been WhatsApped not to travel. Reception will move the appointments.'
          : 'They will be WhatsApped not to travel, and reception gets this list to move them.'}
      </p>
    </div>
  );
}

export function DoctorLeavePanel({ doctorToken, onSaved }) {
  const [leaves, setLeaves] = useState([]);
  const [status, setStatus] = useState(null);

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');

  const [preview, setPreview] = useState(null);
  const [filed, setFiled] = useState(null);
  const [saving, setSaving] = useState(false);
  const [cancelling, setCancelling] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const auth = { Authorization: `Bearer ${doctorToken}` };

  const load = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/doctor/leave`, { headers: auth });
      const data = await res.json();
      if (!res.ok) return;
      setLeaves(data.leaves || []);
      setStatus(data.status || null);
    } catch (_) {
      /* the panel is still usable; the list just stays as it was */
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctorToken]);

  /**
   * Ask who is booked, once the doctor stops typing.
   *
   * Debounced and guarded by a request id: a date input fires on every keystroke
   * in the year field, and without the guard an early reply for "2026" could
   * land after the real one and show a count for the wrong range.
   */
  const previewSeq = useRef(0);
  useEffect(() => {
    if (!from) {
      setPreview(null);
      return;
    }
    const seq = ++previewSeq.current;
    const timer = setTimeout(async () => {
      try {
        const query = new URLSearchParams({ from, to: to || from }).toString();
        const res = await fetch(`${BACKEND_URL}/api/v1/doctor/leave?${query}`, { headers: auth });
        const data = await res.json();
        if (seq !== previewSeq.current) return;
        setPreview(res.ok ? data.preview : null);
      } catch (_) {
        if (seq === previewSeq.current) setPreview(null);
      }
    }, 400);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, doctorToken]);

  const fileLeave = async () => {
    setError('');
    setNote('');
    setFiled(null);

    if (!from) {
      setError('Pick the first day you will be away.');
      return;
    }
    if (to && to < from) {
      setError('The last day cannot be before the first day.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/doctor/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({ from, to: to || from, reason })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'Could not file your leave.');
        return;
      }
      setNote(data.message || 'Leave filed.');
      setFiled(data.affected || []);
      setLeaves(data.leaves || []);
      setStatus(data.status || null);
      setFrom('');
      setTo('');
      setReason('');
      setPreview(null);
      if (onSaved) onSaved();
    } catch (err) {
      setError('Network error — your leave was not filed.');
    } finally {
      setSaving(false);
    }
  };

  const cancel = async (leave) => {
    setError('');
    setNote('');
    setFiled(null);
    setCancelling(leave.from);
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/doctor/leave/${leave.from}`, {
        method: 'DELETE',
        headers: auth
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || 'Could not cancel that leave.');
        return;
      }
      setNote(data.message || 'Leave cancelled.');
      setLeaves(data.leaves || []);
      setStatus(data.status || null);
      if (onSaved) onSaved();
    } catch (err) {
      setError('Network error — the leave is still showing.');
    } finally {
      setCancelling('');
    }
  };

  const awayNow = status && status.onLeave;
  const count = preview ? preview.affected.length : 0;

  return (
    <div className="bg-[var(--card-bg)] border border-[var(--border-color)]/30 rounded-2xl p-5 space-y-4 shadow-[var(--card-shadow)]">
      <div>
        <h4 className="font-bold text-[var(--text-color)] text-[15px] flex items-center gap-1.5">
          <Icon name="event_busy" className="text-[18px] text-[var(--primary-color)]" />
          Leave &amp; days off
        </h4>
        <p className="text-[13px] text-[var(--text-secondary)] mt-0.5">
          Block whole days you will not be in. New bookings skip them automatically, and you go back on the
          board by yourself when the leave ends.
        </p>
      </div>

      {awayNow && (
        <div className="rounded-xl px-3 py-2 text-[12px] font-bold border bg-amber-500/10 border-amber-500/30 text-amber-600">
          You are marked on leave until {pretty(status.onLeave.to)}
          {status.backOn ? ` — back on ${pretty(status.backOn)}.` : '.'} Patients see this on your card and
          cannot book you for these days.
        </div>
      )}

      {leaves.length > 0 && (
        <div className="space-y-2">
          {leaves.map((leave) => (
            <LeaveRow
              key={`${leave.from}-${leave.to}`}
              leave={leave}
              busy={cancelling === leave.from}
              onCancel={() => cancel(leave)}
            />
          ))}
        </div>
      )}

      {/* ---- New leave ---- */}
      <div className="rounded-xl border border-[var(--border-color)]/40 bg-[var(--bg-color)] p-3 space-y-2.5">
        <div className="grid grid-cols-2 gap-2">
          <label className="space-y-1">
            <span className="block text-[10px] font-black uppercase tracking-wider text-[var(--text-secondary)]">
              First day away
            </span>
            <input
              type="date"
              min={todayKey()}
              className={inputCls}
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label className="space-y-1">
            <span className="block text-[10px] font-black uppercase tracking-wider text-[var(--text-secondary)]">
              Last day away
            </span>
            <input
              type="date"
              min={from || todayKey()}
              className={inputCls}
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
        </div>
        <p className="text-[11px] text-[var(--text-secondary)]">
          {from && (to || from)
            ? `You will be away ${span({ from, to: to || from })}, back on the board the next day.`
            : 'Leave the last day blank for a single day off.'}
        </p>

        <input
          className={inputCls}
          placeholder="Reason (optional) — patients see this"
          value={reason}
          maxLength={200}
          onChange={(e) => setReason(e.target.value)}
        />

        {/* The count is on the button, because that is what the press does. */}
        {preview && <AffectedList rows={preview.affected} notified={false} />}

        <button
          type="button"
          onClick={fileLeave}
          disabled={saving || !from}
          className="w-full bg-[var(--primary-color)] text-[var(--primary-text)] rounded-xl py-2.5 text-[13px] font-black disabled:opacity-50 hover:opacity-90 flex items-center justify-center gap-1.5 transition-all"
        >
          <Icon name="event_busy" className="text-[17px]" />
          {saving
            ? 'Filing…'
            : count > 0
              ? `Mark me on leave & tell ${count} patient${count === 1 ? '' : 's'}`
              : 'Mark me on leave'}
        </button>
      </div>

      {/* What actually happened, kept until the next action replaces it. */}
      {filed && filed.length > 0 && <AffectedList rows={filed} notified />}

      {note && (
        <p className="text-[12px] font-bold text-emerald-600 bg-emerald-500/10 border border-emerald-500/25 rounded-xl px-3 py-2">
          {note}
        </p>
      )}
      {error && (
        <p className="text-[12px] font-bold text-rose-500 bg-rose-500/10 border border-rose-500/25 rounded-xl px-3 py-2">
          {error}
        </p>
      )}
    </div>
  );
}

export default DoctorLeavePanel;
