import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BACKEND_URL, socket } from '../App';
import DashboardShell from './dashboard/DashboardShell';
import { Icon, StatStrip, Panel, Empty } from './dashboard/DashboardKit';
import LiveActivityFeed from './LiveActivityFeed';
import WhatsAppUsagePanel from './WhatsAppUsagePanel';
import useFacilitySocket from '../hooks/useFacilitySocket';

/**
 * The owner's room: the whole facility on one screen.
 *
 * Reception, the cabins, the lab and the pharmacy each show their own slice —
 * which is right for the person standing at that desk and useless to whoever
 * runs the place. The owner could see the queue was long, or that the pharmacy
 * was short of stock, but never both at once, and never that the second was
 * causing the first.
 *
 * This dashboard adds no new data and no new permissions. It reads the two
 * endpoints every facility token can already reach — `/ops/overview` for the
 * live picture and `/ops/activity` for the feed — and puts them side by side.
 * That is deliberate: an "owner" scope would have been a new privilege level to
 * enforce in ~70 route guards, when the thing actually missing was a screen.
 *
 * Numbers are today's. A facility opens at eight and the owner wants to know
 * what has happened since — not a rolling 24 hours that mixes last night in.
 */

/** Silent background refresh, so a screen left open on a wall stays true. */
const REFRESH_MS = 20000;

/** Fixed order for the journey breakdown — a chart that reorders is unreadable. */
const STAGES = ['Waiting', 'In Cabin', 'Lab', 'Pharmacy', 'Billing', 'Completed'];

/**
 * A labelled proportion bar.
 *
 * Percentages are of the day's total, so the bars across a section always add
 * up to something the owner can sanity-check against the token count.
 */
function Bar({ label, value, total, tone = 'var(--primary-color)' }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="text-[12.5px] font-bold text-[var(--text-secondary)] w-28 shrink-0 truncate">
        {label}
      </span>
      <span className="h-2 flex-1 rounded-full bg-[var(--border-color)]/35 overflow-hidden min-w-0">
        <span
          className="block h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: tone }}
        />
      </span>
      <span className="text-[12.5px] font-black text-[var(--text-color)] w-14 shrink-0 text-right tabular-nums">
        {value}
        <span className="text-[var(--text-secondary)] font-bold"> · {pct}%</span>
      </span>
    </div>
  );
}

