import React, { useEffect, useState } from 'react';
import { BACKEND_URL } from '../App';
import { Icon, Panel, StatStrip, Empty } from './dashboard/DashboardKit';

/**
 * Doctor leave, from the counter.
 *
 * Reception is where an absence is usually recorded, not the doctor's own
 * console — somebody who is actually ill phones the desk rather than logging in
 * to update a roster. A feature that needed the absent person would go unused on
 * precisely the days it exists for.
 *
 * The screen is built around the follow-up rather than the record. Marking a
 * doctor away is two date fields; the rest of the page is the list of patients
 * already holding a token for those days, with their phone numbers, because
 * that list IS the work. The system has already WhatsApped them not to travel —
 * what it cannot do is decide whether Mrs Devi would rather see a different
 * doctor on Tuesday or wait for her own on Friday. That is a phone call, and
 * this is the sheet you make it from.
 */

const todayKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;
};

function pretty(key) {
  if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return '';
  const date = new Date(`${key}T00:00:00`);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

const inputCls =
  'w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-xl px-3 py-2 outline-none text-[13px] font-semibold text-[var(--text-color)] transition-all';

/**
 * One patient to ring.
 *
 * The phone number is the largest interactive thing in the row on purpose — on
 * the tablet at a reception desk this is a tap that starts the call, and every
 * other element here exists to help decide whether to make it.
 */
function CallRow({ row }) {
  return (
    <div className="flex items-center gap-2.5 bg-[var(--bg-color)] rounded-xl px-3 py-2 border border-[var(--border-color)]/35">
      <span className="text-[12px] font-black text-[var(--text-color)] shrink-0 w-14 truncate">
        {row.tokenNumber}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12.5px] font-bold text-[var(--text-color)] truncate">
          {row.patientName || 'Unnamed patient'}
        </span>
        <span className="block text-[11px] font-semibold text-[var(--text-secondary)]">
          Booked for {pretty(row.appointmentDate)} · {row.status}
        </span>
      </span>
      {row.patientPhone ? (
        <a
          href={`tel:${row.patientPhone}`}
          className="px-3 py-1.5 rounded-lg bg-[var(--primary-color)]/12 text-[var(--primary-color)] text-[12px] font-black shrink-0 flex items-center gap-1 hover:bg-[var(--primary-color)]/20 transition-all"
        >
          <Icon name="call" className="text-[15px]" />
          {row.patientPhone}
        </a>
      ) : (
        <span className="text-[11px] font-bold text-[var(--text-secondary)] shrink-0">No phone</span>
      )}
    </div>
  );
}

