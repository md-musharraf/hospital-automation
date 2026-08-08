import React from 'react';

/**
 * An empty list that explains itself.
 *
 * "No pending lab test requests." tells a technician nothing: is the system
 * broken, is it still loading, or is there genuinely no work? Every empty state
 * in these portals said some version of that. This one answers the question the
 * person is actually asking — where does work come from, and do I need to do
 * anything to see it?
 */
export default function EmptyState({ icon = 'inbox', title, hint, action }) {
  return (
    <div className="py-10 px-6 flex flex-col items-center justify-center text-center border border-dashed border-[var(--border-color)] rounded-2xl bg-[var(--card-bg)]/30">
      <span className="material-symbols-outlined text-[40px] mb-2 text-[var(--text-secondary)]/40">
        {icon}
      </span>
      <p className="text-sm font-bold text-[var(--text-color)]">{title}</p>
      {hint && (
        <p className="text-xs text-[var(--text-secondary)] max-w-sm mt-1.5 font-medium leading-relaxed">
          {hint}
        </p>
      )}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
