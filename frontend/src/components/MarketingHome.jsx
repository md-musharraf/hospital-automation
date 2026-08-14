import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './dashboard/DashboardKit';
import useScrollReveal from '../hooks/useScrollReveal';

/**
 * CareeAi's own home page — three things, and nothing else.
 *
 * This page used to run eight sections: a problem strip, a six-card facility
 * grid, a five-step journey, a department diagram, a patient grid, a modules
 * wall, a stats band and a closing panel. Every one of them was true, and
 * together they were a wall — a visitor had to read the whole page to work out
 * whether they were meant to book an appointment or sign in to a console.
 *
 * There are exactly two people who arrive here, so there are exactly three
 * sections:
 *
 *   1. Our story    — what this is, in one screen.
 *   2. Patients     — book a token. Two doors: WhatsApp, or the chat bot.
 *   3. Hospitals    — sign in. One password, five dashboards behind it.
 *
 * The navigation says the same thing: Patient, or Hospital. If a section does
 * not serve one of those two people, it does not belong on this page — the
 * modules list lives in onboarding, the department detail lives on each
 * facility's own generated page.
 *
 * Every claim here is something the system actually does. Colour lives behind
 * `.marketing-scope` (see index.css); the consoles stay monochrome so clinical
 * colour keeps its meaning.
 */

/**
 * The shared booking number.
 *
 * Sending "hi" here opens the facility picker before anything else — which is
 * the answer to "I don't know which hospital to go to". Matches the default in
 * PatientPortal; a facility with its own number overrides it on its own page.
 */
const PLATFORM_WHATSAPP = '+917484043690';
const WA_HREF = `https://wa.me/${PLATFORM_WHATSAPP.replace(/[^0-9]/g, '')}?text=hi`;

/** Section 1 — the story, told as three plain promises. */
const STORY = [
  {
    icon: 'schedule',
    title: 'Nobody should queue from six in the morning',
    body: 'People travel at dawn and stand for hours because there is no way to know when their turn is. A token you can get from your phone is the whole idea.'
  },
  {
    icon: 'psychology',
    title: 'You should not need to know the specialist',
    body: 'Describe the problem in your own words, in Hindi or English. We read the symptoms, pick the department, and hand the token to the doctor who is free.'
  },
  {
    icon: 'hub',
    title: 'One record, every desk',
    body: 'Reception, doctor, lab and pharmacy work the same patient record, live. Nobody re-types what the last counter already knew, and nobody carries paper.'
  }
];

/** Section 2 — what a patient gets after the booking. */
const PATIENT_FEATURES = [
  {
    icon: 'confirmation_number',
    title: 'A token with a time on it',
    body: 'Your number comes back with an approximate turn time, so you leave home once — not at dawn.'
  },
  {
    icon: 'notifications_active',
    title: 'A ping when you are next',
    body: 'One message as your turn approaches. That single message is what empties the corridor.'
  },
  {
    icon: 'emergency',
    title: 'Red flags jump the queue',
    body: 'Chest pain, breathlessness, heavy bleeding — the assistant escalates instead of handing you a number.'
  },
  {
    icon: 'lab_profile',
    title: 'Reports and prescriptions on your phone',
    body: 'Lab results and the doctor’s prescription arrive digitally. Nothing to lose before the follow-up.'
  }
];

/**
 * Section 3 — the five dashboards behind the one facility password.
 *
 * Owner sits first deliberately: it is the room the person who signs the
 * cheque opens, and it is the only one that shows the whole building at once.
 */
const DASHBOARDS = [
  {
    icon: 'insights',
    title: 'Owner',
    body: 'The whole facility on one screen — every desk’s load, today’s numbers, and the live activity feed.'
  },
  {
    icon: 'support_agent',
    title: 'Reception',
    body: 'Arrivals, walk-in tokens, priority overrides and the day’s billing counter.'
  },
  {
    icon: 'stethoscope',
    title: 'Doctor',
    body: 'One queue per cabin. Call next, consult, order tests, prescribe.'
  },
  {
    icon: 'science',
    title: 'Lab',
    body: 'Pending samples, results and report uploads, pushed straight back to the doctor.'
  },
  {
    icon: 'local_pharmacy',
    title: 'Pharmacy',
    body: 'Prescriptions, stock levels, dispensing and refill requests.'
  }
];

/* ────────────────────────────────────────────────────────────────────────── */

