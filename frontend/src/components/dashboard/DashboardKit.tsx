import React from 'react';

/**
 * The pieces every role's dashboard is built from.
 *
 * One card, one panel, one table — used by the doctor, the lab bench, the
 * pharmacy counter and reception alike. The portals used to hand-roll each of
 * these, which is why the same idea ("a number worth glancing at") appeared in
 * four different sizes and three different border radii across the app.
 *
 * Type never drops below 11px here, and 11px is reserved for uppercase labels.
 * These screens are read at arm's length across a counter, often by someone
 * standing up.
 */

export function Icon({
  name,
  className = '',
  style
}: {
  name: any;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span className={`material-symbols-outlined ${className}`} style={style}>
      {name}
    </span>
  );
}

/** Tone presets so a number's colour always means the same thing everywhere. */
const TONES = {
  neutral: { fg: 'var(--text-color)', bg: 'var(--bg-color)', ring: 'var(--border-color)' },
  primary: { fg: 'var(--primary-color)', bg: 'var(--primary-color)', ring: 'var(--primary-color)' },
  good: { fg: '#059669', bg: '#10b981', ring: '#10b981' },
  warn: { fg: '#d97706', bg: '#f59e0b', ring: '#f59e0b' },
  bad: { fg: '#e11d48', bg: '#f43f5e', ring: '#f43f5e' },
  info: { fg: '#0284c7', bg: '#0ea5e9', ring: '#0ea5e9' }
};

/**
 * One number worth glancing at. The value is large on purpose — this is the
 * part read from across a room, and the label under it only has to confirm what
 * the number already said.
 */
export function StatCard({ icon, value, label, sub, tone = 'neutral' }) {
  const t = TONES[tone] || TONES.neutral;
  return (
    <div className="flex-1 min-w-[150px] bg-[var(--card-bg)] border border-[var(--border-color)]/40 rounded-2xl p-4 flex items-center gap-3.5">
      {icon && (
        <span
          className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: `${t.bg}1f`, color: t.fg }}
        >
          <Icon name={icon} className="text-[24px]" />
        </span>
      )}
      <span className="min-w-0">
        <span className="block text-[26px] font-black leading-none" style={{ color: t.fg }}>
          {value}
        </span>
        <span className="block text-[13px] font-bold text-[var(--text-color)] mt-1 truncate">{label}</span>
        {sub && <span className="block text-[12px] font-semibold text-[var(--text-secondary)]">{sub}</span>}
      </span>
    </div>
  );
}

/** The row of numbers across the top of a dashboard. */
export function StatStrip({ stats }) {
  if (!stats || !stats.length) return null;
  return (
    <div className="flex flex-wrap gap-3">
      {stats.map((s) => (
        <StatCard key={s.label} {...s} />
      ))}
    </div>
  );
}

/**
 * A titled card. `action` is the one link a panel is allowed in its header —
 * more than that and the header becomes a toolbar nobody reads.
 */
export function Panel({
  title,
  count = null,
  icon = null,
  action = null,
  children,
  className = '',
  bodyClassName = ''
}: any) {
  return (
    <section
      className={`bg-[var(--card-bg)] border border-[var(--border-color)]/40 rounded-2xl flex flex-col min-w-0 ${className}`}
    >
      {title && (
        <header className="px-5 py-3.5 border-b border-[var(--border-color)]/30 flex items-center gap-2">
          {icon && <Icon name={icon} className="text-[19px] text-[var(--primary-color)] shrink-0" />}
          <h3 className="text-[15px] font-black text-[var(--text-color)] truncate">{title}</h3>
          {count !== undefined && count !== null && (
            <span className="text-[12px] font-black px-2 py-0.5 rounded-full bg-[var(--primary-color)]/12 text-[var(--primary-color)] shrink-0">
              {count}
            </span>
          )}
          {action && (
            <button
              type="button"
              onClick={action.onClick}
              className="ml-auto text-[13px] font-black text-[var(--primary-color)] hover:underline shrink-0"
            >
              {action.label}
            </button>
          )}
        </header>
      )}
      <div className={`p-5 flex-1 min-w-0 ${bodyClassName}`}>{children}</div>
    </section>
  );
}

/**
 * What this role does most often. The primary action is given the full width
 * because it is pressed far more than the rest put together — a doctor calls
 * the next patient dozens of times a session and orders a test occasionally.
 */
