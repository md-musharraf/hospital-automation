import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { BACKEND_URL } from '../App';
import { getFacilityTheme, themeVars, patternDataUri } from '../theme/facilityThemes';
import useScrollReveal from '../hooks/useScrollReveal';
import FacilityBookingBot from './FacilityBookingBot';

/**
 * The generated landing page every partner facility gets.
 *
 * There is ONE template component, not one page per hospital. The backend
 * (`utils/facilityProfile.buildLandingPage`) resolves a facility record into a
 * finished page model — hero copy, services, departments, timings, FAQs — and
 * names the section order for its template; this file renders that model. So
 * "give the new clinic a website" is a registration form, not a deploy, and a
 * design change here lands on all 150 partner sites at once.
 *
 * Every section renders only when it has content, which is what lets a
 * three-doctor dental clinic and a 400-bed government hospital share a layout
 * without either looking padded or truncated.
 */
export default function FacilityLanding() {
  const { hospitalId } = useParams();
  const navigate = useNavigate();
  const [page, setPage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    fetch(`${BACKEND_URL}/api/v1/chat/hospital/${hospitalId}/landing`)
      .then((res) => {
        if (res.status === 404) throw new Error('This facility is not on CareeAi yet.');
        if (!res.ok) throw new Error('Could not load this facility right now.');
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        setPage(data);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [hospitalId]);

  // A partner's page is their front door — it should carry their name in the tab
  // and a real description when it gets shared, not "Vite + React".
  useEffect(() => {
    if (!page) return;
    const previousTitle = document.title;
    document.title = page.seo.title;
    const meta = document.querySelector('meta[name="description"]');
    const previousDesc = meta ? meta.getAttribute('content') : null;
    if (meta) meta.setAttribute('content', page.seo.description);
    return () => {
      document.title = previousTitle;
      if (meta && previousDesc !== null) meta.setAttribute('content', previousDesc);
    };
  }, [page]);

  const theme = useMemo(() => {
    if (!page) return getFacilityTheme('Hospital');
    return getFacilityTheme(page.facility.type, {
      primaryColor: page.facility.primaryColor,
      secondaryColor: page.facility.secondaryColor
    });
  }, [page]);

  useScrollReveal([loading, page && page.facility.id]);

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[var(--bg-color)] space-y-3">
        <span className="material-symbols-outlined text-[44px] text-[var(--primary-color)] animate-spin">
          refresh
        </span>
        <p className="text-sm font-bold text-[var(--text-secondary)]">Loading facility page…</p>
      </div>
    );
  }

  if (error || !page) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[var(--bg-color)] space-y-4 px-6 text-center">
        <span className="material-symbols-outlined text-[44px] text-[var(--text-secondary)]">
          domain_disabled
        </span>
        <p className="text-sm font-black text-[var(--text-color)]">{error || 'Facility unavailable'}</p>
        <button
          onClick={() => navigate('/')}
          className="px-5 py-2.5 rounded-xl bg-[var(--primary-color)] text-white text-xs font-black active:scale-95 transition-all"
        >
          Back to facility directory
        </button>
      </div>
    );
  }

  const { facility, template } = page;
  const bookingHref = `/hospital/${facility.id}`;
  const waHref = facility.whatsappNumber
    ? `https://wa.me/${facility.whatsappNumber.replace(/[^0-9]/g, '')}?text=${encodeURIComponent('Hi')}`
    : '';

  const ctx = { page, theme, bookingHref, waHref, navigate };

  // Note on text colour: every element here that shows body text names its
  // colour explicitly (`text-[var(--text-color)]` / `--text-secondary`) rather
  // than inheriting. Inheriting looks fine until the theme is toggled — the
  // app's global `transition: color` over a var-driven colour does not re-run
  // when only the custom property changes, so an inherit-only heading stays
  // stuck at the previous theme's value and renders near-black on black. Every
  // other portal in this codebase names the colour for the same reason.
  return (
    <div
      style={{ ...themeVars(theme), '--primary-text': '#ffffff' }}
      className="flex-1 w-full overflow-y-auto bg-[var(--bg-color)] text-[var(--text-color)] no-scrollbar"
    >
      <FacilityNav {...ctx} />
      {template.sections.map((name) => {
        const Section = SECTIONS[name];
        return Section ? <Section key={name} {...ctx} /> : null;
      })}
      <FacilityFooter {...ctx} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared building blocks                                              */
/* ------------------------------------------------------------------ */

function SectionShell(props: any) {
  const {
    id = '',
    kicker = '',
    title = '',
    subtitle = '',
    children = null,
    tinted = false,
    className = ''
  } = props;
  return (
    <section
      id={id}
      className={`py-14 px-6 sm:px-10 ${
        tinted ? 'bg-[var(--card-bg)] border-y border-[var(--border-color)]/25' : ''
      } ${className}`}
    >
      <div className="max-w-[1200px] mx-auto">
        {(kicker || title) && (
          <div className="reveal text-center max-w-2xl mx-auto mb-10 space-y-2">
            {kicker && (
              <span className="text-[10px] uppercase font-black tracking-widest px-3 py-1 rounded-full bg-[var(--primary-color)]/10 text-[var(--primary-color)]">
                {kicker}
              </span>
            )}
            {title && <h2 className="text-2xl sm:text-3xl font-black text-[var(--text-color)]">{title}</h2>}
            {subtitle && (
              <p className="text-xs text-[var(--text-secondary)] font-semibold leading-relaxed">{subtitle}</p>
            )}
          </div>
        )}
        {children}
      </div>
    </section>
  );
}

function Icon({
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

/* ------------------------------------------------------------------ */
/* Chrome                                                              */
/* ------------------------------------------------------------------ */

function FacilityNav({ page, theme }) {
  const { facility, template, hero } = page;
  const anchors = [
    { id: 'book', label: 'Book', when: template.sections.includes('booking') },
    { id: 'services', label: 'Services', when: page.services.length },
    { id: 'doctors', label: 'Doctors', when: page.doctors.length && template.sections.includes('doctors') },
    { id: 'timings', label: 'Timings', when: page.timings.length },
    { id: 'contact', label: 'Contact', when: true }
  ].filter((a) => a.when);

  return (
    <header className="sticky top-0 z-40 backdrop-blur-lg bg-[var(--card-bg)]/90 border-b border-[var(--border-color)]/40">
      <div className="max-w-[1200px] mx-auto px-5 sm:px-10 py-3 flex items-center gap-3">
        {/* min-w-0 and NOT shrink-0: a long facility name has to be allowed to
            truncate, or it pushes the booking button off a 375px screen. */}
        <Link to="/" className="flex items-center gap-2.5 min-w-0" title="All CareeAi facilities">
          {facility.logoUrl ? (
            <img
              src={facility.logoUrl}
              alt=""
              className="w-9 h-9 rounded-xl object-cover border border-[var(--border-color)]/40"
            />
          ) : (
            <span
              className="w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0"
              style={{ background: `linear-gradient(135deg, ${theme.primary}, ${theme.accent})` }}
            >
              <Icon name={theme.icon} className="text-[20px]" />
            </span>
          )}
          <span className="min-w-0">
            <span className="block text-sm font-black leading-tight truncate text-[var(--text-color)]">
              {facility.name}
            </span>
            <span className="block text-[10px] font-bold text-[var(--text-secondary)] truncate">
              {theme.kind} · {facility.city}
            </span>
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-1 ml-auto text-xs font-bold text-[var(--text-secondary)]">
          {anchors.map((a) => (
            <a
              key={a.id}
              href={`#${a.id}`}
              className="px-3 py-1.5 rounded-lg hover:text-[var(--primary-color)] hover:bg-[var(--primary-color)]/10 transition-colors"
            >
              {a.label}
            </a>
          ))}
        </nav>

        {/* Scrolls to the assistant on this page rather than navigating away —
            the booking lives here now. */}
        <a
          href="#book"
          className="ml-auto md:ml-2 shrink-0 px-4 py-2 rounded-xl text-white text-xs font-black shadow-md active:scale-95 transition-all"
          style={{ background: theme.primary }}
        >
          {hero.ctaLabel}
        </a>
      </div>
    </header>
  );
}

/** The units a facility runs, named for its own staff to recognise. */
const TEAM_UNITS = {
  staff: { label: 'Reception', icon: 'support_agent' },
  doctors: { label: 'Cabins', icon: 'stethoscope' },
  lab: { label: 'Lab', icon: 'science' },
  pharmacy: { label: 'Pharmacy', icon: 'local_pharmacy' }
};

function FacilityFooter({ page, theme }) {
  const { facility, social } = page;
  const links = [
    { key: 'facebook', icon: 'public', url: social.facebook },
    { key: 'instagram', icon: 'photo_camera', url: social.instagram },
    { key: 'youtube', icon: 'play_circle', url: social.youtube },
    { key: 'linkedin', icon: 'work', url: social.linkedin },
    { key: 'x', icon: 'tag', url: social.x }
  ].filter((l) => l.url);

  // One link, because there is one login. This used to be a row of up to four
  // sign-in buttons — one per role — which was really a list of which of the
  // facility's four passwords you might be holding. The units are still named,
  // as a reminder of what is inside, but they all open the same door. The
  // `?facility=` param means nobody has to find their own employer in a
  // dropdown of every partner on the platform.
  const units = (page.logins || []).map((kind) => TEAM_UNITS[kind]).filter(Boolean);
  const consoleHref = `/login?facility=${encodeURIComponent(facility.id)}`;

  return (
    <footer className="border-t border-[var(--border-color)]/30 bg-[var(--card-bg)] py-10 px-6 sm:px-10">
      <div className="max-w-[1200px] mx-auto space-y-6 text-center">
        {units.length > 0 && (
          <div className="pb-2 space-y-2.5">
            <p className="text-[10px] uppercase font-black tracking-widest text-[var(--text-secondary)]">
              For our team
            </p>
            <Link
              to={consoleHref}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-[12px] font-black border border-[var(--border-color)]/50 text-[var(--text-secondary)] hover:border-[var(--primary-color)]/50 hover:text-[var(--primary-color)] transition-colors"
            >
              <Icon name="login" className="text-[16px]" />
              Staff sign in
            </Link>
            <p className="flex flex-wrap justify-center items-center gap-x-2.5 gap-y-1 text-[11px] font-bold text-[var(--text-secondary)]">
              {units.map((u) => (
                <span key={u.label} className="inline-flex items-center gap-1">
                  <Icon name={u.icon} className="text-[14px]" />
                  {u.label}
                </span>
              ))}
            </p>
          </div>
        )}
        {links.length > 0 && (
          <div className="flex justify-center gap-2">
            {links.map((l) => (
              <a
                key={l.key}
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-full border border-[var(--border-color)]/40 flex items-center justify-center text-[var(--text-secondary)] hover:text-[var(--primary-color)] hover:border-[var(--primary-color)]/50 transition-colors"
                title={l.key}
              >
                <Icon name={l.icon} className="text-[18px]" />
              </a>
            ))}
          </div>
        )}
        {page.accreditations.length > 0 && (
          <div className="flex flex-wrap justify-center gap-1.5">
            {page.accreditations.map((a) => (
              <span
                key={a}
                className="text-[10px] font-black px-2.5 py-1 rounded-full bg-[var(--primary-color)]/10 text-[var(--primary-color)] border border-[var(--primary-color)]/20"
              >
                <Icon name="verified" className="text-[12px] align-middle mr-1" />
                {a}
              </span>
            ))}
          </div>
        )}
        <p className="text-xs font-bold text-[var(--text-color)]">{facility.name}</p>
        <p className="text-[11px] text-[var(--text-secondary)] font-medium max-w-xl mx-auto">
          {facility.address}
          {facility.city ? `, ${facility.city}` : ''}
        </p>
        <p className="text-[10px] text-zinc-400 font-semibold">
          Queue &amp; appointments powered by{' '}
          <Link to="/" className="font-black" style={{ color: theme.primary }}>
            CareeAi
          </Link>{' '}
          · &copy; {new Date().getFullYear()} {facility.name}
        </p>
      </div>
    </footer>
  );
}

/* ------------------------------------------------------------------ */
/* Sections — keyed by the names the backend template emits            */
/* ------------------------------------------------------------------ */

function Hero({ page, theme, waHref }) {
  const { hero, facility, template, contact } = page;
  const centered = template.heroStyle === 'centered';

  const actions = (
    <div className={`flex flex-wrap gap-2.5 ${centered ? 'justify-center' : ''}`}>
      <a
        href="#book"
        className="px-5 py-3 rounded-xl text-white text-xs font-black shadow-lg active:scale-95 transition-all flex items-center gap-1.5"
        style={{ background: theme.primary, boxShadow: `0 10px 30px -12px ${theme.primary}` }}
      >
        <Icon name="confirmation_number" className="text-[18px]" />
        {hero.ctaLabel}
      </a>
      {waHref && (
        <a
          href={waHref}
          target="_blank"
          rel="noopener noreferrer"
          className="px-5 py-3 rounded-xl text-xs font-black border border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 active:scale-95 transition-all flex items-center gap-1.5"
        >
          <Icon name="chat" className="text-[18px]" />
          Book on WhatsApp
        </a>
      )}
      {contact.emergencyNumber && (
        <a
          href={`tel:${contact.emergencyNumber}`}
          className="px-5 py-3 rounded-xl text-xs font-black border border-rose-500/40 bg-rose-500/10 text-rose-600 dark:text-rose-400 active:scale-95 transition-all flex items-center gap-1.5"
        >
          <Icon name="emergency" className="text-[18px]" />
          Emergency
        </a>
      )}
    </div>
  );

  const copy = (
    <div className={`space-y-5 ${centered ? 'text-center max-w-2xl mx-auto' : ''}`}>
      <span
        className="animate-fade-in-up inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest border"
        style={{ background: `${theme.primary}1a`, borderColor: `${theme.primary}33`, color: theme.primary }}
      >
        <span className="w-1.5 h-1.5 rounded-full animate-ping" style={{ background: theme.primary }} />
        {hero.kicker}
      </span>
      <h1 className="animate-fade-in-up delay-100 text-3xl sm:text-4xl md:text-5xl font-black tracking-tight leading-[1.1] text-[var(--text-color)]">
        {hero.headline}
      </h1>
      <p className="animate-fade-in-up delay-200 text-sm text-[var(--text-secondary)] font-medium leading-relaxed max-w-xl">
        {hero.subheadline}
      </p>
      <div className="animate-fade-in-up delay-300">{actions}</div>
      <p
        className={`text-[11px] font-bold text-[var(--text-secondary)] flex items-center gap-1.5 ${
          centered ? 'justify-center' : ''
        }`}
      >
        <Icon name="location_on" className="text-[15px]" style={{ color: theme.primary }} />
        {facility.address}
        {facility.city ? `, ${facility.city}` : ''}
      </p>
    </div>
  );

  return (
    <section
      className="relative overflow-hidden border-b border-[var(--border-color)]/25 py-14 md:py-20 px-6 sm:px-10"
      style={{ backgroundImage: `linear-gradient(to bottom, ${theme.primary}14, transparent 70%)` }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{ backgroundImage: patternDataUri(theme.pattern, theme.primary, 0.08) }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-28 -right-20 w-96 h-96 rounded-full blur-3xl animate-float-slow"
        style={{ background: `${theme.accent}26` }}
      />
      <div className="relative max-w-[1200px] mx-auto">
        {centered ? (
          <div className="space-y-8">
            {copy}
            {hero.image && (
              <img
                src={hero.image}
                alt={facility.name}
                className="w-full max-h-[380px] object-cover rounded-3xl border border-[var(--border-color)]/40 shadow-2xl"
              />
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-7">{copy}</div>
            <div className="lg:col-span-5">
              {hero.image ? (
                <div className="relative">
                  <img
                    src={hero.image}
                    alt={facility.name}
                    className="w-full h-[300px] md:h-[380px] object-cover rounded-3xl border border-[var(--border-color)]/40 shadow-2xl"
                  />
                  <div
                    className="absolute -bottom-4 -left-4 px-4 py-3 rounded-2xl text-white shadow-xl hidden sm:block"
                    style={{ background: theme.secondary }}
                  >
                    <p className="text-[10px] font-bold uppercase tracking-wider opacity-70">Live queue</p>
                    <p className="text-sm font-black">Book before you travel</p>
                  </div>
                </div>
              ) : (
                <div
                  className="w-full h-[280px] rounded-3xl flex items-center justify-center"
                  style={{
                    background: `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[2]})`
                  }}
                >
                  <Icon name={theme.icon} className="text-[92px] text-white/90" />
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function Highlights({ page, theme }) {
  if (!page.highlights.length) return null;
  return (
    <section className="bg-[var(--card-bg)] border-b border-[var(--border-color)]/25 py-8 px-6 sm:px-10">
      <div className="reveal max-w-[1200px] mx-auto grid grid-cols-2 md:grid-cols-4 gap-5 text-center">
        {page.highlights.map((h, i) => (
          <div
            key={i}
            className="p-4 rounded-2xl bg-[var(--bg-color)]/40 border border-[var(--border-color)]/25 flex flex-col items-center gap-1"
          >
            <span
              className="w-10 h-10 rounded-full flex items-center justify-center mb-1"
              style={{ background: `${theme.primary}14`, color: theme.primary }}
            >
              <Icon name={h.icon} className="text-[20px]" />
            </span>
            <p className="text-2xl font-black leading-none text-[var(--text-color)]">{h.value}</p>
            <p className="text-[10px] font-bold text-[var(--text-secondary)]">{h.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * The point of the whole page: book here, now. Placed directly under the hero
 * because a visitor who has to click through to a separate portal before they
 * can do anything is a visitor we have already half lost.
 */
function Booking({ page, theme }) {
  return (
    <SectionShell
      id="book"
      tinted
      kicker="No queue, no phone call"
      title="Book your visit"
      subtitle={`Chat with the assistant or message ${page.facility.name} on WhatsApp — either way you get a live queue token.`}
    >
      <div className="reveal">
        <FacilityBookingBot
          hospitalId={page.facility.id}
          facilityName={page.facility.name}
          theme={theme}
          whatsappNumber={page.facility.whatsappNumber}
        />
      </div>
    </SectionShell>
  );
}

function About({ page, theme }) {
  const { about } = page;
  if (!about.body && !about.points.length) return null;
  return (
    <SectionShell id="about">
      <div className="reveal grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
        <div className="space-y-4">
          <h2 className="text-2xl sm:text-3xl font-black text-[var(--text-color)]">{about.title}</h2>
          {about.body && (
            <p className="text-sm text-[var(--text-secondary)] font-medium leading-relaxed whitespace-pre-line">
              {about.body}
            </p>
          )}
        </div>
        {about.points.length > 0 && (
          <ul className="space-y-2.5">
            {about.points.map((p, i) => (
              <li
                key={i}
                className="flex items-start gap-2.5 p-3.5 rounded-xl bg-[var(--card-bg)] border border-[var(--border-color)]/30"
              >
                <Icon name="check_circle" className="text-[18px] shrink-0" style={{ color: theme.primary }} />
                <span className="text-xs font-bold text-[var(--text-color)] leading-relaxed">{p}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </SectionShell>
  );
}

function Services({ page, theme }) {
  if (!page.services.length) return null;
  return (
    <SectionShell
      id="services"
      kicker="What we offer"
      title="Services & Specialties"
      subtitle={`Care available at ${page.facility.name}.`}
    >
      <div className="reveal grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {page.services.map((s, i) => (
          <div
            key={i}
            className="card-hover bg-[var(--card-bg)] border border-[var(--border-color)]/30 rounded-2xl p-5 space-y-3"
          >
            <span
              className="w-11 h-11 rounded-xl flex items-center justify-center border"
              style={{
                background: `${theme.primary}12`,
                borderColor: `${theme.primary}26`,
                color: theme.primary
              }}
            >
              <Icon name={s.icon} className="text-[22px]" />
            </span>
            <h4 className="font-extrabold text-sm leading-tight">{s.title}</h4>
            {s.description && (
              <p className="text-xs text-[var(--text-secondary)] font-medium leading-relaxed">
                {s.description}
              </p>
            )}
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

function Modules({ page, theme }) {
  if (!page.modules.length) return null;
  return (
    <SectionShell
      id="facilities"
      tinted
      kicker="On campus"
      title="Facilities & Units"
      subtitle="Everything available under one roof — switched on by the facility itself."
    >
      <div className="reveal grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {page.modules.map((m) => (
          <div
            key={m.key}
            className="bg-[var(--bg-color)] border border-[var(--border-color)]/30 rounded-2xl p-4 flex flex-col gap-2"
          >
            <div className="flex items-center gap-2">
              <span
                className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: `${theme.primary}14`, color: theme.primary }}
              >
                <Icon name={m.icon} className="text-[19px]" />
              </span>
              <span className="text-[9px] uppercase font-black tracking-widest text-[var(--text-secondary)]">
                {m.group}
              </span>
            </div>
            <p className="text-xs font-black leading-tight">{m.label}</p>
            <p className="text-[11px] text-[var(--text-secondary)] font-medium leading-snug">{m.detail}</p>
            {m.values && m.values.contactNumber && (
              <a
                href={`tel:${m.values.contactNumber}`}
                className="text-[11px] font-black mt-auto pt-1"
                style={{ color: theme.primary }}
              >
                {m.values.contactNumber}
              </a>
            )}
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

/**
 * Amenities are their own section rather than a footnote under "Facilities &
 * Units", because not every template shows that unit grid — a clinic's page is
 * services-led — and a facility that took the trouble to list its free parking
 * and wheelchair access should never have it silently dropped by the template.
 */
function Amenities({ page, theme }) {
  if (!page.amenities.length) return null;
  return (
    <SectionShell id="amenities" kicker="Comfort" title="Patient Amenities">
      <div className="reveal flex flex-wrap justify-center gap-2">
        {page.amenities.map((a) => (
          <span
            key={a}
            className="text-[11px] font-bold px-3.5 py-2 rounded-full bg-[var(--card-bg)] border border-[var(--border-color)]/40 text-[var(--text-secondary)] flex items-center gap-1.5"
          >
            <Icon name="done" className="text-[15px]" style={{ color: theme.primary }} />
            {a}
          </span>
        ))}
      </div>
    </SectionShell>
  );
}

function Departments({ page, theme, bookingHref }) {
  if (!page.departments.length) return null;
  return (
    <SectionShell id="departments" kicker="Specialties" title="Departments">
      <div className="reveal flex flex-wrap justify-center gap-2.5">
        {page.departments.map((d) => (
          <Link
            key={d}
            to={bookingHref}
            className="px-4 py-2.5 rounded-xl text-xs font-black border transition-all active:scale-95 hover:text-white"
            style={{
              borderColor: `${theme.primary}40`,
              color: theme.primary,
              backgroundColor: `${theme.primary}0d`
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = theme.primary;
              e.currentTarget.style.color = '#fff';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = `${theme.primary}0d`;
              e.currentTarget.style.color = theme.primary;
            }}
          >
            {d}
          </Link>
        ))}
      </div>
    </SectionShell>
  );
}

/**
 * The doctor roster, as profiles rather than a list of names.
 *
 * A patient looking at four consultants and four bare names has been given a
 * directory, not a decision. Qualification, years of practice, the days someone
 * actually sits, the fee and how many people are waiting right now are what let
 * them choose — so every field the facility filled in gets shown, and every one
 * it left blank is quietly omitted rather than rendered as an empty label.
 */
function Doctors({ page, theme }) {
  const [department, setDepartment] = useState('All');
  if (!page.doctors.length) return null;

  const departments = Array.from(new Set(page.doctors.map((d) => d.department).filter(Boolean)));
  const shown = department === 'All' ? page.doctors : page.doctors.filter((d) => d.department === department);

  return (
    <SectionShell
      id="doctors"
      tinted
      kicker="Our team"
      title={page.doctors.length === 1 ? 'Your Doctor' : `Meet our ${page.doctors.length} doctors`}
      subtitle="Pick whoever suits you, or describe your symptoms and let the assistant route you."
    >
      {/* Only worth a filter once there is actually something to filter. */}
      {departments.length > 1 && (
        <div className="reveal flex flex-wrap justify-center gap-1.5 mb-7">
          {(['All', ...departments] as string[]).map((dep: string) => {
            const active = department === dep;
            return (
              <button
                key={dep}
                type="button"
                onClick={() => setDepartment(dep)}
                className="px-3.5 py-1.5 rounded-full text-[11px] font-black border transition-all active:scale-95"
                style={
                  active
                    ? { background: theme.primary, borderColor: theme.primary, color: '#fff' }
                    : {
                        background: `${theme.primary}0d`,
                        borderColor: `${theme.primary}33`,
                        color: theme.primary
                      }
                }
              >
                {dep}
                {dep !== 'All' && (
                  <span className="ml-1 opacity-70">
                    {page.doctors.filter((d) => d.department === dep).length}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      <div className="reveal grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {shown.map((d) => (
          <DoctorCard key={d.id} doctor={d} theme={theme} />
        ))}
      </div>

      <div className="reveal text-center mt-8">
        <a
          href="#book"
          className="inline-flex items-center gap-1.5 px-5 py-3 rounded-xl text-white text-xs font-black shadow-lg active:scale-95 transition-all"
          style={{ background: theme.primary }}
        >
          <Icon name="event_available" className="text-[18px]" />
          Book an appointment
        </a>
      </div>
    </SectionShell>
  );
}

/** Availability rendered as a colour, so it reads before it is read. */
const AVAILABILITY_TONE = {
  Available: { bg: 'rgba(16,185,129,0.12)', fg: '#059669', label: 'Available today' },
  'In Surgery': { bg: 'rgba(245,158,11,0.12)', fg: '#d97706', label: 'In surgery' },
  'On Break': { bg: 'rgba(245,158,11,0.12)', fg: '#d97706', label: 'On a break' },
  Unavailable: { bg: 'rgba(244,63,94,0.12)', fg: '#e11d48', label: 'Not available' }
};

function DoctorCard({ doctor: d, theme }) {
  const tone = AVAILABILITY_TONE[d.availabilityStatus] || AVAILABILITY_TONE.Available;
  const initial = (d.name || 'Dr')
    .replace(/^Dr\.?\s*/i, '')
    .charAt(0)
    .toUpperCase();

  // Waiting count is only meaningful alongside how long each patient takes —
  // "4 waiting" means something different at 5 minutes a head than at 20.
  //
  // The number comes from the server, which is the only side that knows the
  // doctor's sittings. Multiplying it here instead ignored them, so a queue of
  // four for a doctor whose OPD opens at five showed "~40 min" in the afternoon.
  // Falls back to the old arithmetic for a facility on an older API response.
  const waitMinutes =
    typeof d.estimatedWait === 'number'
      ? d.estimatedWait
      : typeof d.waiting === 'number' && d.waiting > 0
        ? d.waiting * (d.averageCheckupTime || 10)
        : 0;

  // Facts worth a line each. Anything the facility left blank simply is not here,
  // rather than showing as an empty row — a half-filled profile should look
  // sparse, not broken.
  const facts = [
    d.experienceYears > 0 && {
      icon: 'workspace_premium',
      text: `${d.experienceYears}+ years of experience`
    },
    d.opdDays.length > 0 && { icon: 'calendar_month', text: d.opdDays.join(' · ') },
    d.opdHours && { icon: 'schedule', text: d.opdHours },
    d.currentRoom && { icon: 'meeting_room', text: d.currentRoom },
    d.languages.length > 0 && { icon: 'translate', text: d.languages.join(', ') },
    d.consultationFee > 0 && { icon: 'payments', text: `₹${d.consultationFee} consultation` },
    d.registrationNumber && { icon: 'verified_user', text: `Reg. ${d.registrationNumber}` }
  ].filter(Boolean);

  return (
    <div className="card-hover bg-[var(--bg-color)] border border-[var(--border-color)]/30 rounded-2xl overflow-hidden flex flex-col">
      <div className="p-5 flex items-start gap-4">
        {d.photoUrl ? (
          <img
            src={d.photoUrl}
            alt={d.name}
            loading="lazy"
            className="w-16 h-16 rounded-2xl object-cover border border-[var(--border-color)]/40 shrink-0"
          />
        ) : (
          <span
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-xl font-black shrink-0"
            style={{ background: `linear-gradient(135deg, ${theme.primary}, ${theme.accent})` }}
          >
            {initial}
          </span>
        )}

        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-black leading-tight text-[var(--text-color)]">{d.name}</p>
          {d.qualification && (
            <p className="text-[11px] font-bold text-[var(--text-secondary)]">{d.qualification}</p>
          )}
          <p className="text-[11px] font-black" style={{ color: theme.primary }}>
            {d.department}
          </p>
          {d.specialization && (
            <p className="text-[11px] text-[var(--text-secondary)] font-medium leading-snug">
              {d.specialization}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            {d.doctorType && (
              <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-[var(--card-bg)] border border-[var(--border-color)]/40 text-[var(--text-secondary)]">
                {d.doctorType}
              </span>
            )}
            <span
              className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded"
              style={{ background: tone.bg, color: tone.fg }}
            >
              {tone.label}
            </span>
          </div>
        </div>
      </div>

      {d.about && (
        <p className="px-5 pb-3 text-[11px] text-[var(--text-secondary)] font-medium leading-relaxed line-clamp-3">
          {d.about}
        </p>
      )}

      {facts.length > 0 && (
        <div className="px-5 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1.5">
          {facts.map((f) => (
            <span key={f.icon} className="flex items-center gap-1.5 min-w-0">
              <Icon name={f.icon} className="text-[15px] shrink-0" style={{ color: theme.primary }} />
              <span className="text-[11px] font-bold text-[var(--text-secondary)] truncate" title={f.text}>
                {f.text}
              </span>
            </span>
          ))}
        </div>
      )}

      <div className="mt-auto px-5 py-3.5 border-t border-[var(--border-color)]/25 flex items-center justify-between gap-3 bg-[var(--card-bg)]/50">
        {typeof d.waiting === 'number' ? (
          <span className="flex items-center gap-1.5 min-w-0">
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: d.waiting > 0 ? '#f59e0b' : '#10b981' }}
            />
            <span className="text-[11px] font-black text-[var(--text-secondary)] truncate">
              {d.waiting === 0 ? 'No queue right now' : `${d.waiting} waiting · ~${waitMinutes} min`}
            </span>
          </span>
        ) : (
          <span className="text-[11px] font-bold text-[var(--text-secondary)]">Live token booking</span>
        )}
        <a
          href="#book"
          className="shrink-0 px-3.5 py-2 rounded-xl text-white text-[11px] font-black active:scale-95 transition-all"
          style={{ background: theme.primary }}
        >
          Book
        </a>
      </div>
    </div>
  );
}

function Packages({ page, theme, bookingHref }) {
  if (!page.packages.length) return null;
  return (
    <SectionShell
      id="packages"
      kicker="Preventive care"
      title="Health Check-up Packages"
      subtitle="Bundled screenings you can book like any other appointment."
    >
      <div className="reveal grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {page.packages.map((p) => (
          <div
            key={p}
            className="card-hover bg-[var(--card-bg)] border rounded-2xl p-5 flex items-center justify-between gap-3"
            style={{ borderColor: `${theme.primary}33` }}
          >
            <div className="flex items-center gap-3 min-w-0">
              <Icon name="clinical_notes" className="text-[22px] shrink-0" style={{ color: theme.primary }} />
              <span className="text-xs font-black truncate">{p}</span>
            </div>
            <Link
              to={bookingHref}
              className="text-[10px] font-black uppercase tracking-wider px-3 py-1.5 rounded-lg shrink-0 text-white"
              style={{ background: theme.primary }}
            >
              Book
            </Link>
          </div>
        ))}
      </div>
    </SectionShell>
  );
}

function Timings({ page, theme }) {
  if (!page.timings.length) return null;
  return (
    <SectionShell id="timings" kicker="Plan your visit" title="Opening Hours">
      <div className="reveal max-w-2xl mx-auto bg-[var(--card-bg)] border border-[var(--border-color)]/30 rounded-2xl overflow-hidden">
        {page.timings.map((t, i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-4 px-5 py-3.5 border-b border-[var(--border-color)]/20 last:border-b-0"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <Icon name="schedule" className="text-[18px] shrink-0" style={{ color: theme.primary }} />
              <span className="text-xs font-black truncate">{t.day}</span>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs font-bold text-[var(--text-color)]">{t.hours}</p>
              {t.note && <p className="text-[10px] text-[var(--text-secondary)] font-semibold">{t.note}</p>}
            </div>
          </div>
        ))}
      </div>
      {page.languages.length > 0 && (
        <p className="reveal text-center text-[11px] font-bold text-[var(--text-secondary)] mt-4">
          <Icon name="translate" className="text-[14px] align-middle mr-1" />
          Staff speak: {page.languages.join(', ')}
        </p>
      )}
    </SectionShell>
  );
}

function Gallery({ page }) {
  if (!page.gallery.length) return null;
  return (
    <SectionShell id="gallery" tinted kicker="Inside" title="A Look Around">
      <div className="reveal grid grid-cols-2 md:grid-cols-3 gap-4">
        {page.gallery.map((src, i) => (
          <img
            key={i}
            src={src}
            alt=""
            loading="lazy"
            className="w-full h-44 md:h-56 object-cover rounded-2xl border border-[var(--border-color)]/30 hover:scale-[1.02] transition-transform duration-300"
          />
        ))}
      </div>
    </SectionShell>
  );
}

function Insurance({ page, theme }) {
  const { insurers, cashless } = page.insurance;
  if (!insurers.length && !cashless) return null;
  return (
    <SectionShell
      id="insurance"
      kicker="Billing"
      title={cashless ? 'Cashless & Insurance Accepted' : 'Insurance Accepted'}
      subtitle={cashless ? 'Cashless admission available for empanelled insurers and schemes.' : undefined}
    >
      <div className="reveal flex flex-wrap justify-center gap-2.5">
        {insurers.map((ins) => (
          <span
            key={ins}
            className="px-4 py-2.5 rounded-xl text-xs font-black bg-[var(--card-bg)] border flex items-center gap-1.5"
            style={{ borderColor: `${theme.primary}33` }}
          >
            <Icon name="health_and_safety" className="text-[16px]" style={{ color: theme.primary }} />
            {ins}
          </span>
        ))}
      </div>
    </SectionShell>
  );
}

function Testimonials({ page, theme }) {
  if (!page.testimonials.length) return null;
  return (
    <SectionShell id="testimonials" tinted kicker="Patient voices" title="What Patients Say">
      <div className="reveal grid grid-cols-1 md:grid-cols-3 gap-5">
        {page.testimonials.map((t, i) => (
          <figure
            key={i}
            className="bg-[var(--bg-color)] border border-[var(--border-color)]/30 rounded-2xl p-5 flex flex-col gap-3"
          >
            <div className="flex gap-0.5" aria-label={`${t.rating} out of 5`}>
              {Array.from({ length: 5 }).map((_, s) => (
                <Icon
                  key={s}
                  name="star"
                  className={`text-[16px] ${s < t.rating ? '' : 'opacity-25'}`}
                  style={{ color: s < t.rating ? '#f59e0b' : 'currentColor' }}
                />
              ))}
            </div>
            <blockquote className="text-xs text-[var(--text-secondary)] font-medium leading-relaxed flex-1">
              “{t.text}”
            </blockquote>
            <figcaption className="flex items-center gap-2.5 pt-2 border-t border-[var(--border-color)]/20">
              <span
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-black"
                style={{ background: theme.primary }}
              >
                {t.name.charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-black truncate">{t.name}</span>
                {t.role && (
                  <span className="block text-[10px] text-[var(--text-secondary)] font-semibold truncate">
                    {t.role}
                  </span>
                )}
              </span>
            </figcaption>
          </figure>
        ))}
      </div>
    </SectionShell>
  );
}

function Faq({ page, theme }) {
  if (!page.faqs.length) return null;
  return (
    <SectionShell id="faq" kicker="Good to know" title="Frequently Asked Questions">
      <div className="reveal max-w-3xl mx-auto space-y-2.5">
        {page.faqs.map((f, i) => (
          <details
            key={i}
            className="group bg-[var(--card-bg)] border border-[var(--border-color)]/30 rounded-2xl px-5 py-4"
          >
            <summary className="flex items-center justify-between gap-3 cursor-pointer list-none">
              <span className="text-xs font-black text-[var(--text-color)]">{f.q}</span>
              <Icon
                name="expand_more"
                className="text-[20px] shrink-0 transition-transform group-open:rotate-180"
                style={{ color: theme.primary }}
              />
            </summary>
            <p className="text-xs text-[var(--text-secondary)] font-medium leading-relaxed mt-3">{f.a}</p>
          </details>
        ))}
      </div>
    </SectionShell>
  );
}

function Contact({ page, theme, bookingHref, waHref }) {
  const { facility, contact } = page;
  const directionsUrl =
    contact.mapUrl ||
    (facility.coordinates && facility.coordinates.lat
      ? `https://www.google.com/maps/search/?api=1&query=${facility.coordinates.lat},${facility.coordinates.lng}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
          `${facility.name} ${facility.address || ''} ${facility.city || ''}`
        )}`);

  const rows = [
    { icon: 'call', label: 'Reception', value: contact.phone, href: `tel:${contact.phone}` },
    {
      icon: 'emergency',
      label: 'Emergency',
      value: contact.emergencyNumber,
      href: `tel:${contact.emergencyNumber}`
    },
    { icon: 'mail', label: 'Email', value: contact.email, href: `mailto:${contact.email}` },
    { icon: 'language', label: 'Website', value: contact.website, href: contact.website, external: true },
    { icon: 'location_on', label: 'Address', value: contact.address },
    { icon: 'signpost', label: 'Landmark', value: contact.landmark }
  ].filter((r) => r.value);

  return (
    <SectionShell id="contact" tinted kicker="Reach us" title="Visit or Get in Touch">
      <div className="reveal grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[var(--bg-color)] border border-[var(--border-color)]/30 rounded-2xl divide-y divide-[var(--border-color)]/20">
          {rows.map((r) => {
            const body = (
              <>
                <span
                  className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: `${theme.primary}14`, color: theme.primary }}
                >
                  <Icon name={r.icon} className="text-[18px]" />
                </span>
                <span className="min-w-0">
                  <span className="block text-[10px] uppercase font-black tracking-wider text-[var(--text-secondary)]">
                    {r.label}
                  </span>
                  <span className="block text-xs font-bold text-[var(--text-color)] break-words">
                    {r.value}
                  </span>
                </span>
              </>
            );
            return r.href ? (
              <a
                key={r.label}
                href={r.href}
                {...(r.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
                className="flex items-center gap-3 px-5 py-4 hover:bg-[var(--card-bg)] transition-colors"
              >
                {body}
              </a>
            ) : (
              <div key={r.label} className="flex items-center gap-3 px-5 py-4">
                {body}
              </div>
            );
          })}
        </div>

        <div
          className="rounded-2xl p-7 text-white flex flex-col justify-center gap-4"
          style={{ background: `linear-gradient(135deg, ${theme.gradient[0]}, ${theme.gradient[2]})` }}
        >
          <h3 className="text-xl font-black leading-tight">Skip the waiting line</h3>
          <p className="text-xs font-medium opacity-90 leading-relaxed">
            Book a live token for {facility.name} and track your turn from your phone. We&apos;ll message you
            when you&apos;re next — wait at home, not in the corridor.
          </p>
          <div className="flex flex-wrap gap-2.5 pt-1">
            <Link
              to={bookingHref}
              className="px-5 py-3 rounded-xl bg-white text-xs font-black active:scale-95 transition-all"
              style={{ color: theme.primaryDark }}
            >
              {page.hero.ctaLabel}
            </Link>
            {waHref && (
              <a
                href={waHref}
                target="_blank"
                rel="noopener noreferrer"
                className="px-5 py-3 rounded-xl bg-white/15 border border-white/30 text-xs font-black active:scale-95 transition-all"
              >
                WhatsApp
              </a>
            )}
            <a
              href={directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-5 py-3 rounded-xl bg-white/15 border border-white/30 text-xs font-black active:scale-95 transition-all"
            >
              Directions
            </a>
          </div>
        </div>
      </div>
    </SectionShell>
  );
}

/** The section vocabulary a backend template may reference. */
const SECTIONS = {
  hero: Hero,
  highlights: Highlights,
  booking: Booking,
  about: About,
  services: Services,
  modules: Modules,
  departments: Departments,
  doctors: Doctors,
  packages: Packages,
  timings: Timings,
  amenities: Amenities,
  gallery: Gallery,
  insurance: Insurance,
  testimonials: Testimonials,
  faq: Faq,
  contact: Contact
};
