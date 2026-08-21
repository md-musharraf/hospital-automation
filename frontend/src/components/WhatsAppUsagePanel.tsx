import React, { useEffect, useState } from 'react';
import { BACKEND_URL } from '../App';
import { Icon, Panel, StatStrip, Empty } from './dashboard/DashboardKit';

/**
 * This facility's own WhatsApp usage, and what it costs.
 *
 * A meter the customer cannot read is not a meter — it is a surprise at the end
 * of the month. Every number here is the one the platform bills from, shown to
 * the person who pays it, so a disputed invoice is settled by two people looking
 * at the same screen rather than by arguing about our word for it.
 *
 * Three deliberate choices about what is shown:
 *
 *  - **Failed sends get their own tile, not a footnote.** A column of failures
 *    climbing is not a billing fact, it is an outage: patients are not being
 *    told their turn is near. The bill is unaffected (nothing failed is ever
 *    charged) which is exactly why it would otherwise go unnoticed.
 *  - **Last month sits beside this one.** A number alone cannot tell a hospital
 *    whether it is about to go over; only the direction can.
 *  - **The breakdown is by KIND.** "You sent 4,000 messages" is not actionable.
 *    "1,900 of them were turn-is-near pings" is — that is the feature earning
 *    its keep, and the owner can see it.
 */

/** Message kinds worth a bar, longest first, with the rest folded into "Other". */
const TOP_KINDS = 8;

function monthLabel(period) {
  if (!period || !/^\d{4}-\d{2}$/.test(period)) return period || '';
  const [year, month] = period.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

/** The previous "YYYY-MM", for the back arrow. */
function shiftPeriod(period, delta) {
  const [year, month] = String(period).split('-').map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** Current month in the browser's timezone — the facility's own clock. */
function thisPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * How much of the included volume is gone.
 *
 * Turns amber at 80% and red past 100. The amber is the point: a bar that only
 * changes colour once the overage has already been incurred is a receipt, not a
 * warning.
 */
function QuotaBar({ used, included, percent }) {
  if (!included) return null;
  const pct = Math.min(100, percent || 0);
  const tone = percent > 100 ? '#f43f5e' : percent >= 80 ? '#f59e0b' : 'var(--primary-color)';

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12.5px] font-bold text-[var(--text-secondary)]">
          {used.toLocaleString('en-IN')} of {included.toLocaleString('en-IN')} included
        </span>
        <span className="text-[13px] font-black tabular-nums" style={{ color: tone }}>
          {percent}%
        </span>
      </div>
      <span className="block h-2.5 rounded-full bg-[var(--border-color)]/35 overflow-hidden">
        <span
          className="block h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: tone }}
        />
      </span>
    </div>
  );
}