/** One leave, and everyone it disrupts. */
function LeaveCard({ row, onCancel, busy }) {
  const [open, setOpen] = useState(row.affected.length > 0);

  return (
    <div className="rounded-2xl border border-[var(--border-color)]/40 bg-[var(--card-bg)] overflow-hidden">
      <div className="px-4 py-3 flex items-center gap-3 border-b border-[var(--border-color)]/25">
        <span
          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            row.affected.length > 0
              ? 'bg-amber-500/12 text-amber-600'
              : 'bg-[var(--primary-color)]/10 text-[var(--primary-color)]'
          }`}
        >
          <Icon name="event_busy" className="text-[20px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-black text-[var(--text-color)] truncate">
            {row.doctorName}
          </span>
          <span className="block text-[12px] font-semibold text-[var(--text-secondary)] truncate">
            {row.span} · {row.department || 'General'}
            {row.reason ? ` · ${row.reason}` : ''}
          </span>
        </span>
        <button
          type="button"
          onClick={() => onCancel(row)}
          disabled={busy}
          title="Cancel this leave — the doctor goes back on the board"
          className="px-2.5 py-1.5 rounded-lg text-[11.5px] font-black text-rose-500 hover:bg-rose-500/10 disabled:opacity-50 shrink-0 transition-all"
        >
          {busy ? '…' : 'Cancel leave'}
        </button>
      </div>

      {row.affected.length === 0 ? (
        <p className="px-4 py-3 text-[12px] font-semibold text-[var(--text-secondary)]">
          Nobody is booked on these days — nothing to move.
        </p>
      ) : (
        <div className="p-3 space-y-2">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="w-full flex items-center gap-1.5 text-[12px] font-black text-amber-600"
          >
            <Icon name={open ? 'expand_less' : 'expand_more'} className="text-[17px]" />
            {row.affected.length} patient{row.affected.length === 1 ? '' : 's'} to move — already told not to
            travel
          </button>
          {open && (
            <div className="space-y-1.5">
              {row.affected.map((p) => (
                <CallRow key={p.tokenId} row={p} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function FacilityLeaveBoard({ staffToken, doctors = [], onChanged }) {
  const [data, setData] = useState({ leaves: [], pendingPatients: 0, awayToday: [] });
  const [loading, setLoading] = useState(true);

  const [doctorId, setDoctorId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyLeave, setBusyLeave] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const auth = { Authorization: `Bearer ${staffToken}` };

  const load = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/staff/leaves`, { headers: auth });
      const json = await res.json();
      if (res.ok) setData(json);
    } catch (_) {
      /* leave the last good view on screen rather than blanking the desk */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffToken]);

  const file = async () => {
    setError('');
    setNote('');
    if (!doctorId) {
      setError('Pick the doctor who will be away.');
      return;
    }
    if (!from) {
      setError('Pick the first day they are away.');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/staff/doctors/${doctorId}/leave`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...auth },
        body: JSON.stringify({ from, to: to || from, reason })
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.message || 'Could not mark that leave.');
        return;
      }
      setNote(json.message);
      setFrom('');
      setTo('');
      setReason('');
      await load();
      if (onChanged) onChanged();
    } catch (err) {
      setError('Network error — the leave was not marked.');
    } finally {
      setSaving(false);
    }
  };

  const cancel = async (row) => {
    setError('');
    setNote('');
    setBusyLeave(`${row.doctorId}:${row.from}`);
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/staff/doctors/${row.doctorId}/leave/${row.from}`, {
        method: 'DELETE',
        headers: auth
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.message || 'Could not cancel that leave.');
        return;
      }
      setNote(json.message);
      await load();
      if (onChanged) onChanged();
    } catch (err) {
      setError('Network error — the leave is still in place.');
    } finally {
      setBusyLeave('');
    }
  };

  const stats = [
    {
      icon: 'person_off',
      value: data.awayToday.length,
      label: 'Away today',
      sub: data.awayToday.map((d) => d.name).join(', ') || 'Everyone is in',
      tone: data.awayToday.length > 0 ? 'warn' : 'good'
    },
    {
      icon: 'event_busy',
      value: data.leaves.length,
      label: 'Leaves on the books',
      sub: 'Upcoming and current',
      tone: 'neutral'
    },
    {
      icon: 'phone_in_talk',
      value: data.pendingPatients,
      label: 'Patients to move',
      sub: data.pendingPatients > 0 ? 'Told already — need a new slot' : 'Nothing outstanding',
      tone: data.pendingPatients > 0 ? 'warn' : 'good'
    }
  ];

  return (
    <div className="space-y-4">
      <StatStrip stats={stats} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <Panel title="Mark a doctor away" icon="event_busy" className="lg:col-span-1">
          <div className="space-y-2.5">
            <label className="space-y-1 block">
              <span className="block text-[10px] font-black uppercase tracking-wider text-[var(--text-secondary)]">
                Doctor
              </span>
              <select className={inputCls} value={doctorId} onChange={(e) => setDoctorId(e.target.value)}>
                <option value="">Choose a doctor…</option>
                {doctors.map((d) => (
                  <option key={d._id} value={d._id}>
                    {d.name} — {d.department}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="space-y-1">
                <span className="block text-[10px] font-black uppercase tracking-wider text-[var(--text-secondary)]">
                  From
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
                  To
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

            <input
              className={inputCls}
              placeholder="Reason (optional) — patients see this"
              maxLength={200}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />

            <button
              type="button"
              onClick={file}
              disabled={saving || !doctorId || !from}
              className="w-full bg-[var(--primary-color)] text-[var(--primary-text)] rounded-xl py-2.5 text-[13px] font-black disabled:opacity-50 hover:opacity-90 flex items-center justify-center gap-1.5 transition-all"
            >
              <Icon name="event_busy" className="text-[17px]" />
              {saving ? 'Marking…' : 'Mark on leave'}
            </button>

            <p className="text-[11px] text-[var(--text-secondary)]">
              Anyone already booked on those days is WhatsApped straight away not to travel, and appears in
              the list beside this to be rung and moved.
            </p>

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
        </Panel>

        <div className="lg:col-span-2 space-y-3">
          {loading ? (
            <Panel title="Leave on the books" icon="calendar_month">
              <p className="text-[13px] font-semibold text-[var(--text-secondary)]">Loading…</p>
            </Panel>
          ) : data.leaves.length === 0 ? (
            <Panel title="Leave on the books" icon="calendar_month">
              <Empty
                icon="event_available"
                title="Nobody is on leave"
                hint="Every doctor is on the board. Mark a leave when one phones in."
              />
            </Panel>
          ) : (
            data.leaves.map((row) => (
              <LeaveCard
                key={`${row.doctorId}-${row.from}`}
                row={row}
                busy={busyLeave === `${row.doctorId}:${row.from}`}
                onCancel={cancel}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default FacilityLeaveBoard;
