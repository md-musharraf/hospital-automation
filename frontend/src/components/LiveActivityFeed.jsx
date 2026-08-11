import React, { useState, useEffect, useRef } from 'react';
import { BACKEND_URL, socket } from '../App';

// The facility's shared live feed. Every role writes to it (reception registers a
// walk-in, a doctor calls a token, the lab posts a result, the pharmacy dispenses)
// and every role can watch it — so the building stops depending on people
// shouting across counters to know what just happened.
//
// Drops straight into any portal:  <LiveActivityFeed token={labToken} />

const TYPE_META = {
  'token-created': { icon: 'person_add', label: 'Registered' },
  'token-called': { icon: 'campaign', label: 'Called' },
  'token-completed': { icon: 'task_alt', label: 'Completed' },
  'token-absent': { icon: 'person_off', label: 'No-show' },
  'token-recalled': { icon: 'replay', label: 'Recalled' },
  'lab-requested': { icon: 'science', label: 'Lab ordered' },
  'lab-collected': { icon: 'colorize', label: 'Sample taken' },
  'lab-completed': { icon: 'lab_research', label: 'Report ready' },
  'rx-prescribed': { icon: 'prescriptions', label: 'Prescribed' },
  'rx-dispensed': { icon: 'local_pharmacy', label: 'Dispensed' },
  'refill-requested': { icon: 'autorenew', label: 'Refill' },
  'refill-decided': { icon: 'fact_check', label: 'Refill decided' },
  'stock-low': { icon: 'inventory_2', label: 'Low stock' },
  'stock-out': { icon: 'production_quantity_limits', label: 'Out of stock' },
  'stock-updated': { icon: 'inventory', label: 'Stock' },
  'doctor-status': { icon: 'badge', label: 'Doctor' },
  'buffer-added': { icon: 'more_time', label: 'Delay' },
  system: { icon: 'info', label: 'Update' }
};

const SEVERITY_STYLE = {
  info: 'text-[var(--text-secondary)] border-[var(--border-color)]/40',
  success: 'text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
  warning: 'text-amber-600 dark:text-amber-400 border-amber-500/40',
  critical: 'text-rose-600 dark:text-rose-400 border-rose-500/40'
};

const timeAgo = (iso) => {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
};

export default function LiveActivityFeed({
  token,
  limit = 25,
  title = 'Live Hospital Activity',
  compact = false
}) {
  const [items, setItems] = useState([]);
  const [connected, setConnected] = useState(socket.connected);
  const [filter, setFilter] = useState('all');
  const seen = useRef(new Set());

  // Initial backfill, so a portal opened mid-shift is not blank.
  useEffect(() => {
    if (!token) return;
    fetch(`${BACKEND_URL}/api/v1/ops/activity?limit=${limit}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!Array.isArray(data)) return;
        data.forEach((a) => a._id && seen.current.add(String(a._id)));
        setItems(data);
      })
      .catch((err) => console.error('Error loading activity feed:', err));
  }, [token, limit]);

  // Live tail. The server addresses this to the facility room, so a portal only
  // ever receives its OWN hospital's events.
  useEffect(() => {
    const onActivity = (entry) => {
      const id = entry && entry._id ? String(entry._id) : null;
      if (id && seen.current.has(id)) return;
      if (id) seen.current.add(id);
      setItems((prev) => [entry, ...prev].slice(0, limit));
    };
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    socket.on('activity', onActivity);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    return () => {
      socket.off('activity', onActivity);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [limit]);

  const shown =
    filter === 'alerts' ? items.filter((a) => a.severity === 'warning' || a.severity === 'critical') : items;

  return (
    <div className="bg-[var(--card-bg)] rounded-2xl border border-[var(--border-color)]/45 shadow-[var(--card-shadow)] overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-[var(--border-color)]/30 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-400'}`}
          />
          <h3 className="text-[13px] font-black uppercase tracking-wider text-[var(--text-color)]">
            {title}
          </h3>
        </div>
        <div className="flex gap-1">
          {['all', 'alerts'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-[12px] font-bold px-2 py-1 rounded-lg transition-colors ${
                filter === f
                  ? 'bg-[var(--primary-color)] text-[var(--primary-text)]'
                  : 'text-[var(--text-secondary)] hover:text-[var(--primary-color)]'
              }`}
            >
              {f === 'all'
                ? 'All'
                : `Alerts${items.filter((a) => a.severity === 'warning' || a.severity === 'critical').length ? ` (${items.filter((a) => a.severity === 'warning' || a.severity === 'critical').length})` : ''}`}
            </button>
          ))}
        </div>
      </div>

      <div
        className={`overflow-y-auto no-scrollbar divide-y divide-[var(--border-color)]/20 ${compact ? 'max-h-64' : 'max-h-[420px]'}`}
      >
        {shown.length === 0 && (
          <p className="text-[13px] text-[var(--text-secondary)] p-4 text-center font-medium">
            {filter === 'alerts'
              ? 'No alerts right now — everything is running normally.'
              : 'Waiting for activity…'}
          </p>
        )}
        {shown.map((a, idx) => {
          const meta = TYPE_META[a.type] || TYPE_META.system;
          return (
            <div
              key={a._id || idx}
              className={`px-4 py-2.5 flex items-start gap-2.5 border-l-2 ${SEVERITY_STYLE[a.severity] || SEVERITY_STYLE.info}`}
            >
              <span className="material-symbols-outlined text-[16px] mt-0.5 shrink-0">{meta.icon}</span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-[var(--text-color)] leading-snug break-words">
                  {a.message}
                </p>
                <p className="text-[11px] text-[var(--text-secondary)] font-medium mt-0.5">
                  {meta.label}
                  {a.actor ? ` • ${a.actor}` : ''}
                  {a.tokenNumber ? ` • ${a.tokenNumber}` : ''}
                  {' • '}
                  {timeAgo(a.createdAt)}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