/** The per-kind breakdown, as proportions of the month. */
function KindBars({ byKind, kinds }) {
  const rows = Object.entries(byKind || {})
    .map(([key, count]) => ({
      key,
      count: Number(count) || 0,
      label: (kinds && kinds[key] && kinds[key].label) || key
    }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count);

  if (rows.length === 0) {
    return <Empty icon="chat" title="Nothing sent yet" hint="Messages appear here as they go out." />;
  }

  const shown = rows.slice(0, TOP_KINDS);
  const rest = rows.slice(TOP_KINDS).reduce((sum, row) => sum + row.count, 0);
  if (rest > 0) shown.push({ key: '__rest', count: rest, label: 'Everything else' });

  const top = shown[0].count || 1;

  return (
    <div className="space-y-2.5">
      {shown.map((row) => (
        <div key={row.key} className="flex items-center gap-3">
          <span className="text-[12.5px] font-bold text-[var(--text-secondary)] w-36 shrink-0 truncate">
            {row.label}
          </span>
          <span className="h-2 flex-1 rounded-full bg-[var(--border-color)]/35 overflow-hidden min-w-0">
            <span
              className="block h-full rounded-full bg-[var(--primary-color)] transition-all duration-500"
              style={{ width: `${Math.round((row.count / top) * 100)}%` }}
            />
          </span>
          <span className="text-[12.5px] font-black text-[var(--text-color)] w-16 shrink-0 text-right tabular-nums">
            {row.count.toLocaleString('en-IN')}
          </span>
        </div>
      ))}
    </div>
  );
}

export function WhatsAppUsagePanel({ token }) {
  const [period, setPeriod] = useState(thisPeriod());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError('');

    (async () => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/v1/ops/usage?period=${period}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const json = await res.json();
        if (!live) return;
        if (!res.ok) {
          setError(json.message || 'Could not load your usage.');
          return;
        }
        setData(json);
      } catch (_) {
        if (live) setError('Network error — usage could not be loaded.');
      } finally {
        if (live) setLoading(false);
      }
    })();

    return () => {
      live = false;
    };
  }, [period, token]);

  if (loading && !data) {
    return (
      <Panel title="WhatsApp usage" icon="chat">
        <p className="text-[13px] font-semibold text-[var(--text-secondary)]">Loading…</p>
      </Panel>
    );
  }

  if (error && !data) {
    return (
      <Panel title="WhatsApp usage" icon="chat">
        <p className="text-[13px] font-bold text-rose-500">{error}</p>
      </Panel>
    );
  }

  const usage = data.usage || {};
  const isCurrent = period === thisPeriod();
  const previousSent = (data.previous && data.previous.billable) || 0;
  const trend = usage.billable - previousSent;

  const stats = [
    {
      icon: 'send',
      value: (usage.sent || 0).toLocaleString('en-IN'),
      label: 'Messages sent',
      sub: isCurrent ? 'So far this month' : monthLabel(period),
      tone: 'primary'
    },
    {
      icon: 'receipt_long',
      value: (usage.billable || 0).toLocaleString('en-IN'),
      label: 'On your bill',
      sub:
        previousSent > 0
          ? `${trend >= 0 ? '+' : ''}${trend.toLocaleString('en-IN')} vs last month`
          : 'Licence notices are never charged',
      tone: 'neutral'
    },
    {
      // Not a billing number — a health one. Nothing failed is ever charged,
      // which is precisely why a rising column here would go unnoticed.
      icon: 'error',
      value: (usage.failed || 0).toLocaleString('en-IN'),
      label: 'Not delivered',
      sub: usage.failed > 0 ? 'Patients were not reached — tell us' : 'Everything got through',
      tone: usage.failed > 0 ? 'bad' : 'good'
    },
    {
      icon: 'account_balance_wallet',
      value: data.tier ? data.amountLabel : '—',
      label: 'Extra this month',
      sub: data.tier ? `${data.tierLabel} plan` : 'No plan tier set yet',
      tone: data.overQuota ? 'warn' : 'good'
    }
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setPeriod(shiftPeriod(period, -1))}
          className="w-9 h-9 rounded-xl border border-[var(--border-color)]/50 text-[var(--text-secondary)] hover:text-[var(--primary-color)] hover:border-[var(--primary-color)]/40 flex items-center justify-center transition-all"
          title="Previous month"
        >
          <Icon name="chevron_left" className="text-[20px]" />
        </button>
        <span className="text-[14px] font-black text-[var(--text-color)]">{monthLabel(period)}</span>
        <button
          type="button"
          onClick={() => setPeriod(shiftPeriod(period, 1))}
          disabled={isCurrent}
          className="w-9 h-9 rounded-xl border border-[var(--border-color)]/50 text-[var(--text-secondary)] hover:text-[var(--primary-color)] hover:border-[var(--primary-color)]/40 disabled:opacity-35 disabled:hover:border-[var(--border-color)]/50 flex items-center justify-center transition-all"
          title="Next month"
        >
          <Icon name="chevron_right" className="text-[20px]" />
        </button>
      </div>

      <StatStrip stats={stats} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <Panel title="Your plan this month" icon="donut_large">
          {data.tier ? (
            <div className="space-y-4">
              <QuotaBar used={usage.billable || 0} included={data.included} percent={data.percentUsed} />
              {data.overQuota ? (
                <p className="text-[12.5px] font-bold text-amber-600 bg-amber-500/10 border border-amber-500/25 rounded-xl px-3 py-2">
                  {data.overage.toLocaleString('en-IN')} messages past your included volume ·{' '}
                  {data.amountLabel} extra on this month&rsquo;s invoice.
                </p>
              ) : (
                <p className="text-[12.5px] font-semibold text-[var(--text-secondary)]">
                  Comfortably inside your {data.tierLabel} allowance — nothing extra to pay.
                </p>
              )}
            </div>
          ) : (
            <Empty
              icon="sell"
              title="No plan tier set"
              hint="Your messages are being counted, but no allowance has been priced yet. Nothing extra is being charged."
            />
          )}
        </Panel>

        <Panel title="What was sent" icon="forum">
          <KindBars byKind={usage.byKind} kinds={data.kinds} />
        </Panel>
      </div>
    </div>
  );
}

export default WhatsAppUsagePanel;
