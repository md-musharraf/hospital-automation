import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './dashboard/DashboardKit';
import useScrollReveal from '../hooks/useScrollReveal';

/**
 * CareeAi's own home page — the product, not a partner's site.
 *
 * `/` used to be the partner directory with marketing bolted on top and a
 * WhatsApp simulator half way down, so a hospital administrator arriving for
 * the first time met a list of other people's clinics before learning what the
 * product does. The directory is a real page in its own right and now lives at
 * `/facilities`; this page has one job: explain what a facility gets and what
 * its patients get.
 *
 * Every claim here is something the system actually does. Nothing on this page
 * is aspirational — if a number or a feature is named, it is shipped. That rule
 * is why the band below the department diagram counts capabilities rather than
 * customers: a "500+ hospitals" strip is the easiest thing in the world to type
 * and the first thing a serious buyer checks.
 *
 * Colour lives behind `.marketing-scope` (see index.css). The consoles stay
 * monochrome so clinical colour keeps its meaning; this page does not.
 */

const NAV_LINKS = [
  { href: '#facilities', label: 'For facilities' },
  { href: '#patients', label: 'For patients' },
  { href: '#how', label: 'How it works' },
  { href: '#modules', label: 'Modules' }
];

/** The stack a facility is actually buying into, named plainly. */
const POWERED_BY = [
  { icon: 'chat', label: 'WhatsApp booking' },
  { icon: 'psychology', label: 'Symptom triage' },
  { icon: 'bolt', label: 'Live queue sync' },
  { icon: 'shield', label: 'Per-facility isolation' }
];

const HOSPITAL_VALUE = [
  {
    icon: 'rocket_launch',
    title: 'Live in one sitting',
    body: 'Register the facility, tick the units it runs, add your people. Reception, doctor, lab and pharmacy logins are created in the same step.'
  },
  {
    icon: 'language',
    title: 'Its own website, generated',
    body: 'Every facility gets a public page with its departments, doctors, timings and booking — built from what you entered, not from a designer.'
  },
  {
    icon: 'checklist',
    title: 'Only the units you have',
    body: 'A dental clinic is never asked about ICU beds. Tick the lab and the lab console appears; leave it off and nobody sees it.'
  },
  {
    icon: 'groups',
    title: 'One console per desk',
    body: 'Reception, doctor, lab and pharmacy each get a screen built for their job — and they all navigate the same way.'
  },
  {
    icon: 'receipt_long',
    title: 'Billing that follows the patient',
    body: 'Charges land on the bill as the doctor prescribes and the lab tests. Discharge settles one invoice, on your own rate card.'
  },
  {
    icon: 'insights',
    title: 'One live picture',
    body: 'Queue depth, who is waiting on whom, what stock ran out — the same truth on every screen, updated as it happens.'
  }
];

const PATIENT_VALUE = [
  {
    icon: 'chat',
    title: 'Book on WhatsApp',
    body: 'Send "Hi". No app, no account, no form. The assistant reads symptoms in Hindi or English and books the right doctor.'
  },
  {
    icon: 'psychology',
    title: 'No need to know the specialist',
    body: 'Describe the problem in your own words. Symptoms are routed to the right department, and red flags jump the queue automatically.'
  },
  {
    icon: 'home',
    title: 'Wait at home, not in a corridor',
    body: 'You get an approximate turn time at booking and a message when you are next — so you leave home once, not at dawn.'
  },
  {
    icon: 'lab_profile',
    title: 'Reports and prescriptions on your phone',
    body: 'Lab results and the doctor’s prescription arrive digitally. No paper to lose before the follow-up.'
  }
];

