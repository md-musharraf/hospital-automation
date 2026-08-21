import React, { useEffect, useState } from 'react';
import { BACKEND_URL } from '../App';

/**
 * Every tenant's WhatsApp usage for a month — the screen invoicing is done from.
 *
 * Meta bills the platform ONE figure for ONE shared number. This is which
 * facilities that figure is made of, which is the question there was no way to
 * answer before metering existed, and therefore the reason no overage could ever
 * be charged.
 *
 * Two things on this page are easy to leave out and both are the point:
 *
 *  - **Facilities with no tier are counted and flagged.** Their traffic is real
 *    and we pay for it; what is missing is a price. They are shown with a "set a
 *    tier" control rather than quietly defaulted to the cheapest plan — inventing
 *    an allowance a customer never agreed to is how a billing screen becomes a
 *    dispute.
 *  - **Unattributed messages get their own section.** Those are sends whose
 *    caller passed no facility: we paid Meta and billed nobody. A row with a
 *    number in it is a bug report. Hiding it makes every total quietly too low
 *    with nothing anywhere to notice.
 *
 * This panel computes no money of its own. The server returns the overage and
 * the amount already worked out, for the same reason `LicensePanel` does not
 * decide who is expired: a screen that did its own arithmetic would eventually
 * disagree with the invoice, and the owner would be reading a number nobody
 * charged.
 */