/**
 * The hero's picture: the patient's phone, because that is where this starts.
 *
 * Drawn rather than screenshotted — a real screenshot needs a seeded facility,
 * goes stale on the next UI change, and ships a PNG heavier than the page.
 * `aria-hidden` because every value in it is illustrative; a screen reader
 * announcing "Token T-27" as if it were this visitor's would be a lie told in
 * the one place a sighted user can see is a picture.
 */
function ChatShot() {
  return (
    <div
      aria-hidden="true"
      className="relative select-none pointer-events-none mx-auto w-[290px] sm:w-[330px]"
    >
      <div className="rounded-[2rem] border-[7px] border-[var(--ink)] bg-[var(--ink)] shadow-2xl shadow-[var(--ink)]/30">
        <div className="rounded-[1.4rem] overflow-hidden bg-[var(--surface)]">
          <div className="bg-[var(--brand)] text-[var(--brand-on)] px-4 py-3 flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0">
              <Icon name="health_and_safety" className="text-[18px]" />
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-black leading-tight">CareeAi</span>
              <span className="block text-[10px] font-bold opacity-85">on WhatsApp · online</span>
            </span>
          </div>

          <div className="p-3 space-y-2 bg-[var(--surface-sunken)] min-h-[330px]">
            <p className="ml-auto w-fit max-w-[85%] text-[11.5px] font-semibold px-2.5 py-2 rounded-xl rounded-br-sm bg-[var(--brand)] text-[var(--brand-on)]">
              Hi
            </p>
            <p className="w-fit max-w-[92%] text-[11.5px] font-semibold px-2.5 py-2 rounded-xl rounded-bl-sm bg-[var(--surface)] border border-[var(--hairline)] text-[var(--text-color)]">
              Namaste! Aap kis hospital jaana chahte hain?
              <br />
              <span className="text-[var(--brand-strong)] font-bold">1.</span> City Care Hospital
              <br />
              <span className="text-[var(--brand-strong)] font-bold">2.</span> Sunrise Clinic
            </p>
            <p className="ml-auto w-fit max-w-[85%] text-[11.5px] font-semibold px-2.5 py-2 rounded-xl rounded-br-sm bg-[var(--brand)] text-[var(--brand-on)]">
              1
            </p>
            <p className="ml-auto w-fit max-w-[85%] text-[11.5px] font-semibold px-2.5 py-2 rounded-xl rounded-br-sm bg-[var(--brand)] text-[var(--brand-on)]">
              Bukhar aur sar dard hai
            </p>
            <p className="w-fit max-w-[92%] text-[11.5px] font-semibold px-2.5 py-2 rounded-xl rounded-bl-sm bg-[var(--surface)] border border-[var(--hairline)] text-[var(--text-color)]">
              General Medicine ke liye book kar rahe hain.
            </p>
            <p className="w-fit max-w-[95%] text-[11.5px] font-bold px-2.5 py-2 rounded-xl rounded-bl-sm bg-[var(--surface)] border border-[var(--hairline)] text-[var(--text-color)]">
              Token <span className="text-[var(--brand-strong)]">T-27</span> · Dr. Rao
              <br />
              <span className="font-semibold text-[var(--text-secondary)]">Approx. turn in 40 min</span>
            </p>
            <p className="w-fit max-w-[95%] text-[11.5px] font-semibold px-2.5 py-2 rounded-xl rounded-bl-sm bg-[var(--brand-soft)] text-[var(--brand-strong)]">
              Aapka number aane wala hai — nikal jaiye.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────── */

export default function MarketingHome() {
  const [menuOpen, setMenuOpen] = useState(false);
  useScrollReveal([]);

  useEffect(() => {
    const previous = document.title;
    document.title = 'CareeAi — book a hospital token from your phone';
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <div className="marketing-scope flex-1 w-full overflow-y-auto bg-[var(--bg-color)] text-[var(--text-color)] no-scrollbar">
      {/* ── Navigation: two audiences, two links ───────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-[var(--border-color)]/40 bg-[var(--bg-color)]/85 backdrop-blur-md">
        <nav
          aria-label="Primary"
          className="max-w-[1100px] mx-auto px-5 sm:px-8 h-16 flex items-center justify-between gap-4"
        >
          {/* Named explicitly: a Material Symbols glyph is a ligature, so the
              icon's raw text ("health_and_safety") lands in the accessible name
              alongside the wordmark unless the link states its own. */}
          <Link to="/" aria-label="CareeAi home" className="flex items-center gap-2.5 shrink-0 rounded-lg">
            <span
              aria-hidden="true"
              className="w-9 h-9 rounded-xl bg-[var(--brand)] text-[var(--brand-on)] flex items-center justify-center"
            >
              <Icon name="health_and_safety" className="text-[21px]" />
            </span>
            <span className="text-[17px] font-black tracking-tight text-[var(--text-color)] leading-none">
              CareeAi
            </span>
          </Link>

          {/* The whole navigation. A visitor is here to book, or to sign in —
              so the bar asks which one they are rather than listing topics. */}
          <div className="hidden sm:flex items-center gap-1.5">
            <a
              href="#patients"
              className="px-4 py-2.5 rounded-xl text-[14px] font-black text-[var(--text-color)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand-strong)] transition-colors duration-200 flex items-center gap-2"
            >
              <Icon name="personal_injury" className="text-[19px]" />
              Patient
            </a>
            <a
              href="#hospital"
              className="px-4 py-2.5 rounded-xl text-[14px] font-black text-[var(--text-color)] hover:bg-[var(--brand-soft)] hover:text-[var(--brand-strong)] transition-colors duration-200 flex items-center gap-2"
            >
              <Icon name="local_hospital" className="text-[19px]" />
              Hospital
            </a>
          </div>

          <div className="flex items-center gap-2.5">
            <Link
              to="/login"
              className="px-4 py-2.5 rounded-xl bg-[var(--brand)] text-[var(--brand-on)] text-[13.5px] font-black whitespace-nowrap shadow-lg shadow-[var(--brand-ring)] hover:brightness-110 active:scale-95 transition-all duration-200"
            >
              Hospital login
            </Link>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              className="sm:hidden w-11 h-11 -mr-2 rounded-xl flex items-center justify-center text-[var(--text-color)] hover:bg-[var(--card-bg)] transition-colors duration-200"
            >
              <Icon name={menuOpen ? 'close' : 'menu'} className="text-[24px]" />
            </button>
          </div>
        </nav>

        {menuOpen && (
          <div className="sm:hidden border-t border-[var(--border-color)]/40 px-5 py-3 space-y-1 bg-[var(--bg-color)]">
            <a
              href="#patients"
              onClick={() => setMenuOpen(false)}
              className="block px-3 py-3 rounded-lg text-[15px] font-black text-[var(--text-color)] hover:bg-[var(--card-bg)] transition-colors duration-200"
            >
              Patient
            </a>
            <a
              href="#hospital"
              onClick={() => setMenuOpen(false)}
              className="block px-3 py-3 rounded-lg text-[15px] font-black text-[var(--text-color)] hover:bg-[var(--card-bg)] transition-colors duration-200"
            >
              Hospital
            </a>
          </div>
        )}
      </header>

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-[var(--border-color)]/30">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-40 -right-32 w-[34rem] h-[34rem] rounded-full bg-[var(--brand)]/10 blur-3xl"
        />
        <div className="relative max-w-[1100px] mx-auto px-5 sm:px-8 pt-12 pb-16 lg:pt-16 lg:pb-20 grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] gap-12 items-center">
          <div className="space-y-6">
            <span className="animate-fade-in-up inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[11px] font-black uppercase tracking-widest bg-[var(--brand-soft)] text-[var(--brand-strong)] ring-1 ring-[var(--brand-ring)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand)] animate-pulse" />
              Hospital queues, without the queue
            </span>

            <h1 className="animate-fade-in-up delay-100 text-[2.4rem] sm:text-5xl lg:text-[3.3rem] font-black tracking-tight leading-[1.06] text-[var(--text-color)]">
              Book your hospital token
              <br />
              <span className="text-[var(--brand-strong)]">from your phone.</span>
            </h1>

            <p className="animate-fade-in-up delay-200 text-[16px] lg:text-[17px] font-medium text-[var(--text-secondary)] leading-relaxed max-w-xl">
              Send one message. We ask which hospital, read your symptoms in Hindi or English, pick the right
              department, and send back a token with a time on it. Wait at home until it is nearly your turn.
            </p>

            {/* The two doors from the note: WhatsApp, or the bot. Everything
                else on this page is explanation; these are the product. */}
            <div className="animate-fade-in-up delay-300 flex flex-wrap gap-3 pt-1">
              <a
                href={WA_HREF}
                target="_blank"
                rel="noopener noreferrer"
                className="px-6 py-3.5 rounded-xl bg-[var(--brand)] text-[var(--brand-on)] text-[15px] font-black shadow-lg shadow-[var(--brand-ring)] hover:brightness-110 active:scale-95 transition-all duration-200 flex items-center gap-2"
              >
                <Icon name="chat" className="text-[20px]" />
                Book on WhatsApp
              </a>
              <Link
                to="/facilities"
                className="px-6 py-3.5 rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] text-[15px] font-black text-[var(--text-color)] hover:border-[var(--brand)] active:scale-95 transition-all duration-200 flex items-center gap-2"
              >
                <Icon name="smart_toy" className="text-[20px]" />
                Book with the AI bot
              </Link>
            </div>

            <p className="animate-fade-in-up delay-400 text-[13px] font-bold text-[var(--text-secondary)]">
              No app. No account. No form.
            </p>
          </div>

          <div className="animate-fade-in-up delay-200">
            <ChatShot />
          </div>
        </div>
      </section>

      {/* ── 1. Our story ───────────────────────────────────────────────── */}
      <section id="story" className="scroll-mt-20 px-5 sm:px-8 py-16 lg:py-20">
        <div className="max-w-[1100px] mx-auto">
          <div className="reveal max-w-2xl mb-12 space-y-3">
            <span className="inline-block text-[11px] uppercase font-black tracking-widest px-3 py-1.5 rounded-full bg-[var(--brand-soft)] text-[var(--brand-strong)]">
              Our story
            </span>
            <h2 className="text-3xl md:text-[2.5rem] font-black leading-tight text-[var(--text-color)]">
              We built this for the corridor outside the OPD
            </h2>
            <p className="text-[15px] font-medium text-[var(--text-secondary)] leading-relaxed">
              CareeAi gives a hospital or clinic its whole front office — a public page, booking over chat,
              live token queues and a dashboard for every desk. Patients get the one thing the corridor never
              gave them: knowing when their turn is.
            </p>
          </div>

          <div className="reveal grid grid-cols-1 md:grid-cols-3 gap-6">
            {STORY.map((s) => (
              <div
                key={s.title}
                className="card-hover bg-[var(--card-bg)] border border-[var(--border-color)]/50 rounded-2xl p-6 space-y-3.5"
              >
                <span className="w-12 h-12 rounded-xl bg-[var(--brand-soft)] text-[var(--brand-strong)] flex items-center justify-center ring-1 ring-[var(--brand-ring)]">
                  <Icon name={s.icon} className="text-[24px]" />
                </span>
                <h3 className="text-[16.5px] font-black text-[var(--text-color)] leading-tight">{s.title}</h3>
                <p className="text-[14px] font-medium text-[var(--text-secondary)] leading-relaxed">
                  {s.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 2. Patients ────────────────────────────────────────────────── */}
      <section
        id="patients"
        className="scroll-mt-16 px-5 sm:px-8 py-16 lg:py-20 bg-[var(--card-bg)] border-y border-[var(--border-color)]/30"
      >
        <div className="max-w-[1100px] mx-auto">
          <div className="reveal max-w-2xl mb-10 space-y-3">
            <span className="inline-flex items-center gap-2 text-[11px] uppercase font-black tracking-widest px-3 py-1.5 rounded-full bg-[var(--brand-soft)] text-[var(--brand-strong)]">
              <Icon name="personal_injury" className="text-[15px]" />
              For patients
            </span>
            <h2 className="text-3xl md:text-[2.5rem] font-black leading-tight text-[var(--text-color)]">
              Two ways to get a token
            </h2>
            <p className="text-[15px] font-medium text-[var(--text-secondary)] leading-relaxed">
              Both ask the same three questions and both end with a token. Pick whichever is already open on
              your phone.
            </p>
          </div>

          {/* The two doors, given equal weight — a patient on WhatsApp and a
              patient on the web are the same patient, and neither route is a
              lesser version of the other. */}
          <div className="reveal grid grid-cols-1 md:grid-cols-2 gap-5 mb-12">
            <a
              href={WA_HREF}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Book a token over WhatsApp"
              className="card-hover group bg-[var(--bg-color)] border border-[var(--border-color)]/50 hover:border-[var(--brand)] rounded-2xl p-7 flex flex-col"
            >
              <span className="w-14 h-14 rounded-2xl bg-[var(--brand)] text-[var(--brand-on)] flex items-center justify-center">
                <Icon name="chat" className="text-[28px]" />
              </span>
              <h3 className="mt-4 text-[19px] font-black text-[var(--text-color)]">Over WhatsApp</h3>
              <p className="mt-2 text-[14px] font-medium text-[var(--text-secondary)] leading-relaxed flex-1">
                Send <span className="font-black text-[var(--text-color)]">“Hi”</span> to{' '}
                <span className="font-black text-[var(--text-color)] whitespace-nowrap">
                  {PLATFORM_WHATSAPP}
                </span>
                . The assistant asks which hospital, then what is wrong. Works on any phone that has WhatsApp
                — nothing to install.
              </p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-[14px] font-black text-[var(--brand-strong)]">
                Open WhatsApp
                <Icon
                  name="arrow_forward"
                  className="text-[18px] group-hover:translate-x-0.5 transition-transform"
                />
              </span>
            </a>

            <Link
              to="/facilities"
              aria-label="Book a token with the AI bot"
              className="card-hover group bg-[var(--bg-color)] border border-[var(--border-color)]/50 hover:border-[var(--brand)] rounded-2xl p-7 flex flex-col"
            >
              <span className="w-14 h-14 rounded-2xl bg-[var(--ink)] text-[var(--on-ink)] flex items-center justify-center">
                <Icon name="smart_toy" className="text-[28px]" />
              </span>
              <h3 className="mt-4 text-[19px] font-black text-[var(--text-color)]">With the AI bot</h3>
              <p className="mt-2 text-[14px] font-medium text-[var(--text-secondary)] leading-relaxed flex-1">
                Find your hospital — by name, by district, or by what is nearest to you — and book in the chat
                on its own page. The same assistant, in the browser.
              </p>
              <span className="mt-4 inline-flex items-center gap-1.5 text-[14px] font-black text-[var(--brand-strong)]">
                Find your hospital
                <Icon
                  name="arrow_forward"
                  className="text-[18px] group-hover:translate-x-0.5 transition-transform"
                />
              </span>
            </Link>
          </div>

          {/* Don't know which hospital or which doctor? That is the normal
              case, and it is the one question this product exists to answer —
              so it gets said out loud rather than left to the bot to reveal. */}
          <div className="reveal rounded-2xl bg-[var(--brand-soft)] ring-1 ring-[var(--brand-ring)] p-6 sm:p-7 mb-12 flex flex-col sm:flex-row gap-5 sm:items-center">
            <span className="w-12 h-12 rounded-xl bg-[var(--brand)] text-[var(--brand-on)] flex items-center justify-center shrink-0">
              <Icon name="help" className="text-[26px]" />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-[17px] font-black text-[var(--text-color)]">
                Don’t know which hospital, or which doctor?
              </h3>
              <p className="mt-1.5 text-[14px] font-medium text-[var(--text-secondary)] leading-relaxed">
                You are not supposed to. Say what is wrong — “bukhar aur sar dard hai” is enough. The
                assistant lists the hospitals near you, matches your symptoms to a department, and hands the
                token to whichever doctor there has the shortest queue.
              </p>
            </div>
          </div>

          <div className="reveal grid grid-cols-1 sm:grid-cols-2 gap-5">
            {PATIENT_FEATURES.map((f) => (
              <div
                key={f.title}
                className="bg-[var(--bg-color)] border border-[var(--border-color)]/50 rounded-2xl p-6 flex gap-4"
              >
                <span className="w-12 h-12 rounded-xl bg-[var(--brand-soft)] text-[var(--brand-strong)] flex items-center justify-center shrink-0 ring-1 ring-[var(--brand-ring)]">
                  <Icon name={f.icon} className="text-[24px]" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-[16.5px] font-black text-[var(--text-color)] leading-tight">
                    {f.title}
                  </h3>
                  <p className="text-[14px] font-medium text-[var(--text-secondary)] leading-relaxed mt-1.5">
                    {f.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 3. Hospital / clinic login ─────────────────────────────────── */}
      <section id="hospital" className="scroll-mt-16 bg-[var(--ink)] text-[var(--on-ink)]">
        <div className="max-w-[1100px] mx-auto px-5 sm:px-8 py-16 lg:py-20">
          <div className="reveal max-w-2xl mb-10 space-y-3">
            <span className="inline-flex items-center gap-2 text-[11px] uppercase font-black tracking-widest px-3 py-1.5 rounded-full bg-white/10 text-[var(--brand)]">
              <Icon name="local_hospital" className="text-[15px]" />
              For hospitals &amp; clinics
            </span>
            <h2 className="text-3xl md:text-[2.5rem] font-black leading-tight text-[var(--on-ink)]">
              One password. Five dashboards.
            </h2>
            <p className="text-[15px] font-medium text-[var(--on-ink-muted)] leading-relaxed">
              Your staff search for your facility, type the one facility password, and land in the console.
              Which dashboards open is decided by the units you actually run — a dental clinic never sees a
              lab bench.
            </p>
          </div>

          <div className="reveal grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-10">
            {DASHBOARDS.map((d) => (
              <div key={d.title} className="rounded-2xl bg-white/[0.06] border border-white/10 p-6 space-y-3">
                <span className="w-12 h-12 rounded-xl bg-[var(--brand)] text-[var(--brand-on)] flex items-center justify-center">
                  <Icon name={d.icon} className="text-[24px]" />
                </span>
                <h3 className="text-[16.5px] font-black text-[var(--on-ink)] leading-tight">{d.title}</h3>
                <p className="text-[14px] font-medium text-[var(--on-ink-muted)] leading-relaxed">{d.body}</p>
              </div>
            ))}

            <div className="rounded-2xl border border-dashed border-white/20 p-6 flex flex-col justify-center">
              <p className="text-[14px] font-bold text-[var(--on-ink)] leading-relaxed">
                Every dashboard keeps its own activity log and its own numbers.
              </p>
              <p className="text-[13px] font-medium text-[var(--on-ink-muted)] leading-relaxed mt-2">
                The owner dashboard is the only one that sees all five at once.
              </p>
            </div>
          </div>

          <div className="reveal flex flex-wrap gap-3">
            <Link
              to="/login"
              className="px-6 py-3.5 rounded-xl bg-[var(--brand)] text-[var(--brand-on)] text-[15px] font-black hover:brightness-110 active:scale-95 transition-all duration-200 flex items-center gap-2"
            >
              <Icon name="login" className="text-[20px]" />
              Hospital / clinic login
            </Link>
            <Link
              to="/admin"
              className="px-6 py-3.5 rounded-xl bg-white/10 border border-white/25 text-[15px] font-black text-[var(--on-ink)] hover:bg-white/20 active:scale-95 transition-all duration-200 flex items-center gap-2"
            >
              <Icon name="add_business" className="text-[20px]" />
              Onboard a facility
            </Link>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="border-t border-[var(--border-color)]/40 bg-[var(--card-bg)]">
        <div className="max-w-[1100px] mx-auto px-5 sm:px-8 py-10 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div className="flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-xl bg-[var(--brand)] text-[var(--brand-on)] flex items-center justify-center">
                <Icon name="health_and_safety" className="text-[21px]" />
              </span>
              <span className="text-[16px] font-black text-[var(--text-color)]">CareeAi</span>
            </div>
            <div className="flex flex-wrap gap-x-7 gap-y-2">
              <a
                href="#story"
                className="text-[13px] font-bold text-[var(--text-secondary)] hover:text-[var(--brand-strong)] transition-colors duration-200"
              >
                Our story
              </a>
              <a
                href="#patients"
                className="text-[13px] font-bold text-[var(--text-secondary)] hover:text-[var(--brand-strong)] transition-colors duration-200"
              >
                Patient
              </a>
              <a
                href="#hospital"
                className="text-[13px] font-bold text-[var(--text-secondary)] hover:text-[var(--brand-strong)] transition-colors duration-200"
              >
                Hospital
              </a>
              <Link
                to="/facilities"
                className="text-[13px] font-bold text-[var(--text-secondary)] hover:text-[var(--brand-strong)] transition-colors duration-200"
              >
                Partner facilities
              </Link>
            </div>
          </div>

          <p className="text-[12.5px] font-medium text-[var(--text-secondary)] max-w-2xl leading-relaxed">
            Patient information is handled to medical data-protection standards. Facility staff sign in
            against their own facility only, and no facility can read another’s records.
          </p>

          <p className="text-[12px] text-[var(--text-secondary)] font-semibold pt-2 border-t border-[var(--border-color)]/40">
            &copy; {new Date().getFullYear()} CareeAi
          </p>
        </div>
      </footer>
    </div>
  );
}