/** The patient's journey, in the order it actually happens. */
const STEPS = [
  {
    icon: 'chat',
    title: 'Send a message',
    body: 'The patient writes to the facility on WhatsApp, or opens its public page. No app, no sign-up.'
  },
  {
    icon: 'psychology',
    title: 'Triage routes it',
    body: 'Symptoms pick the department. The least busy doctor gets the token; red flags are escalated ahead of the line.'
  },
  {
    icon: 'confirmation_number',
    title: 'Token confirmed',
    body: 'The token comes back with an approximate turn time, so the patient knows when to leave home.'
  },
  {
    icon: 'notifications_active',
    title: 'Called when near',
    body: 'One message when their turn is approaching — the reason the corridor stays empty.'
  },
  {
    icon: 'done_all',
    title: 'Seen, tested, billed',
    body: 'Doctor, lab and pharmacy work the same record. Discharge settles a single invoice.'
  }
];

/** Every desk the platform connects, with what it owns. */
const DEPARTMENTS = {
  left: [
    {
      icon: 'support_agent',
      title: 'Reception',
      body: 'Arrivals, walk-in tokens, priority and the day’s billing counter.'
    },
    {
      icon: 'stethoscope',
      title: 'Doctors',
      body: 'Call next, consult, order tests, prescribe — one queue per cabin.'
    },
    {
      icon: 'science',
      title: 'Lab',
      body: 'Pending tests, results and report uploads, pushed back to the doctor.'
    }
  ],
  right: [
    {
      icon: 'local_pharmacy',
      title: 'Pharmacy',
      body: 'Prescriptions, stock levels, dispensing and refill requests.'
    },
    {
      icon: 'badge',
      title: 'Staff & admin',
      body: 'Accounts, rate card, modules, and the facility’s public page.'
    },
    {
      icon: 'personal_injury',
      title: 'Patients',
      body: 'Booking, live tracking, digital reports and prescriptions.'
    }
  ]
};

/**
 * Capability facts, not customer counts.
 *
 * A stats band here is conventionally "500+ hospitals / 50k patients". We have
 * not served 50k patients, so the band states what the product does instead —
 * every figure below is checkable by opening the app.
 */
const FACTS = [
  { value: '5', label: 'Consoles', sub: 'Reception, doctor, lab, pharmacy, admin' },
  { value: '2', label: 'Languages', sub: 'Hindi and English, in chat' },
  { value: '0', label: 'Apps to install', sub: 'Patients use WhatsApp or the web' },
  { value: '15', label: 'Switchable units', sub: 'Turn on only what your facility runs' }
];

const MODULES = [
  'OPD',
  'Reception',
  '24×7 Emergency',
  'Inpatient beds',
  'Pathology lab',
  'Pharmacy',
  'Radiology',
  'Ambulance',
  'Blood bank',
  'Physiotherapy',
  'Vaccination',
  'Day care',
  'Tele-consultation',
  'Health packages',
  'Insurance / TPA'
];

/* ────────────────────────────────────────────────────────────────────────── */

/**
 * The hero's product shot, drawn rather than screenshotted.
 *
 * A real screenshot would need a seeded facility, would go stale on the next UI
 * change, and would ship a PNG the size of the rest of the page. This is markup,
 * so it restyles with the theme and costs nothing to load.
 *
 * `aria-hidden` because every number in it is illustrative. A screen reader
 * announcing "1,248 patients" as if it were this visitor's data would be a lie
 * told in the one place a sighted user can see is a picture.
 */
