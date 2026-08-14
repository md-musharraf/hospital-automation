import React, { useState, useEffect, useRef, useCallback } from 'react';
import { BACKEND_URL } from '../App';

/**
 * The booking assistant embedded in a facility's landing page.
 *
 * A visitor should be able to get a token **without leaving the page they
 * landed on** — asking them to click through to a separate portal first is
 * where bookings are lost. So the landing page carries the real thing, not a
 * link to it.
 *
 * This is a thin client over `POST /api/v1/chat/message` — the exact same state
 * machine, triage and token issuing that the full portal and WhatsApp use. It
 * deliberately owns no conversation logic of its own: a second copy of the
 * booking flow would drift from the first within a release, and the bug would
 * surface as patients booked into the wrong department.
 */
export default function FacilityBookingBot({ hospitalId, facilityName, theme, whatsappNumber }) {
  const [messages, setMessages] = useState([]);
  const [options, setOptions] = useState([]);
  const [input, setInput] = useState('');
  const [token, setToken] = useState(null);
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);
  const scrollRef = useRef(null);
  // One conversation per mounted widget. The backend keys its ChatSession on
  // this, so it must stay stable for the life of the component.
  const sessionRef = useRef('landing_' + Math.random().toString(36).slice(2, 11));

  const send = useCallback(
    async (text) => {
      const body = (text || '').trim();
      if (!body || busy) return;

      setMessages((prev) => [...prev, { sender: 'user', text: body }]);
      setInput('');
      setOptions([]);
      setBusy(true);

      try {
        const res = await fetch(`${BACKEND_URL}/api/v1/chat/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: sessionRef.current, message: body, hospitalId })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || `Server returned ${res.status}`);

        if (Array.isArray(data.messages)) {
          setMessages((prev) => [...prev, ...data.messages.map((m) => ({ sender: 'bot', text: m.text }))]);
        }
        setOptions(Array.isArray(data.options) ? data.options : []);
        if (data.token) setToken(data.token);
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          { sender: 'bot', text: `⚠️ ${err.message || 'Could not reach the booking service.'}` }
        ]);
        // Always leave the visitor a way forward — a dead chat box with no
        // buttons is indistinguishable from a broken page.
        setOptions(['Hi']);
      } finally {
        setBusy(false);
      }
    },
    [busy, hospitalId]
  );

  // The conversation opens itself the first time the widget is interacted with
  // rather than on mount, so a visitor who only scrolls past never creates a
  // ChatSession row.
  const begin = () => {
    if (started) return;
    setStarted(true);
    send('hi');
  };

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, options, token]);

  const waHref = whatsappNumber
    ? `https://wa.me/${whatsappNumber.replace(/[^0-9]/g, '')}?text=${encodeURIComponent('Hi')}`
    : '';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
      {/* The assistant itself */}
      <div className="lg:col-span-3 bg-[var(--card-bg)] border border-[var(--border-color)]/40 rounded-2xl overflow-hidden flex flex-col shadow-lg">
        <div
          className="px-5 py-3.5 flex items-center gap-2.5 text-white"
          style={{ background: `linear-gradient(135deg, ${theme.primary}, ${theme.primaryDark})` }}
        >
          <span className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[20px]">smart_toy</span>
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-black leading-tight truncate">{facilityName} Assistant</span>
            <span className="block text-[10px] font-bold opacity-90 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
              Online · books your token in ~30 seconds
            </span>
          </span>
        </div>

        <div
          ref={scrollRef}
          className="flex-1 min-h-[280px] max-h-[380px] overflow-y-auto p-4 space-y-2.5 bg-[var(--bg-color)]/40 no-scrollbar"
        >
          {!started ? (
            <div className="h-full flex flex-col items-center justify-center text-center gap-3 py-8">
              <span
                className="w-14 h-14 rounded-2xl flex items-center justify-center"
                style={{ background: `${theme.primary}14`, color: theme.primary }}
              >
                <span className="material-symbols-outlined text-[28px]">forum</span>
              </span>
              <p className="text-xs font-bold text-[var(--text-color)]">
                Describe your symptoms — we&apos;ll pick the right doctor for you.
              </p>
              <p className="text-[11px] text-[var(--text-secondary)] font-medium max-w-xs">
                No form, no phone call. You&apos;ll get a live queue token and a message when your turn is
                near, so you can wait at home.
              </p>
              <button
                type="button"
                onClick={begin}
                className="mt-1 px-5 py-2.5 rounded-xl text-white text-xs font-black shadow-md active:scale-95 transition-all"
                style={{ background: theme.primary }}
              >
                Start booking
              </button>
            </div>
          ) : (
            messages.map((m, i) => (
              <div key={i} className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] px-3.5 py-2 rounded-2xl text-xs font-semibold leading-relaxed whitespace-pre-line ${
                    m.sender === 'user'
                      ? 'text-white rounded-br-sm'
                      : 'bg-[var(--card-bg)] border border-[var(--border-color)]/40 text-[var(--text-color)] rounded-bl-sm'
                  }`}
                  style={m.sender === 'user' ? { background: theme.primary } : undefined}
                >
                  {m.text}
                </div>
              </div>
            ))
          )}

          {busy && (
            <div className="flex justify-start">
              <div className="px-3.5 py-2.5 rounded-2xl rounded-bl-sm bg-[var(--card-bg)] border border-[var(--border-color)]/40 flex gap-1">
                {[0, 150, 300].map((d) => (
                  <span
                    key={d}
                    className="w-1.5 h-1.5 rounded-full animate-bounce"
                    style={{ background: theme.primary, animationDelay: `${d}ms` }}
                  />
                ))}
              </div>
            </div>
          )}

          {token && (
            <div
              className="mt-2 p-4 rounded-2xl text-white text-center space-y-1"
              style={{ background: `linear-gradient(135deg, ${theme.primary}, ${theme.gradient[2]})` }}
            >
              <p className="text-[10px] font-black uppercase tracking-widest opacity-80">Your queue token</p>
              <p className="text-3xl font-black leading-none">{token.tokenNumber}</p>
              {token.estimatedWaitTime !== undefined && (
                <p className="text-[11px] font-bold opacity-90">
                  Approx. {token.estimatedWaitTime} min wait — we&apos;ll message you before your turn.
                </p>
              )}
              <a
                href={`/track/${token._id || token.id || ''}`}
                className="inline-block mt-1 px-4 py-1.5 rounded-lg bg-white/20 border border-white/30 text-[11px] font-black"
              >
                Track live
              </a>
            </div>
          )}
        </div>

        {started && (
          <div className="border-t border-[var(--border-color)]/30 bg-[var(--card-bg)]">
            {options.length > 0 && (
              <div className="px-3 pt-3 flex flex-wrap gap-1.5">
                {options.map((opt, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => send(opt)}
                    disabled={busy}
                    className="px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all active:scale-95 disabled:opacity-50"
                    style={{
                      borderColor: `${theme.primary}55`,
                      color: theme.primary,
                      background: `${theme.primary}0d`
                    }}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send(input);
              }}
              className="p-3 flex items-center gap-2"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type your symptoms…"
                disabled={busy}
                className="flex-1 bg-[var(--bg-color)] border border-[var(--border-color)]/50 focus:border-[var(--primary-color)] rounded-xl px-3.5 py-2 outline-none text-xs font-semibold text-[var(--text-color)]"
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                className="w-9 h-9 rounded-xl text-white flex items-center justify-center shrink-0 active:scale-95 transition-all disabled:opacity-40"
                style={{ background: theme.primary }}
                aria-label="Send"
              >
                <span className="material-symbols-outlined text-[18px]">send</span>
              </button>
            </form>
          </div>
        )}
      </div>

      {/* The same booking, on the channel most patients already live in. */}
      <div className="lg:col-span-2 space-y-4">
        <div className="bg-[var(--card-bg)] border border-emerald-500/30 rounded-2xl p-5 space-y-3">
          <span className="w-11 h-11 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <span className="material-symbols-outlined text-[22px]">chat</span>
          </span>
          <h4 className="text-sm font-black text-[var(--text-color)]">Book on WhatsApp instead</h4>
          <p className="text-xs text-[var(--text-secondary)] font-medium leading-relaxed">
            Send &ldquo;Hi&rdquo; and the same assistant replies on WhatsApp — no app, no login. Your token
            and every queue update arrive right in the chat.
          </p>
          {waHref ? (
            <a
              href={waHref}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full px-4 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-black flex items-center justify-center gap-1.5 active:scale-95 transition-all"
            >
              <span className="material-symbols-outlined text-[17px]">open_in_new</span>
              Message {whatsappNumber}
            </a>
          ) : (
            <p className="text-[11px] font-bold text-[var(--text-secondary)]">
              WhatsApp booking is not configured for this facility yet.
            </p>
          )}
        </div>

        <div className="bg-[var(--card-bg)] border border-[var(--border-color)]/40 rounded-2xl p-5 space-y-2.5">
          {[
            {
              icon: 'psychology',
              text: 'Symptoms are read in English or Hindi and routed to the right department.'
            },
            {
              icon: 'emergency',
              text: 'Red-flag symptoms are escalated to emergency priority automatically.'
            },
            {
              icon: 'notifications_active',
              text: "A message tells you when you're next — wait at home, not in a corridor."
            }
          ].map((row) => (
            <div key={row.icon} className="flex items-start gap-2.5">
              <span
                className="material-symbols-outlined text-[18px] shrink-0 mt-0.5"
                style={{ color: theme.primary }}
              >
                {row.icon}
              </span>
              <span className="text-[11px] font-semibold text-[var(--text-secondary)] leading-relaxed">
                {row.text}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