export function QuickActions({ actions, onAction }) {
  if (!actions || !actions.length) return null;
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {actions.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={() => onAction && onAction(a.id)}
          className={`rounded-xl px-3 py-4 flex flex-col items-center justify-center gap-1.5 font-black transition-all active:scale-95 border ${
            a.primary
              ? 'col-span-2 bg-[var(--primary-color)] text-white border-transparent text-[15px] shadow-lg shadow-[var(--primary-color)]/20'
              : 'bg-[var(--bg-color)] text-[var(--text-color)] border-[var(--border-color)]/50 hover:border-[var(--primary-color)]/50 text-[13px]'
          }`}
        >
          <Icon name={a.icon} className={a.primary ? 'text-[24px]' : 'text-[21px]'} />
          {a.label}
        </button>
      ))}
    </div>
  );
}

/**
 * The one thing in front of this person right now — the token being served, the
 * sample on the bench, the prescription at the counter. Every role has exactly
 * one of these, and it is the largest object on their screen.
 */
export function FocusCard({ kicker, code, title, rows = [], tone = 'primary', empty, children }) {
  const t = TONES[tone] || TONES.primary;
  if (empty) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--border-color)] bg-[var(--bg-color)]/40 py-12 px-6 flex flex-col items-center text-center gap-2">
        <Icon name="inbox" className="text-[38px] text-[var(--text-secondary)]/50" />
        <p className="text-[16px] font-black text-[var(--text-color)]">{empty.title}</p>
        {empty.hint && (
          <p className="text-[13px] font-medium text-[var(--text-secondary)] max-w-xs">{empty.hint}</p>
        )}
      </div>
    );
  }
  return (
    <div className="rounded-2xl p-5 border" style={{ background: `${t.bg}0f`, borderColor: `${t.bg}33` }}>
      {kicker && (
        <p className="text-[11px] uppercase font-black tracking-widest" style={{ color: t.fg }}>
          {kicker}
        </p>
      )}
      {code && (
        <p className="text-[38px] font-black leading-none mt-1" style={{ color: t.fg }}>
          {code}
        </p>
      )}
      {title && <p className="text-[17px] font-black text-[var(--text-color)] mt-2">{title}</p>}
      {rows.length > 0 && (
        <dl className="mt-3 space-y-1.5">
          {rows
            .filter((r) => r && r.value)
            .map((r) => (
              <div key={r.label} className="flex items-baseline gap-2">
                <dt className="text-[12px] uppercase font-bold text-[var(--text-secondary)] tracking-wide w-24 shrink-0">
                  {r.label}
                </dt>
                <dd className="text-[14px] font-bold text-[var(--text-color)] min-w-0 break-words">
                  {r.value}
                </dd>
              </div>
            ))}
        </dl>
      )}
      {children}
    </div>
  );
}

/**
 * A compact list row — a queue entry, an order, a prescription. `code` is the
 * token or reference, kept monospace-width so a column of them lines up.
 */
export function ListRow({ code, title, meta, right, active, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      {...(onClick ? { type: 'button', onClick } : {})}
      className={`w-full text-left px-3.5 py-3 rounded-xl flex items-center gap-3 transition-colors ${
        active
          ? 'bg-[var(--primary-color)]/10 border border-[var(--primary-color)]/40'
          : 'border border-transparent hover:bg-[var(--border-color)]/15'
      }`}
    >
      {code && (
        <span className="text-[13px] font-black text-[var(--primary-color)] w-16 shrink-0">{code}</span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-bold text-[var(--text-color)] truncate">{title}</span>
        {meta && (
          <span className="block text-[12px] font-semibold text-[var(--text-secondary)] truncate">
            {meta}
          </span>
        )}
      </span>
      {right && <span className="shrink-0 text-[13px] font-bold text-[var(--text-secondary)]">{right}</span>}
    </Tag>
  );
}

/** Nothing here yet — say why, and what would put something here. */
export function Empty({ icon = 'inbox', title, hint }) {
  return (
    <div className="py-10 flex flex-col items-center text-center gap-1.5">
      <Icon name={icon} className="text-[34px] text-[var(--text-secondary)]/45" />
      <p className="text-[14px] font-black text-[var(--text-color)]">{title}</p>
      {hint && <p className="text-[12px] font-medium text-[var(--text-secondary)] max-w-xs">{hint}</p>}
    </div>
  );
}
