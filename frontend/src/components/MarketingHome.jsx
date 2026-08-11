import React, { useEffect } from 'react';
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
 * is aspirational — if a number or a feature is named, it is shipped.
 */

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

const STEPS = [
  {
    n: '01',
    title: 'Onboard the facility',
    body: 'Type the details once. The public page, the logins and the consoles all come from that one form.'
  },
  {
    n: '02',
    title: 'Patients book themselves',
    body: 'From the facility’s own page or on WhatsApp. Triage picks the department; the least busy doctor gets the token.'
  },
  {
    n: '03',
    title: 'The day runs itself',
    body: 'Reception sees arrivals, the doctor calls next, the lab and pharmacy pick up the same patient — and everyone is told where they are.'
  }
];

export default function MarketingHome() {
  useScrollReveal([]);

  useEffect(() => {
    const previous = document.title;
    document.title = 'CareeAi — hospital queues, without the queue';
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <div className="flex-1 w-full overflow-y-auto bg-[var(--bg-color)] text-[var(--text-color)] no-scrollbar">
      {/* Hero */}
      <section className="relative overflow-hidden px-6 sm:px-10 py-16 md:py-24 border-b border-[var(--border-color)]/25">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-32 -right-24 w-[30rem] h-[30rem] rounded-full bg-[var(--primary-color)]/10 blur-3xl"
        />
        <div className="relative max-w-[1100px] mx-auto text-center space-y-6">
          <span className="animate-fade-in-up inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-[12px] font-black uppercase tracking-widest bg-[var(--primary-color)]/10 text-[var(--primary-color)] border border-[var(--primary-color)]/20">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--primary-color)] animate-pulse" />
            Queue &amp; care platform for clinics and hospitals
          </span>

          <h1 className="animate-fade-in-up delay-100 text-4xl sm:text-5xl md:text-6xl font-black tracking-tight leading-[1.05] text-[var(--text-color)]">
            Nobody should queue
            <br className="hidden sm:inline" />
            <span className="text-[var(--primary-color)]"> from six in the morning.</span>
          </h1>

          <p className="animate-fade-in-up delay-200 text-[16px] md:text-[18px] font-medium text-[var(--text-secondary)] leading-relaxed max-w-2xl mx-auto">
            CareeAi gives a hospital or clinic its whole front office — public page, WhatsApp booking, live
            token queues, and a console for every desk. Patients book in a chat and wait at home.
          </p>

          <div className="animate-fade-in-up delay-300 flex flex-wrap justify-center gap-3 pt-2">
            <Link
              to="/facilities"
              className="px-6 py-3.5 rounded-xl bg-[var(--primary-color)] text-white text-[15px] font-black shadow-lg shadow-[var(--primary-color)]/25 active:scale-95 transition-all flex items-center gap-2"
            >
              <Icon name="search" className="text-[20px]" />
              Find your facility
            </Link>
            <Link
              to="/login"
              className="px-6 py-3.5 rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] text-[15px] font-black text-[var(--text-color)] active:scale-95 transition-all flex items-center gap-2"
            >
              <Icon name="login" className="text-[20px]" />
              Staff sign in
            </Link>
          </div>

          <div className="animate-fade-in-up delay-400 flex flex-wrap justify-center gap-x-7 gap-y-2 pt-4 text-[13px] font-bold text-[var(--text-secondary)]">
            {['No app to install', 'Works over WhatsApp', 'Hindi & English', 'One console per desk'].map(
              (t) => (
                <span key={t} className="flex items-center gap-1.5">
                  <Icon name="check_circle" className="text-[17px] text-[var(--primary-color)]" />
                  {t}
                </span>
              )
            )}
          </div>
        </div>
      </section>

      {/* The problem, named plainly. */}
      <section className="px-6 sm:px-10 py-14 bg-[var(--card-bg)] border-b border-[var(--border-color)]/25">
        <div className="reveal max-w-[1100px] mx-auto grid grid-cols-1 md:grid-cols-3 gap-6">
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

      {/* For hospitals */}
      <section id="hospitals" className="px-6 sm:px-10 py-16">
        <div className="max-w-[1100px] mx-auto">
          <div className="reveal text-center max-w-2xl mx-auto mb-11 space-y-2.5">
            <span className="text-[12px] uppercase font-black tracking-widest px-3 py-1 rounded-full bg-[var(--primary-color)]/10 text-[var(--primary-color)]">
              For hospitals &amp; clinics
            </span>
            <h2 className="text-3xl md:text-4xl font-black text-[var(--text-color)]">
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
                className="card-hover bg-[var(--card-bg)] border border-[var(--border-color)]/40 rounded-2xl p-5 space-y-3"
              >
                <span className="w-11 h-11 rounded-xl bg-[var(--primary-color)]/10 text-[var(--primary-color)] flex items-center justify-center">
                  <Icon name={f.icon} className="text-[23px]" />
                </span>
                <h3 className="text-[16px] font-black text-[var(--text-color)] leading-tight">{f.title}</h3>
                <p className="text-[14px] font-medium text-[var(--text-secondary)] leading-relaxed">
                  {f.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* For patients */}
      <section
        id="patients"
        className="px-6 sm:px-10 py-16 bg-[var(--card-bg)] border-y border-[var(--border-color)]/25"
      >
        <div className="max-w-[1100px] mx-auto">
          <div className="reveal text-center max-w-2xl mx-auto mb-11 space-y-2.5">
            <span className="text-[12px] uppercase font-black tracking-widest px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              For patients
            </span>
            <h2 className="text-3xl md:text-4xl font-black text-[var(--text-color)]">
              Book in a chat. Arrive when it’s your turn.
            </h2>
          </div>

          <div className="reveal grid grid-cols-1 sm:grid-cols-2 gap-5">
            {PATIENT_VALUE.map((f) => (
              <div
                key={f.title}
                className="bg-[var(--bg-color)] border border-[var(--border-color)]/40 rounded-2xl p-5 flex gap-4"
              >
                <span className="w-11 h-11 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                  <Icon name={f.icon} className="text-[23px]" />
                </span>
                <span>
                  <span className="block text-[16px] font-black text-[var(--text-color)] leading-tight">
                    {f.title}
                  </span>
                  <span className="block text-[14px] font-medium text-[var(--text-secondary)] leading-relaxed mt-1.5">
                    {f.body}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="px-6 sm:px-10 py-16">
        <div className="max-w-[1100px] mx-auto">
          <h2 className="reveal text-3xl md:text-4xl font-black text-[var(--text-color)] text-center mb-11">
            How it works
          </h2>
          <div className="reveal grid grid-cols-1 md:grid-cols-3 gap-6">
            {STEPS.map((s) => (
              <div key={s.n} className="space-y-3">
                <span className="w-12 h-12 rounded-2xl bg-[var(--primary-color)] text-white flex items-center justify-center text-[17px] font-black">
                  {s.n}
                </span>
                <h3 className="text-[17px] font-black text-[var(--text-color)]">{s.title}</h3>
                <p className="text-[14px] font-medium text-[var(--text-secondary)] leading-relaxed">
                  {s.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Units a facility can switch on */}
      <section className="px-6 sm:px-10 pb-16">
        <div className="reveal max-w-[1100px] mx-auto bg-[var(--card-bg)] border border-[var(--border-color)]/40 rounded-2xl p-7">
          <h3 className="text-[17px] font-black text-[var(--text-color)]">Switch on only what you run</h3>
          <p className="text-[14px] font-medium text-[var(--text-secondary)] mt-1.5 mb-5">
            Tick a unit and it appears — for your staff and on your public page. Leave it off and nobody is
            asked about it again.
          </p>
          <div className="flex flex-wrap gap-2">
            {[
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
            ].map((m) => (
              <span
                key={m}
                className="px-3.5 py-2 rounded-xl text-[13px] font-bold bg-[var(--bg-color)] border border-[var(--border-color)]/50 text-[var(--text-secondary)]"
              >
                {m}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Close */}
      <section className="px-6 sm:px-10 pb-20">
        <div className="reveal max-w-[1100px] mx-auto rounded-3xl p-10 md:p-14 text-center text-white bg-gradient-to-br from-[var(--primary-color)] to-[var(--secondary-color)]">
          <h2 className="text-3xl md:text-4xl font-black leading-tight">Put your facility on CareeAi</h2>
          <p className="text-[15px] font-medium opacity-90 mt-3 max-w-xl mx-auto leading-relaxed">
            Onboard once and hand your team a single sign-in. Everything they need opens behind it.
          </p>
          <div className="flex flex-wrap justify-center gap-3 mt-7">
            <Link
              to="/admin"
              className="px-6 py-3.5 rounded-xl bg-white text-[var(--primary-color)] text-[15px] font-black active:scale-95 transition-all"
            >
              Onboard a facility
            </Link>
            <Link
              to="/login"
              className="px-6 py-3.5 rounded-xl bg-white/15 border border-white/30 text-[15px] font-black active:scale-95 transition-all"
            >
              Staff sign in
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-[var(--border-color)]/30 py-8 px-6 text-center space-y-2">
        <p className="text-[13px] font-bold text-[var(--text-color)]">CareeAi</p>
        <p className="text-[12px] font-medium text-[var(--text-secondary)] max-w-xl mx-auto">
          Patient information is handled to medical data-protection standards. Facility staff sign in against
          their own facility only.
        </p>
        <p className="text-[12px] text-zinc-400 font-semibold">
          &copy; {new Date().getFullYear()} CareeAi ·{' '}
          <Link to="/facilities" className="hover:underline">
            Partner facilities
          </Link>
        </p>
      </footer>
    </div>
  );
}