function ProductShot() {
  return (
    <div aria-hidden="true" className="relative select-none pointer-events-none">
      {/* Console */}
      <div className="rounded-2xl border border-[var(--hairline)] bg-[var(--surface)] shadow-2xl shadow-[var(--ink)]/15 overflow-hidden">
        {/* Window chrome */}
        <div className="flex items-center gap-2 px-4 py-2.5 bg-[var(--ink)] border-b border-white/10">
          <span className="w-2.5 h-2.5 rounded-full bg-white/25" />
          <span className="w-2.5 h-2.5 rounded-full bg-white/25" />
          <span className="w-2.5 h-2.5 rounded-full bg-white/25" />
          <span className="ml-2 text-[11px] font-bold text-[var(--on-ink-muted)] tracking-wide">
            Reception console
          </span>
        </div>

        <div className="p-4 sm:p-5 bg-[var(--surface-sunken)] space-y-3.5">
          {/* Stat tiles */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { k: 'Waiting', v: '18' },
              { k: 'In cabin', v: '4' },
              { k: 'Done today', v: '63' }
            ].map((s) => (
              <div
                key={s.k}
                className="rounded-xl bg-[var(--surface)] border border-[var(--hairline)] px-3 py-3"
              >
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)]">
                  {s.k}
                </p>
                <p className="text-[26px] font-black leading-tight text-[var(--text-color)]">{s.v}</p>
              </div>
            ))}
          </div>

          {/* Now serving + queue */}
          <div className="grid grid-cols-5 gap-3">
            <div className="col-span-2 rounded-xl bg-[var(--brand)] text-[var(--brand-on)] px-3.5 py-3">
              <p className="text-[10px] font-bold uppercase tracking-wider opacity-80">Now serving</p>
              <p className="text-[26px] font-black leading-tight">T-24</p>
              <p className="text-[11px] font-bold opacity-85">Dr. Rao · Cabin 2</p>
            </div>
            <div className="col-span-3 rounded-xl bg-[var(--surface)] border border-[var(--hairline)] p-3 space-y-2.5">
              {[
                { t: 'T-25', n: 'General Medicine', s: 'Waiting' },
                { t: 'T-26', n: 'Pathology lab', s: 'Lab pending' },
                { t: 'T-27', n: 'Pharmacy', s: 'Dispensing' },
                { t: 'T-28', n: 'Paediatrics', s: 'Waiting' }
              ].map((r) => (
                <div key={r.t} className="flex items-center gap-2.5">
                  <span className="text-[11px] font-black text-[var(--text-color)] w-9 shrink-0">{r.t}</span>
                  <span className="text-[11px] font-medium text-[var(--text-secondary)] truncate flex-1">
                    {r.n}
                  </span>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[var(--brand-soft)] text-[var(--brand-strong)] shrink-0">
                    {r.s}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Department load */}
          <div className="rounded-xl bg-[var(--surface)] border border-[var(--hairline)] p-3.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-secondary)] mb-2.5">
              Department load
            </p>
            <div className="space-y-2">
              {[
                { d: 'General Medicine', w: '78%' },
                { d: 'Paediatrics', w: '46%' },
                { d: 'Orthopaedics', w: '24%' },
                { d: 'Pathology lab', w: '61%' }
              ].map((b) => (
                <div key={b.d} className="flex items-center gap-2.5">
                  <span className="text-[10px] font-bold text-[var(--text-secondary)] w-24 shrink-0 truncate">
                    {b.d}
                  </span>
                  <span className="h-1.5 flex-1 rounded-full bg-[var(--brand-soft)] overflow-hidden">
                    <span className="block h-full rounded-full bg-[var(--brand)]" style={{ width: b.w }} />
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Live footer — the detail that says "this updates itself". */}
          <div className="flex items-center gap-2 px-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand)] animate-pulse" />
            <span className="text-[10px] font-bold text-[var(--text-secondary)]">
              Live — every desk sees this the moment it changes
            </span>
          </div>
        </div>
      </div>

      {/* Patient's phone, overlapping the console */}
      <div className="hidden sm:block absolute -bottom-8 -right-3 lg:-right-8 w-[188px] rounded-[1.6rem] border-[5px] border-[var(--ink)] bg-[var(--ink)] shadow-2xl shadow-[var(--ink)]/30">
        <div className="rounded-[1.2rem] overflow-hidden bg-[var(--surface)]">
          <div className="bg-[var(--brand)] text-[var(--brand-on)] px-3 py-2">
            <p className="text-[10px] font-black leading-tight">City Care Hospital</p>
            <p className="text-[8px] font-bold opacity-80">on WhatsApp</p>
          </div>
          <div className="p-2.5 space-y-1.5 bg-[var(--surface-sunken)]">
            <p className="ml-auto w-fit max-w-[85%] text-[9px] font-semibold px-2 py-1.5 rounded-lg rounded-br-sm bg-[var(--brand)] text-[var(--brand-on)]">
              Bukhar aur sar dard hai
            </p>
            <p className="w-fit max-w-[90%] text-[9px] font-semibold px-2 py-1.5 rounded-lg rounded-bl-sm bg-[var(--surface)] border border-[var(--hairline)] text-[var(--text-color)]">
              General Medicine ke liye book kar rahe hain.
            </p>
            <p className="w-fit max-w-[92%] text-[9px] font-bold px-2 py-1.5 rounded-lg rounded-bl-sm bg-[var(--surface)] border border-[var(--hairline)] text-[var(--text-color)]">
              Token <span className="text-[var(--brand-strong)]">T-27</span> · Dr. Rao
              <br />
              <span className="font-semibold text-[var(--text-secondary)]">Approx. turn in 40 min</span>
            </p>
            <p className="w-fit max-w-[92%] text-[9px] font-semibold px-2 py-1.5 rounded-lg rounded-bl-sm bg-[var(--brand-soft)] text-[var(--brand-strong)]">
              Aapka number aane wala hai — nikal jaiye.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** One department card in the connected-platform diagram. */
function DeptCard({ item, align }) {
  return (
    <div className={`flex gap-3.5 ${align === 'right' ? 'lg:flex-row-reverse lg:text-right' : ''}`}>
      <span className="w-11 h-11 rounded-xl bg-[var(--brand-soft)] text-[var(--brand-strong)] flex items-center justify-center shrink-0 ring-1 ring-[var(--brand-ring)]">
        <Icon name={item.icon} className="text-[22px]" />
      </span>
      <div className="min-w-0">
        <h3 className="text-[15px] font-black text-[var(--text-color)] leading-tight">{item.title}</h3>
        <p className="text-[13px] font-medium text-[var(--text-secondary)] leading-relaxed mt-1">
          {item.body}
        </p>
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
    document.title = 'CareeAi — hospital queues, without the queue';
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <div className="marketing-scope flex-1 w-full overflow-y-auto bg-[var(--bg-color)] text-[var(--text-color)] no-scrollbar">
      {/* ── Navigation ─────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-[var(--border-color)]/40 bg-[var(--bg-color)]/85 backdrop-blur-md">
        <nav
          aria-label="Primary"
          className="max-w-[1180px] mx-auto px-5 sm:px-8 h-16 flex items-center justify-between gap-4"
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
            <span className="leading-none">
              <span className="block text-[17px] font-black tracking-tight text-[var(--text-color)]">
                CareeAi
              </span>
              {/* The tagline is the first thing to go on a narrow phone — the
                  logo and the primary CTA both have to stay on one line. */}
              <span className="hidden sm:block text-[10px] font-bold text-[var(--text-secondary)] tracking-wide">
                Smart hospital queues
              </span>
            </span>
          </Link>

          <div className="hidden lg:flex items-center gap-1">
            {NAV_LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                className="px-3.5 py-2 rounded-lg text-[14px] font-bold text-[var(--text-secondary)] hover:text-[var(--brand-strong)] hover:bg-[var(--brand-soft)] transition-colors duration-200"
              >
                {l.label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-2.5">
            <Link
              to="/login"
              className="hidden sm:inline-flex px-4 py-2.5 rounded-xl border border-[var(--border-color)] text-[14px] font-black text-[var(--text-color)] hover:bg-[var(--card-bg)] transition-colors duration-200"
            >
              Staff sign in
            </Link>
            <Link
              to="/admin"
              className="px-3.5 sm:px-4 py-2.5 rounded-xl bg-[var(--brand)] text-[var(--brand-on)] text-[13px] sm:text-[14px] font-black whitespace-nowrap shadow-lg shadow-[var(--brand-ring)] hover:brightness-110 active:scale-95 transition-all duration-200"
            >
              <span className="sm:hidden">Onboard</span>
              <span className="hidden sm:inline">Onboard a facility</span>
            </Link>
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-expanded={menuOpen}
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              className="lg:hidden w-11 h-11 -mr-2 rounded-xl flex items-center justify-center text-[var(--text-color)] hover:bg-[var(--card-bg)] transition-colors duration-200"
            >
              <Icon name={menuOpen ? 'close' : 'menu'} className="text-[24px]" />
            </button>
          </div>
        </nav>

        {menuOpen && (
          <div className="lg:hidden border-t border-[var(--border-color)]/40 px-5 py-3 space-y-1 bg-[var(--bg-color)]">
            {NAV_LINKS.map((l) => (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setMenuOpen(false)}
                className="block px-3 py-3 rounded-lg text-[15px] font-bold text-[var(--text-color)] hover:bg-[var(--card-bg)] transition-colors duration-200"
              >
                {l.label}
              </a>
            ))}
            <Link
              to="/login"
              onClick={() => setMenuOpen(false)}
              className="block sm:hidden px-3 py-3 rounded-lg text-[15px] font-bold text-[var(--text-color)] hover:bg-[var(--card-bg)] transition-colors duration-200"
            >
              Staff sign in
            </Link>
          </div>
        )}
      </header>

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-[var(--border-color)]/30">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-40 -right-32 w-[34rem] h-[34rem] rounded-full bg-[var(--brand)]/10 blur-3xl"
        />
        <div className="relative max-w-[1180px] mx-auto px-5 sm:px-8 pt-12 pb-20 lg:pt-16 lg:pb-24 grid grid-cols-1 lg:grid-cols-[1fr_1.05fr] gap-12 lg:gap-10 items-center">
          {/* Copy */}
          <div className="space-y-6">
            <span className="animate-fade-in-up inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-[11px] font-black uppercase tracking-widest bg-[var(--brand-soft)] text-[var(--brand-strong)] ring-1 ring-[var(--brand-ring)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand)] animate-pulse" />
              Queue &amp; care platform
            </span>

            <h1 className="animate-fade-in-up delay-100 text-[2.4rem] sm:text-5xl lg:text-[3.4rem] font-black tracking-tight leading-[1.06] text-[var(--text-color)]">
              Nobody should queue
              <br />
              <span className="text-[var(--brand-strong)]">from six in the morning.</span>
            </h1>

            <p className="animate-fade-in-up delay-200 text-[16px] lg:text-[17px] font-medium text-[var(--text-secondary)] leading-relaxed max-w-xl">
              CareeAi gives a hospital or clinic its whole front office — a public page, WhatsApp booking,
              live token queues, and a console for every desk. Patients book in a chat and wait at home.
            </p>

            <ul className="animate-fade-in-up delay-300 space-y-2.5">
              {[
                'Book a token from home, over WhatsApp or chat',
                'Symptoms routed to the right department automatically',
                'Reception, doctor, lab and pharmacy on one record',
                'Every facility isolated from every other'
              ].map((t) => (
                <li key={t} className="flex items-start gap-2.5">
                  <Icon name="check_circle" className="text-[19px] text-[var(--brand)] shrink-0 mt-[1px]" />
                  <span className="text-[14.5px] font-semibold text-[var(--text-color)]">{t}</span>
                </li>
              ))}
            </ul>

            <div className="animate-fade-in-up delay-400 flex flex-wrap gap-3 pt-1">
              <Link
                to="/facilities"
                className="px-6 py-3.5 rounded-xl bg-[var(--brand)] text-[var(--brand-on)] text-[15px] font-black shadow-lg shadow-[var(--brand-ring)] hover:brightness-110 active:scale-95 transition-all duration-200 flex items-center gap-2"
              >
                <Icon name="search" className="text-[20px]" />
                Find your facility
              </Link>
              <Link
                to="/login"
                className="px-6 py-3.5 rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] text-[15px] font-black text-[var(--text-color)] hover:border-[var(--brand)] active:scale-95 transition-all duration-200 flex items-center gap-2"
              >
                <Icon name="login" className="text-[20px]" />
                Staff sign in
              </Link>
            </div>
          </div>

          {/* Product shot */}
          <div className="animate-fade-in-up delay-200 lg:pl-4">
            <ProductShot />
          </div>
        </div>

        {/* Powered-by strip */}
        <div className="relative border-t border-[var(--border-color)]/30 bg-[var(--card-bg)]">
          <div className="max-w-[1180px] mx-auto px-5 sm:px-8 py-4 flex flex-wrap items-center gap-x-8 gap-y-3">
            <span className="text-[11px] font-black uppercase tracking-widest text-[var(--text-secondary)]">
              Built on
            </span>
            {POWERED_BY.map((p) => (
              <span key={p.label} className="flex items-center gap-2">
                <Icon name={p.icon} className="text-[19px] text-[var(--brand)]" />
                <span className="text-[13px] font-bold text-[var(--text-color)]">{p.label}</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── The problem ────────────────────────────────────────────────── */}
      <section className="px-5 sm:px-8 py-14 border-b border-[var(--border-color)]/25">
        <div className="reveal max-w-[1180px] mx-auto grid grid-cols-1 md:grid-cols-3 gap-7">
          {[
            {
              icon: 'schedule',
              t: 'The line starts before the doors open',
              b: 'People travel at dawn and stand for hours because there is no way to know when their turn is.'
            },
            {
              icon: 'help',
              t: 'Nobody knows which doctor they need',
              b: 'A patient with chest pain queues for the wrong department, and reception sorts it out by hand.'
            },
            {
              icon: 'sync_problem',
              t: 'Every desk keeps its own version',
              b: 'The lab, the pharmacy and the counter each hold a piece, and the patient carries paper between them.'
            }
          ].map((p) => (
            <div key={p.t} className="space-y-2">
              <Icon name={p.icon} className="text-[26px] text-rose-500" />
              <h3 className="text-[16px] font-black text-[var(--text-color)]">{p.t}</h3>
              <p className="text-[14px] font-medium text-[var(--text-secondary)] leading-relaxed">{p.b}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── For facilities ─────────────────────────────────────────────── */}
      <section id="facilities" className="px-5 sm:px-8 py-16 lg:py-20 scroll-mt-20">
        <div className="max-w-[1180px] mx-auto">
          <div className="reveal text-center max-w-2xl mx-auto mb-12 space-y-3">
            <span className="text-[11px] uppercase font-black tracking-widest px-3 py-1.5 rounded-full bg-[var(--brand-soft)] text-[var(--brand-strong)]">
              For hospitals &amp; clinics
            </span>
            <h2 className="text-3xl md:text-[2.6rem] font-black leading-tight text-[var(--text-color)]">
              Your whole front office, from one form
            </h2>
            <p className="text-[15px] font-medium text-[var(--text-secondary)] leading-relaxed">
              Register the facility and everything else follows — the public page, the logins, the consoles
              and the billing.
            </p>
          </div>

          <div className="reveal grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {HOSPITAL_VALUE.map((f) => (
              <div
                key={f.title}
                className="card-hover bg-[var(--card-bg)] border border-[var(--border-color)]/50 rounded-2xl p-6 space-y-3.5"
              >
                <span className="w-12 h-12 rounded-xl bg-[var(--brand-soft)] text-[var(--brand-strong)] flex items-center justify-center ring-1 ring-[var(--brand-ring)]">
                  <Icon name={f.icon} className="text-[24px]" />
                </span>
                <h3 className="text-[16.5px] font-black text-[var(--text-color)] leading-tight">{f.title}</h3>
                <p className="text-[14px] font-medium text-[var(--text-secondary)] leading-relaxed">
                  {f.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ───────────────────────────────────────────────── */}
      <section id="how" className="scroll-mt-16 bg-[var(--ink)] text-[var(--on-ink)]">
        <div className="max-w-[1180px] mx-auto px-5 sm:px-8 py-16 lg:py-20">
          <div className="reveal text-center max-w-2xl mx-auto mb-12 space-y-3">
            <h2 className="text-3xl md:text-[2.6rem] font-black leading-tight">
              How it <span className="text-[var(--brand)]">works</span>
            </h2>
            <p className="text-[15px] font-medium text-[var(--on-ink-muted)] leading-relaxed">
              One patient, start to finish. Every step below is a thing the system does on its own.
            </p>
          </div>

          <ol className="reveal grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-8 lg:gap-4">
            {STEPS.map((s, i) => (
              <li key={s.title} className="relative text-center lg:px-2">
                {/* Connector — decorative, and never drawn after the last step. */}
                {i < STEPS.length - 1 && (
                  <span
                    aria-hidden="true"
                    className="hidden lg:block absolute top-7 left-[calc(50%+2.2rem)] right-[calc(-50%+2.2rem)] border-t-2 border-dashed border-white/20"
                  />
                )}
                <span className="relative w-14 h-14 mx-auto rounded-2xl bg-[var(--brand)] text-[var(--brand-on)] flex items-center justify-center shadow-lg shadow-black/30">
                  <Icon name={s.icon} className="text-[26px]" />
                </span>
                <p className="mt-4 text-[11px] font-black uppercase tracking-widest text-[var(--brand)]">
                  Step {i + 1}
                </p>
                <h3 className="mt-1.5 text-[16px] font-black leading-tight">{s.title}</h3>
                <p className="mt-2 text-[13.5px] font-medium text-[var(--on-ink-muted)] leading-relaxed">
                  {s.body}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Connected departments ──────────────────────────────────────── */}
      <section className="px-5 sm:px-8 py-16 lg:py-20">
        <div className="max-w-[1180px] mx-auto">
          <div className="reveal text-center max-w-2xl mx-auto mb-12 space-y-3">
            <h2 className="text-3xl md:text-[2.6rem] font-black leading-tight text-[var(--text-color)]">
              One platform, every desk connected
            </h2>
            <p className="text-[15px] font-medium text-[var(--text-secondary)] leading-relaxed">
              Each console shows the same patient at the same moment. Nobody re-types what the last desk
              already knew.
            </p>
          </div>

          <div className="reveal grid grid-cols-1 lg:grid-cols-[1fr_auto_1fr] gap-10 lg:gap-8 items-center">
            <div className="space-y-8">
              {DEPARTMENTS.left.map((d) => (
                <DeptCard key={d.title} item={d} align="left" />
              ))}
            </div>

            {/* Hub. Decorative: the department names are already in the lists. */}
            <div aria-hidden="true" className="flex justify-center">
              <div className="relative w-44 h-44 lg:w-52 lg:h-52 rounded-full border-2 border-dashed border-[var(--brand-ring)] flex items-center justify-center">
                <span className="absolute inset-4 rounded-full bg-[var(--brand-soft)]" />
                <span className="relative text-center px-4">
                  <Icon name="health_and_safety" className="text-[34px] text-[var(--brand)]" />
                  <span className="block text-[15px] font-black text-[var(--text-color)] leading-tight mt-1">
                    CareeAi
                  </span>
                  <span className="block text-[11px] font-bold text-[var(--text-secondary)]">
                    one shared record
                  </span>
                </span>
              </div>
            </div>

            <div className="space-y-8">
              {DEPARTMENTS.right.map((d) => (
                <DeptCard key={d.title} item={d} align="right" />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── For patients ───────────────────────────────────────────────── */}
      <section
        id="patients"
        className="scroll-mt-16 px-5 sm:px-8 py-16 lg:py-20 bg-[var(--card-bg)] border-y border-[var(--border-color)]/30"
      >
        <div className="max-w-[1180px] mx-auto">
          <div className="reveal text-center max-w-2xl mx-auto mb-12 space-y-3">
            <span className="text-[11px] uppercase font-black tracking-widest px-3 py-1.5 rounded-full bg-[var(--brand-soft)] text-[var(--brand-strong)]">
              For patients
            </span>
            <h2 className="text-3xl md:text-[2.6rem] font-black leading-tight text-[var(--text-color)]">
              Book in a chat. Arrive when it’s your turn.
            </h2>
          </div>

          <div className="reveal grid grid-cols-1 sm:grid-cols-2 gap-5">
            {PATIENT_VALUE.map((f) => (
              <div
                key={f.title}
                className="card-hover bg-[var(--bg-color)] border border-[var(--border-color)]/50 rounded-2xl p-6 flex gap-4"
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

      {/* ── Modules ────────────────────────────────────────────────────── */}
      <section id="modules" className="scroll-mt-16 px-5 sm:px-8 py-16 lg:py-20">
        <div className="reveal max-w-[1180px] mx-auto bg-[var(--card-bg)] border border-[var(--border-color)]/50 rounded-3xl p-7 sm:p-9">
          <h3 className="text-[19px] font-black text-[var(--text-color)]">Switch on only what you run</h3>
          <p className="text-[14.5px] font-medium text-[var(--text-secondary)] mt-2 mb-6 max-w-2xl leading-relaxed">
            Tick a unit and it appears — for your staff and on your public page. Leave it off and nobody is
            asked about it again.
          </p>
          <div className="flex flex-wrap gap-2.5">
            {MODULES.map((m) => (
              <span
                key={m}
                className="px-4 py-2.5 rounded-xl text-[13px] font-bold bg-[var(--bg-color)] border border-[var(--border-color)]/60 text-[var(--text-secondary)]"
              >
                {m}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Close ──────────────────────────────────────────────────────── */}
      <section className="px-5 sm:px-8 pb-20">
        <div className="reveal max-w-[1180px] mx-auto rounded-3xl overflow-hidden bg-gradient-to-br from-[var(--brand)] to-[var(--ink)] text-white">
          <div className="px-8 py-12 lg:px-14 lg:py-14 grid grid-cols-1 lg:grid-cols-[1.1fr_1fr] gap-10 items-center">
            <div>
              <h2 className="text-3xl lg:text-[2.5rem] font-black leading-tight">
                Put your facility on CareeAi
              </h2>
              <p className="text-[15px] font-medium opacity-90 mt-3 max-w-md leading-relaxed">
                Onboard once and hand your team a single sign-in. Everything they need opens behind it.
              </p>
              <div className="flex flex-wrap gap-3 mt-7">
                <Link
                  to="/admin"
                  className="px-6 py-3.5 rounded-xl bg-white text-[var(--brand-strong)] text-[15px] font-black hover:bg-white/90 active:scale-95 transition-all duration-200"
                >
                  Onboard a facility
                </Link>
                <Link
                  to="/login"
                  className="px-6 py-3.5 rounded-xl bg-white/15 border border-white/30 text-[15px] font-black hover:bg-white/25 active:scale-95 transition-all duration-200"
                >
                  Staff sign in
                </Link>
              </div>
            </div>

            {/* What the product is, in numbers we can stand behind. */}
            <dl className="grid grid-cols-2 gap-x-6 gap-y-7">
              {FACTS.map((f) => (
                <div key={f.label}>
                  <dd className="text-[2.4rem] font-black leading-none">{f.value}</dd>
                  <dt className="text-[14px] font-black mt-1.5">{f.label}</dt>
                  <p className="text-[12px] font-medium opacity-75 mt-0.5 leading-snug">{f.sub}</p>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="border-t border-[var(--border-color)]/40 bg-[var(--card-bg)]">
        <div className="max-w-[1180px] mx-auto px-5 sm:px-8 py-10 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div className="flex items-center gap-2.5">
              <span className="w-9 h-9 rounded-xl bg-[var(--brand)] text-[var(--brand-on)] flex items-center justify-center">
                <Icon name="health_and_safety" className="text-[21px]" />
              </span>
              <span className="text-[16px] font-black text-[var(--text-color)]">CareeAi</span>
            </div>
            <div className="flex flex-wrap gap-x-7 gap-y-2">
              {NAV_LINKS.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  className="text-[13px] font-bold text-[var(--text-secondary)] hover:text-[var(--brand-strong)] transition-colors duration-200"
                >
                  {l.label}
                </a>
              ))}
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