function monthLabel(period) {
  if (!period || !/^\d{4}-\d{2}$/.test(period)) return period || '';
  const [year, month] = period.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

function shiftPeriod(period, delta) {
  const [year, month] = String(period).split('-').map(Number);
  const date = new Date(year, month - 1 + delta, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function thisPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

const num = (value) => Number(value || 0).toLocaleString('en-IN');

/** One headline figure across the top. */
function Total({ value, label, tone = 'var(--text-color)', sub }) {
  return (
    <div className="flex-1 min-w-[140px] bg-[var(--card-bg)] border border-[var(--border-color)]/40 rounded-2xl px-4 py-3">
      <span className="block text-[24px] font-black leading-none tabular-nums" style={{ color: tone }}>
        {value}
      </span>
      <span className="block text-[12.5px] font-bold text-[var(--text-color)] mt-1">{label}</span>
      {sub && <span className="block text-[11.5px] font-semibold text-[var(--text-secondary)]">{sub}</span>}
    </div>
  );
}

export function PlatformUsagePanel({ adminSecret }) {
  const [period, setPeriod] = useState(thisPeriod());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const load = async (target = period) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/auth/super-admin/usage?period=${target}`, {
        headers: { 'X-Admin-Secret': adminSecret }
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.message || 'Could not load usage.');
        return;
      }
      setData(json);
    } catch (_) {
      setError('Network error — usage could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(period);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, adminSecret]);

  const setTier = async (facilityId, tier) => {
    setBusy(facilityId);
    setNote('');
    setError('');
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/auth/super-admin/hospital/${facilityId}/tier`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Admin-Secret': adminSecret },
        body: JSON.stringify({ tier })
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.message || 'Could not set that tier.');
        return;
      }
      setNote(json.message);
      await load(period);
    } catch (_) {
      setError('Network error — the tier was not changed.');
    } finally {
      setBusy('');
    }
  };

  const tiers = (data && data.tiers) || {};
  const tierKeys = Object.keys(tiers);
  const totals = (data && data.totals) || {};
  const isCurrent = period === thisPeriod();

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-lg font-black text-[var(--text-color)]">WhatsApp usage</h3>
          <p className="text-[13px] font-semibold text-[var(--text-secondary)] mt-1 max-w-2xl">
            Meta bills us one figure for one shared number. This is whose traffic that figure is. Failed sends
            and licence reminders are counted but never charged — nothing a patient did not receive, and
            nothing we sent asking a facility to renew.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setPeriod(shiftPeriod(period, -1))}
            className="w-9 h-9 rounded-xl border border-[var(--border-color)]/50 text-[var(--text-secondary)] hover:border-[var(--primary-color)] flex items-center justify-center"
            title="Previous month"
          >
            <span className="material-symbols-outlined text-[20px]">chevron_left</span>
          </button>
          <span className="text-[13px] font-black text-[var(--text-color)] min-w-[7.5rem] text-center">
            {monthLabel(period)}
          </span>
          <button
            type="button"
            onClick={() => setPeriod(shiftPeriod(period, 1))}
            disabled={isCurrent}
            className="w-9 h-9 rounded-xl border border-[var(--border-color)]/50 text-[var(--text-secondary)] hover:border-[var(--primary-color)] disabled:opacity-35 flex items-center justify-center"
            title="Next month"
          >
            <span className="material-symbols-outlined text-[20px]">chevron_right</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="px-3.5 py-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-500 text-[13px] font-bold">
          {error}
        </div>
      )}
      {note && (
        <div className="px-3.5 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-600 text-[13px] font-bold">
          {note}
        </div>
      )}

      {loading && !data ? (
        <p className="text-[13px] font-semibold text-[var(--text-secondary)]">Loading…</p>
      ) : !data ? null : (
        <>
          <div className="flex flex-wrap gap-3">
            <Total value={num(totals.sent)} label="Sent" sub="Accepted by Meta" />
            <Total value={num(totals.billable)} label="Billable" sub="What invoices are built from" />
            <Total
              value={num(totals.failed)}
              label="Not delivered"
              tone={totals.failed > 0 ? '#e11d48' : 'var(--text-color)'}
              sub={totals.failed > 0 ? 'Check the token' : 'All got through'}
            />
            <Total
              value={totals.amountLabel || '₹0'}
              label="Overage to bill"
              tone={totals.overage > 0 ? '#d97706' : '#059669'}
              sub={`${num(totals.overage)} messages past quota`}
            />
          </div>

          {(data.overQuota > 0 || data.untiered > 0) && (
            <div className="flex flex-wrap gap-2">
              {data.overQuota > 0 && (
                <span className="px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 text-[12px] font-black">
                  {data.overQuota} facilit{data.overQuota === 1 ? 'y is' : 'ies are'} over quota
                </span>
              )}
              {data.untiered > 0 && (
                <span className="px-3 py-1.5 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-600 text-[12px] font-black">
                  {data.untiered} facilit{data.untiered === 1 ? 'y has' : 'ies have'} no tier priced
                </span>
              )}
            </div>
          )}

          <div className="space-y-3">
            {(data.facilities || []).map((f) => (
              <div
                key={f.id}
                className="p-4 rounded-2xl bg-[var(--card-bg)] border border-[var(--border-color)]/30 space-y-3"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-black text-[var(--text-color)]">{f.name}</span>
                      {f.overQuota && (
                        <span className="px-2 py-0.5 rounded-full border text-[10px] font-black tracking-wider bg-amber-500/10 border-amber-500/30 text-amber-600">
                          OVER QUOTA
                        </span>
                      )}
                      {!f.tier && (
                        <span className="px-2 py-0.5 rounded-full border text-[10px] font-black tracking-wider bg-sky-500/10 border-sky-500/30 text-sky-600">
                          NO TIER
                        </span>
                      )}
                    </div>
                    <p className="text-[12px] font-semibold text-[var(--text-secondary)] mt-0.5">
                      {f.city} · {f.type} · {f.tierLabel}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="block text-[18px] font-black text-[var(--text-color)] tabular-nums">
                      {num(f.sent)}
                    </span>
                    <span className="block text-[11px] font-bold text-[var(--text-secondary)]">
                      sent · {num(f.billable)} billable
                      {f.failed > 0 ? ` · ${num(f.failed)} failed` : ''}
                    </span>
                  </div>
                </div>

                {f.included ? (
                  <div className="space-y-1">
                    <span className="block h-2 rounded-full bg-[var(--border-color)]/35 overflow-hidden">
                      <span
                        className="block h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(100, f.percentUsed || 0)}%`,
                          background:
                            f.percentUsed > 100 ? '#f43f5e' : f.percentUsed >= 80 ? '#f59e0b' : '#10b981'
                        }}
                      />
                    </span>
                    <p className="text-[11.5px] font-semibold text-[var(--text-secondary)]">
                      {num(f.billable)} of {num(f.included)} included ({f.percentUsed}%)
                      {f.overQuota ? ` · ${num(f.overage)} extra = ${f.amountLabel}` : ''}
                    </p>
                  </div>
                ) : (
                  <p className="text-[11.5px] font-semibold text-sky-600">
                    Counted but not priced — nothing is being charged for this facility.
                  </p>
                )}

                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] font-black uppercase tracking-wider text-[var(--text-secondary)]">
                    Tier:
                  </span>
                  {tierKeys.map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setTier(f.id, key)}
                      disabled={busy === f.id || f.tier === key}
                      className={`px-3 py-1.5 rounded-lg text-[12px] font-black border transition-all disabled:opacity-60 ${
                        f.tier === key
                          ? 'bg-[var(--primary-color)] border-[var(--primary-color)] text-[var(--primary-text)]'
                          : 'bg-[var(--bg-color)] border-[var(--border-color)]/40 text-[var(--text-color)] hover:border-[var(--primary-color)] hover:text-[var(--primary-color)]'
                      }`}
                      title={`${num(tiers[key].included)} messages included`}
                    >
                      {tiers[key].label}
                    </button>
                  ))}
                  {f.tier && (
                    <button
                      type="button"
                      onClick={() => setTier(f.id, '')}
                      disabled={busy === f.id}
                      className="px-2.5 py-1.5 rounded-lg text-[11.5px] font-black text-rose-500 hover:bg-rose-500/10 disabled:opacity-50"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            ))}

            {(data.facilities || []).length === 0 && (
              <p className="text-[13px] font-semibold text-[var(--text-secondary)] italic">
                No facilities registered yet.
              </p>
            )}
          </div>

          {/* Paid for, billed to nobody. Shown so it can be fixed. */}
          {(data.unbilled || []).length > 0 && (
            <div className="p-4 rounded-2xl bg-rose-500/[0.06] border border-rose-500/25 space-y-2">
              <h4 className="text-[13px] font-black text-rose-500">Billed to nobody</h4>
              <p className="text-[12px] font-semibold text-[var(--text-secondary)]">
                Messages whose sender did not name a facility, or whose facility no longer exists. We paid
                Meta for these and charged no one — each row is a call site to fix.
              </p>
              {data.unbilled.map((row) => (
                <div
                  key={row.id}
                  className="flex items-center justify-between gap-3 bg-[var(--card-bg)] rounded-xl px-3 py-2"
                >
                  <span className="text-[12.5px] font-bold text-[var(--text-color)] truncate min-w-0">
                    {row.name}
                  </span>
                  <span className="text-[12.5px] font-black text-rose-500 tabular-nums shrink-0">
                    {num(row.sent)} sent{row.failed > 0 ? ` · ${num(row.failed)} failed` : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default PlatformUsagePanel;