/** One department's backlog, with the counts that mean "go and look". */
function DeskCard({ icon, title, headline, headlineLabel, rows, tone }) {
  return (
    <div className="bg-[var(--card-bg)] border border-[var(--border-color)]/40 rounded-2xl p-5">
      <div className="flex items-center gap-3">
        <span
          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: `${tone}1f`, color: tone }}
        >
          <Icon name={icon} className="text-[23px]" />
        </span>
        {/* No `truncate` here. Three of these cards sit side by side, and at a
            laptop width the desk names are exactly long enough to clip —
            "Recepti…" next to a number is not a dashboard. Wrapping costs a
            line; a truncated department name costs the reader the word. */}
        <div className="min-w-0">
          <h3 className="text-[15px] font-black text-[var(--text-color)] leading-tight">{title}</h3>
          <p className="text-[12px] font-semibold text-[var(--text-secondary)] leading-tight mt-0.5">
            {headlineLabel}
          </p>
        </div>
        <span className="ml-auto text-[28px] font-black leading-none tabular-nums" style={{ color: tone }}>
          {headline}
        </span>
      </div>

      <dl className="mt-4 pt-3.5 border-t border-[var(--border-color)]/30 grid grid-cols-3 gap-3">
        {rows.map((r) => (
          <div key={r.label} className="min-w-0">
            <dd
              className={`text-[19px] font-black leading-none tabular-nums ${
                r.value > 0 && r.alert ? 'text-rose-500' : 'text-[var(--text-color)]'
              }`}
            >
              {r.value}
            </dd>
            <dt className="text-[11.5px] font-bold text-[var(--text-secondary)] mt-1 leading-tight">
              {r.label}
            </dt>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function OwnerDashboard({ token, facility, onLogout }) {
  const [tab, setTab] = useState('today');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  // Without this the socket never joins `hospital:<id>`, so no live event ever
  // arrives and the dashboard silently degrades to the 20-second poll — the
  // worst kind of broken, because it still looks live. `owner` is not a server
  // role; registering under it joins the facility room (where activity is
  // broadcast) without also subscribing to reception's role-targeted traffic.
  useFacilitySocket('owner', facility?.hospital);

  // Guards a slow response landing after the component unmounted, and — the
  // reason this is a counter rather than a boolean — a burst of six walk-ins
  // firing six overlapping refreshes, where the FIRST reply can land last and
  // paint a picture two patients out of date. Only the newest request may write.
  const alive = useRef(true);
  const latest = useRef(0);

  const load = useCallback(async () => {
    const seq = ++latest.current;
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/ops/overview`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Could not load the overview.');
      const json = await res.json();
      if (!alive.current || seq !== latest.current) return;
      setData(json);
      setError('');
    } catch (err) {
      // A failed refresh keeps the last good picture on screen rather than
      // blanking a dashboard someone may be reading across the room — the
      // banner says the numbers are stale, which is the honest answer.
      if (alive.current && seq === latest.current) {
        setError(
          err.name === 'TypeError' ? 'Cannot reach the server — these numbers may be stale.' : err.message
        );
      }
    } finally {
      if (alive.current && seq === latest.current) setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    alive.current = true;
    load();
    const timer = setInterval(load, REFRESH_MS);
    // Anything that changes the building writes to the activity feed, so the
    // feed is also the cheapest "something happened, re-read the numbers" signal
    // we have. The poll is the backstop for a dropped socket.
    const onActivity = () => load();
    socket.on('activity', onActivity);
    return () => {
      alive.current = false;
      clearInterval(timer);
      socket.off('activity', onActivity);
    };
  }, [load]);

  const totals = (data && data.totals) || {};
  const departments = (data && data.departments) || {};
  const lab = departments.lab || {};
  const pharmacy = departments.pharmacy || {};
  const refills = departments.refills || {};
  const doctorLoad = (data && data.doctorLoad) || [];
  const byStage = (data && data.byStage) || {};
  const tokensToday = totals.tokensToday || 0;

  const busiest = doctorLoad[0];

  const stats = [
    { icon: 'confirmation_number', value: tokensToday, label: 'Tokens today', tone: 'primary' },
    { icon: 'hourglass_top', value: totals.waiting || 0, label: 'Waiting now', tone: 'warn' },
    { icon: 'stethoscope', value: totals.inCabin || 0, label: 'In cabin', tone: 'info' },
    { icon: 'task_alt', value: totals.completed || 0, label: 'Completed', tone: 'good' },
    {
      icon: 'emergency',
      value: totals.emergency || 0,
      label: 'Emergency',
      tone: totals.emergency ? 'bad' : 'neutral'
    },
    {
      icon: 'timer',
      value: `${data ? data.longestWaitMins || 0 : 0}m`,
      label: 'Longest wait',
      sub: data && data.longestWaitToken ? `Token ${data.longestWaitToken}` : 'Nobody waiting',
      tone: (data && data.longestWaitMins) > 45 ? 'bad' : 'neutral'
    }
  ];

  /* ── Today ─────────────────────────────────────────────────────────── */
  const todayTab = (
    <div className="space-y-5">
      <StatStrip stats={stats} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Panel title="Where everyone is right now" icon="pin_drop">
          {tokensToday === 0 ? (
            <Empty
              icon="event_available"
              title="No tokens yet today"
              hint="Bookings appear here the moment the first patient is registered — from reception, WhatsApp or the web."
            />
          ) : (
            <div className="space-y-3">
              {STAGES.filter((s) => byStage[s]).map((stage) => (
                <Bar key={stage} label={stage} value={byStage[stage]} total={tokensToday} />
              ))}
              {/* Any stage the backend invents that this list has not caught up
                  with still gets drawn — a silently dropped row would make the
                  bars stop adding up to the token count. */}
              {Object.keys(byStage)
                .filter((s) => !STAGES.includes(s))
                .map((stage) => (
                  <Bar key={stage} label={stage} value={byStage[stage]} total={tokensToday} />
                ))}
            </div>
          )}
        </Panel>

        <Panel title="The day so far" icon="analytics">
          <div className="space-y-3">
            <Bar label="Completed" value={totals.completed || 0} total={tokensToday} tone="#10b981" />
            <Bar label="Still waiting" value={totals.waiting || 0} total={tokensToday} tone="#f59e0b" />
            <Bar label="No-shows" value={totals.absent || 0} total={tokensToday} tone="#f43f5e" />
            <Bar label="Priority cases" value={totals.priority || 0} total={tokensToday} tone="#0ea5e9" />
          </div>

          <div className="mt-5 pt-4 border-t border-[var(--border-color)]/30 grid grid-cols-2 gap-4">
            <div>
              <p className="text-[26px] font-black leading-none text-[var(--text-color)] tabular-nums">
                {data ? data.doctorsOnDuty || 0 : 0}
                <span className="text-[15px] text-[var(--text-secondary)]">/{doctorLoad.length}</span>
              </p>
              <p className="text-[12.5px] font-bold text-[var(--text-secondary)] mt-1">Doctors available</p>
            </div>
            <div className="min-w-0">
              <p className="text-[15px] font-black leading-tight text-[var(--text-color)] truncate">
                {busiest && busiest.waiting ? busiest.name : '—'}
              </p>
              <p className="text-[12.5px] font-bold text-[var(--text-secondary)] mt-1">
                {busiest && busiest.waiting ? `Busiest — ${busiest.waiting} waiting` : 'No queue anywhere'}
              </p>
            </div>
          </div>
        </Panel>
      </div>

      <LiveActivityFeed token={token} limit={15} title="Live activity" compact />
    </div>
  );

  /* ── Desks ─────────────────────────────────────────────────────────── */
  const desksTab = (
    <div className="space-y-5">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <DeskCard
          icon="support_agent"
          title="Reception"
          headline={totals.waiting || 0}
          headlineLabel="Waiting to be seen"
          tone="var(--primary-color)"
          rows={[
            { label: 'In cabin', value: totals.inCabin || 0 },
            { label: 'No-shows', value: totals.absent || 0, alert: true },
            { label: 'Priority', value: totals.priority || 0 }
          ]}
        />
        <DeskCard
          icon="science"
          title="Lab"
          headline={lab.pending || 0}
          headlineLabel="Samples outstanding"
          tone="#0ea5e9"
          rows={[
            { label: 'Urgent', value: lab.urgent || 0, alert: true },
            { label: 'Abnormal', value: lab.abnormal || 0, alert: true },
            { label: 'Done', value: Math.max((tokensToday || 0) - (lab.pending || 0), 0) }
          ]}
        />
        <DeskCard
          icon="local_pharmacy"
          title="Pharmacy"
          headline={pharmacy.pending || 0}
          headlineLabel="Prescriptions to dispense"
          tone="#8b5cf6"
          rows={[
            { label: 'Out of stock', value: pharmacy.outOfStock || 0, alert: true },
            { label: 'Low stock', value: pharmacy.lowStock || 0, alert: true },
            { label: 'Refills', value: refills.pending || 0 }
          ]}
        />
      </div>

      <Panel title="Doctors" icon="stethoscope" count={doctorLoad.length}>
        {doctorLoad.length === 0 ? (
          <Empty
            icon="person_off"
            title="No doctors on the roster"
            hint="Add doctors from the owner console and they appear here with their live queue."
          />
        ) : (
          <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full min-w-[560px] text-left border-collapse">
              <thead>
                <tr className="border-b border-[var(--border-color)]/40">
                  {['Doctor', 'Department', 'Status', 'Waiting', 'Est. wait', 'Seen today'].map((h) => (
                    <th
                      key={h}
                      className="py-2.5 pr-4 text-[11px] uppercase font-black tracking-wider text-[var(--text-secondary)] whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {doctorLoad.map((d) => (
                  <tr key={d._id} className="border-b border-[var(--border-color)]/20 last:border-0">
                    <td className="py-3 pr-4 text-[13.5px] font-black text-[var(--text-color)] whitespace-nowrap">
                      {d.name}
                      {d.room && (
                        <span className="block text-[11.5px] font-semibold text-[var(--text-secondary)]">
                          {d.room}
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-[13px] font-semibold text-[var(--text-secondary)] whitespace-nowrap">
                      {d.department || '—'}
                    </td>
                    <td className="py-3 pr-4 whitespace-nowrap">
                      <span
                        className={`text-[11.5px] font-black px-2 py-0.5 rounded-full ${
                          d.availabilityStatus === 'Available'
                            ? 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400'
                            : 'bg-amber-500/12 text-amber-600 dark:text-amber-400'
                        }`}
                      >
                        {d.inCabin ? 'With patient' : d.availabilityStatus || 'Unknown'}
                      </span>
                    </td>
                    <td
                      className={`py-3 pr-4 text-[14px] font-black tabular-nums ${
                        d.waiting > 8 ? 'text-rose-500' : 'text-[var(--text-color)]'
                      }`}
                    >
                      {d.waiting}
                    </td>
                    <td className="py-3 pr-4 text-[13px] font-bold text-[var(--text-secondary)] tabular-nums whitespace-nowrap">
                      {d.estimatedWait}m
                    </td>
                    <td className="py-3 pr-4 text-[13px] font-bold text-[var(--text-color)] tabular-nums">
                      {d.seenToday}
                      {d.dailyTokenLimit ? (
                        <span className="text-[var(--text-secondary)] font-semibold">
                          {' '}
                          / {d.dailyTokenLimit}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );

  /* ── Activity ──────────────────────────────────────────────────────── */
  const activityTab = <LiveActivityFeed token={token} limit={80} title="Everything happening here" />;

  return (
    <DashboardShell
      role="owner"
      user={facility}
      activeKey={tab}
      onNavigate={setTab}
      onLogout={onLogout}
      subtitle="Owner view"
      headerRight={
        <button
          type="button"
          onClick={load}
          className="p-2 rounded-lg text-[var(--text-secondary)] hover:text-[var(--primary-color)] hover:bg-[var(--primary-color)]/10 transition-colors"
          title="Refresh now"
        >
          <Icon name="refresh" className={`text-[20px] ${loading ? 'animate-spin' : ''}`} />
        </button>
      }
    >
      {error && (
        <div className="bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 rounded-xl px-4 py-3 text-[13px] font-bold flex items-center gap-2">
          <Icon name="warning" className="text-[18px] shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading && !data ? (
        <div className="flex-1 flex flex-col items-center justify-center py-20 gap-3">
          <Icon name="refresh" className="text-[40px] text-[var(--primary-color)] animate-spin" />
          <p className="text-[13px] font-bold text-[var(--text-secondary)]">Reading the whole facility…</p>
        </div>
      ) : (
        <>
          {tab === 'today' && todayTab}
          {tab === 'desks' && desksTab}
          {tab === 'activity' && activityTab}
          {/* The bill the owner actually pays, on the screen they already open. */}
          {tab === 'usage' && <WhatsAppUsagePanel token={token} />}
        </>
      )}
    </DashboardShell>
  );
}

export default OwnerDashboard;
