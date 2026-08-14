import React, { useState } from 'react';

/**
 * A short "how this screen works" card, shown once and dismissible.
 *
 * Every portal here was written for someone who already knew the system. A new
 * lab technician opening the console saw a stats strip, an empty list and a form
 * with no explanation of where work comes from or what happens after they submit
 * it. This closes that gap without adding a training manual: three or four lines
 * of plain language, in the place where the question actually occurs.
 *
 * The dismissal is remembered per portal in localStorage, so it teaches once and
 * then gets out of the way. `Help` in the header brings it back.
 */
export default function HelpPanel({ id, title, steps = [], tip, defaultOpen = true }) {
  const storageKey = `help-dismissed:${id}`;
  const [open, setOpen] = useState(() => {
    try {
      return defaultOpen && localStorage.getItem(storageKey) !== 'true';
    } catch {
      return defaultOpen;
    }
  });

  const dismiss = () => {
    setOpen(false);
    try {
      localStorage.setItem(storageKey, 'true');
    } catch {
      /* private mode — showing it again is harmless */
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="self-start flex items-center gap-1 text-[12px] font-bold text-[var(--text-secondary)] hover:text-[var(--primary-color)] transition-colors"
      >
        <span className="material-symbols-outlined text-[14px]">help</span>
        How this screen works
      </button>
    );
  }

  return (
    <div className="bg-[var(--primary-color)]/5 border border-[var(--primary-color)]/25 rounded-2xl p-4 space-y-2.5">
      <div className="flex items-start justify-between gap-3">
        <h4 className="text-[15px] font-black text-[var(--text-color)] flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[18px] text-[var(--primary-color)]">lightbulb</span>
          {title}
        </h4>
        <button
          onClick={dismiss}
          className="text-[12px] font-black text-[var(--text-secondary)] hover:text-[var(--text-color)] shrink-0"
        >
          GOT IT
        </button>
      </div>

      <ol className="space-y-1.5">
        {steps.map((step, index) => (
          <li
            key={index}
            className="flex items-start gap-2 text-[13px] font-semibold text-[var(--text-color)]"
          >
            <span className="w-4 h-4 rounded-full bg-[var(--primary-color)] text-[var(--primary-text)] text-[11px] font-black flex items-center justify-center shrink-0 mt-0.5">
              {index + 1}
            </span>
            <span className="leading-relaxed">{step}</span>
          </li>
        ))}
      </ol>

      {tip && (
        <p className="text-[12px] font-bold text-[var(--text-secondary)] pt-1.5 border-t border-[var(--primary-color)]/15">
          💡 {tip}
        </p>
      )}
    </div>
  );
}
