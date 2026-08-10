import React from 'react';

/**
 * The two halves of a facility's profile that the super-admin panel edits in
 * both the "onboard a new facility" form and the "edit an existing one" modal:
 *
 *   <ModuleGrid />     — WHAT the facility has. A checkbox per unit; ticking one
 *                        reveals exactly the details that unit needs and nothing
 *                        else. The grid is rendered from the catalogue the API
 *                        serves (`GET /super-admin/facility-types`), so adding a
 *                        module on the backend grows this form with no frontend
 *                        change — that is the whole point of not hard-coding the
 *                        units as JSX.
 *
 *   <LandingEditor />  — WHAT the facility shows on its generated public page.
 *                        Every field is optional; the backend template fills the
 *                        gaps, so an admin in a hurry can skip the whole section
 *                        and the facility still gets a complete website.
 *
 * Both are controlled components over plain objects, which is what lets the
 * register form and the edit modal share them without sharing state.
 */

/**
 * Offline mirror of the backend module catalogue (utils/facilityProfile.js).
 * Used only until `GET /super-admin/facility-types` answers — the panel must
 * still render a usable form when that call fails.
 */
export const FALLBACK_MODULES = [
  {
    key: 'opd',
    label: 'OPD / Consultation',
    icon: 'stethoscope',
    group: 'Clinical',
    blurb: 'Outpatient cabins with live token queues.',
    appliesTo: ['Hospital', 'Clinic', 'Government Hospital', 'Government'],
    defaultOn: true,
    fields: [
      { key: 'cabinCount', label: 'Consultation cabins', type: 'number', placeholder: '4' },
      { key: 'openHours', label: 'OPD hours', type: 'text', placeholder: '9:00 AM – 8:00 PM' },
      { key: 'departments', label: 'Departments', type: 'list', placeholder: 'Cardiology, ENT, Dental' }
    ]
  },
  {
    key: 'emergency',
    label: '24×7 Emergency / Casualty',
    icon: 'emergency',
    group: 'Clinical',
    blurb: 'Round-the-clock casualty desk with priority triage.',
    appliesTo: ['Hospital', 'Clinic', 'Government Hospital', 'Government'],
    fields: [
      { key: 'contactNumber', label: 'Emergency number', type: 'tel', placeholder: '+91 98765 43210' },
      { key: 'is24x7', label: 'Open 24×7', type: 'bool' }
    ]
  },
  {
    key: 'ipd',
    label: 'Inpatient (IPD) & Admissions',
    icon: 'bed',
    group: 'Clinical',
    blurb: 'Wards, private rooms and ICU beds.',
    appliesTo: ['Hospital', 'Government Hospital', 'Government'],
    fields: [
      { key: 'bedCount', label: 'Total beds', type: 'number', placeholder: '60' },
      { key: 'icuBeds', label: 'ICU beds', type: 'number', placeholder: '8' }
    ]
  },
  {
    key: 'pharmacy',
    label: 'In-house Pharmacy',
    icon: 'local_pharmacy',
    group: 'Support',
    blurb: 'Dispensing counter wired to doctor prescriptions.',
    appliesTo: ['Hospital', 'Clinic', 'Medical', 'Government Hospital', 'Government'],
    createsAccounts: 'pharmacy',
    fields: [
      { key: 'openHours', label: 'Counter hours', type: 'text', placeholder: '8:00 AM – 10:00 PM' },
      { key: 'homeDelivery', label: 'Home delivery', type: 'bool' }
    ]
  },
  {
    key: 'lab',
    label: 'Pathology Lab',
    icon: 'science',
    group: 'Diagnostics',
    blurb: 'Sample collection, testing and digital reports.',
    appliesTo: ['Hospital', 'Clinic', 'Lab', 'Government Hospital', 'Government Lab', 'Government'],
    createsAccounts: 'lab',
    fields: [
      { key: 'openHours', label: 'Collection hours', type: 'text', placeholder: '7:00 AM – 7:00 PM' },
      { key: 'homeCollection', label: 'Home sample collection', type: 'bool' },
      { key: 'reportTime', label: 'Report turnaround', type: 'text', placeholder: 'Same day' }
    ]
  }
];

export const FALLBACK_TEMPLATES = [
  { key: 'care-classic', label: 'Care Classic', blurb: 'Full multi-specialty hospital site.' },
  { key: 'clinic-warm', label: 'Clinic Warm', blurb: 'Boutique doctor-led clinic.' },
  { key: 'lab-precision', label: 'Lab Precision', blurb: 'Diagnostics-first.' },
  { key: 'pharma-fresh', label: 'Pharma Fresh', blurb: 'Medical store.' },
  { key: 'civic-trust', label: 'Civic Trust', blurb: 'Government facility.' }
];

/** A landing object with every key present, so the inputs stay controlled. */
export const blankLanding = () => ({
  template: 'auto',
  published: true,
  kicker: '',
  headline: '',
  subheadline: '',
  ctaLabel: '',
  heroImage: '',
  about: { title: '', body: '', points: [] },
  highlights: [],
  timings: [],
  departments: [],
  amenities: [],
  accreditations: [],
  languages: [],
  gallery: [],
  faqs: [],
  testimonials: [],
  contact: { email: '', website: '', emergencyNumber: '', mapUrl: '', landmark: '' },
  social: { facebook: '', instagram: '', youtube: '', linkedin: '', x: '' },
  seo: { title: '', description: '' },
  establishedYear: ''
});

/** Merge a facility's stored landing over the blank shape (missing keys and all). */
export const landingFrom = (stored) => {
  const base = blankLanding();
  if (!stored || typeof stored !== 'object') return base;
  return {
    ...base,
    ...stored,
    about: { ...base.about, ...(stored.about || {}) },
    contact: { ...base.contact, ...(stored.contact || {}) },
    social: { ...base.social, ...(stored.social || {}) },
    seo: { ...base.seo, ...(stored.seo || {}) },
    establishedYear: stored.establishedYear || ''
  };
};

/**
 * Starting module state for a facility type: each applicable module present with
 * its default on/off. Existing facilities merge their stored map over this, so a
 * module added after they onboarded shows up switched off rather than missing.
 */
export const modulesFrom = (catalogue, type, stored) => {
  const out = {};
  for (const mod of catalogue) {
    if (!mod.appliesTo.includes(type)) continue;
    const saved = stored && typeof stored === 'object' ? stored[mod.key] : undefined;
    out[mod.key] =
      saved && typeof saved === 'object' ? { enabled: false, ...saved } : { enabled: Boolean(mod.defaultOn) };
  }
  return out;
};

const inputCls =
  'w-full bg-[var(--bg-color)] border border-[var(--border-color)]/60 focus:border-[var(--primary-color)] rounded-lg px-3 py-1.5 outline-none text-xs text-[var(--text-color)] font-semibold transition-all';
const labelCls = 'block mb-1 text-[10px] uppercase font-black tracking-wider text-[var(--text-secondary)]';

function Field({ label, children }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

/** Comma-separated text in, string[] out — the shape the API normalizes. */
function ListInput({ label, value, placeholder, onChange }) {
  return (
    <Field label={label}>
      <input
        type="text"
        className={inputCls}
        placeholder={placeholder}
        value={Array.isArray(value) ? value.join(', ') : value || ''}
        onChange={(e) =>
          onChange(
            e.target.value
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          )
        }
      />
    </Field>
  );
}

/** A collapsible group so the landing editor stays scannable rather than endless. */
function Group({ title, icon, count, children, open = false }) {
  return (
    <details
      open={open}
      className="group bg-[var(--card-bg)] border border-[var(--border-color)]/30 rounded-xl overflow-hidden"
    >
      <summary className="flex items-center gap-2 px-4 py-2.5 cursor-pointer list-none select-none">
        <span className="material-symbols-outlined text-[17px] text-[var(--primary-color)]">{icon}</span>
        <span className="text-[11px] font-black uppercase tracking-wider text-[var(--text-color)]">
          {title}
        </span>
        {count > 0 && (
          <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-[var(--primary-color)]/15 text-[var(--primary-color)]">
            {count}
          </span>
        )}
        <span className="material-symbols-outlined text-[18px] ml-auto text-[var(--text-secondary)] transition-transform group-open:rotate-180">
          expand_more
        </span>
      </summary>
      <div className="px-4 pb-4 pt-1 space-y-3 border-t border-[var(--border-color)]/20">{children}</div>
    </details>
  );
}

/** Add/remove rows of a repeatable landing block (highlights, FAQs, timings…). */
function RepeatList({ rows, onChange, blank, addLabel, render }) {
  return (
    <div className="space-y-2.5">
      {rows.map((row, i) => (
        <div key={i} className="flex items-start gap-2">
          <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-2">
            {render(row, (patch) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r))))}
          </div>
          <button
            type="button"
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
            className="mt-5 shrink-0 w-7 h-7 rounded-lg bg-rose-500/10 text-rose-500 hover:bg-rose-500/20 flex items-center justify-center transition-colors"
            title="Remove"
          >
            <span className="material-symbols-outlined text-[15px]">close</span>
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...rows, blank()])}
        className="px-2.5 py-1 rounded-lg bg-[var(--primary-color)]/10 text-[var(--primary-color)] text-[10px] font-black uppercase tracking-wider hover:bg-[var(--primary-color)]/25 transition-colors"
      >
        + {addLabel}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Module grid                                                         */
/* ------------------------------------------------------------------ */

/**
 * The "what does this facility actually have?" checkbox grid.
 *
 * Only modules the chosen facility type can offer are shown — a dental clinic is
 * never asked about ICU beds, and a medical store never sees a lab bench. When a
 * module implies a login account (lab, pharmacy), the caller is told via
 * `onChange` so the account section below can appear or disappear with it,
 * rather than the admin having to keep two switches in agreement.
 */
export function ModuleGrid({ catalogue, type, value, onChange, idPrefix = 'mod' }) {
  const applicable = catalogue.filter((m) => m.appliesTo.includes(type));
  if (!applicable.length) {
    return (
      <p className="text-[11px] font-semibold text-[var(--text-secondary)]">
        A {type} has no optional units to configure.
      </p>
    );
  }

  const groups = applicable.reduce((acc, m) => {
    (acc[m.group] = acc[m.group] || []).push(m);
    return acc;
  }, {});

  const patch = (key, updates) =>
    onChange({ ...value, [key]: { ...(value[key] || { enabled: false }), ...updates } });

  return (
    <div className="space-y-4">
      {Object.entries(groups).map(([group, mods]) => (
        <div key={group} className="space-y-2">
          <p className="text-[9px] uppercase font-black tracking-widest text-[var(--text-secondary)]">
            {group}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {mods.map((mod) => {
              const state = value[mod.key] || { enabled: false };
              const id = `${idPrefix}-${mod.key}`;
              return (
                <div
                  key={mod.key}
                  className={`rounded-xl border p-3 transition-all ${
                    state.enabled
                      ? 'bg-[var(--primary-color)]/5 border-[var(--primary-color)]/50'
                      : 'bg-[var(--bg-color)] border-[var(--border-color)]/40'
                  }`}
                >
                  <label htmlFor={id} className="flex items-start gap-2.5 cursor-pointer">
                    <input
                      id={id}
                      type="checkbox"
                      checked={Boolean(state.enabled)}
                      onChange={(e) => patch(mod.key, { enabled: e.target.checked })}
                      className="mt-0.5 w-4 h-4 accent-[var(--primary-color)] rounded cursor-pointer shrink-0"
                    />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5">
                        <span
                          className={`material-symbols-outlined text-[17px] ${
                            state.enabled ? 'text-[var(--primary-color)]' : 'text-[var(--text-secondary)]'
                          }`}
                        >
                          {mod.icon}
                        </span>
                        <span className="text-[11px] font-black text-[var(--text-color)]">{mod.label}</span>
                      </span>
                      <span className="block text-[10px] text-[var(--text-secondary)] font-medium leading-snug mt-0.5">
                        {mod.blurb}
                      </span>
                      {mod.createsAccounts && (
                        <span className="inline-block mt-1 text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400">
                          needs a {mod.createsAccounts} login
                        </span>
                      )}
                    </span>
                  </label>

                  {/* Details are asked for only once the unit exists. */}
                  {state.enabled && (mod.fields || []).length > 0 && (
                    <div className="mt-3 pt-3 border-t border-[var(--border-color)]/25 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {mod.fields.map((f) => {
                        const fid = `${id}-${f.key}`;
                        if (f.type === 'bool') {
                          return (
                            <label
                              key={f.key}
                              htmlFor={fid}
                              className="flex items-center gap-2 cursor-pointer"
                            >
                              <input
                                id={fid}
                                type="checkbox"
                                checked={Boolean(state[f.key])}
                                onChange={(e) => patch(mod.key, { [f.key]: e.target.checked })}
                                className="w-3.5 h-3.5 accent-[var(--primary-color)] rounded cursor-pointer"
                              />
                              <span className="text-[10px] font-bold text-[var(--text-color)]">
                                {f.label}
                              </span>
                            </label>
                          );
                        }
                        if (f.type === 'list') {
                          return (
                            <div key={f.key} className="sm:col-span-2">
                              <ListInput
                                label={f.label}
                                placeholder={f.placeholder}
                                value={state[f.key]}
                                onChange={(v) => patch(mod.key, { [f.key]: v })}
                              />
                            </div>
                          );
                        }
                        return (
                          <Field key={f.key} label={f.label}>
                            <input
                              id={fid}
                              type={f.type === 'number' ? 'number' : 'text'}
                              min={f.type === 'number' ? 0 : undefined}
                              placeholder={f.placeholder}
                              value={state[f.key] === undefined ? '' : state[f.key]}
                              onChange={(e) => patch(mod.key, { [f.key]: e.target.value })}
                              className={inputCls}
                            />
                          </Field>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Landing editor                                                      */
/* ------------------------------------------------------------------ */

export function LandingEditor({ value, onChange, templates, facilityName }) {
  const set = (patch) => onChange({ ...value, ...patch });
  const setIn = (key, patch) => onChange({ ...value, [key]: { ...value[key], ...patch } });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="Page template">
          <select
            value={value.template}
            onChange={(e) => set({ template: e.target.value })}
            className={inputCls}
          >
            <option value="auto">Auto — match the facility type</option>
            {templates.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Established year">
          <input
            type="number"
            placeholder="2011"
            value={value.establishedYear}
            onChange={(e) => set({ establishedYear: e.target.value })}
            className={inputCls}
          />
        </Field>
        <div className="flex items-end pb-1.5">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={value.published !== false}
              onChange={(e) => set({ published: e.target.checked })}
              className="w-4 h-4 accent-[var(--primary-color)] rounded cursor-pointer"
            />
            <span className="text-[11px] font-black text-[var(--text-color)]">Landing page live</span>
          </label>
        </div>
      </div>

      <p className="text-[10px] font-semibold text-[var(--text-secondary)] leading-relaxed">
        Everything below is optional — anything left blank is filled from the template, so{' '}
        {facilityName || 'this facility'} gets a complete page either way.
      </p>

      <Group title="Hero" icon="wallpaper" open>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Kicker (small badge)">
            <input
              type="text"
              placeholder="Trusted Multi-Specialty Care"
              value={value.kicker}
              onChange={(e) => set({ kicker: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="Headline">
            <input
              type="text"
              placeholder={facilityName || 'Facility name'}
              value={value.headline}
              onChange={(e) => set({ headline: e.target.value })}
              className={inputCls}
            />
          </Field>
        </div>
        <Field label="Sub-headline">
          <textarea
            rows={2}
            placeholder="One or two lines on what this facility does and for whom."
            value={value.subheadline}
            onChange={(e) => set({ subheadline: e.target.value })}
            className={inputCls}
          />
        </Field>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Primary button label">
            <input
              type="text"
              placeholder="Book Appointment"
              value={value.ctaLabel}
              onChange={(e) => set({ ctaLabel: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="Hero image URL">
            <input
              type="text"
              placeholder="https://…"
              value={value.heroImage}
              onChange={(e) => set({ heroImage: e.target.value })}
              className={inputCls}
            />
          </Field>
        </div>
      </Group>

      <Group title="About" icon="info">
        <Field label="Section title">
          <input
            type="text"
            placeholder="About us"
            value={value.about.title}
            onChange={(e) => setIn('about', { title: e.target.value })}
            className={inputCls}
          />
        </Field>
        <Field label="Body">
          <textarea
            rows={4}
            placeholder="The facility's story, philosophy of care, who it serves…"
            value={value.about.body}
            onChange={(e) => setIn('about', { body: e.target.value })}
            className={inputCls}
          />
        </Field>
        <ListInput
          label="Key points (comma separated)"
          placeholder="Same-day reports, Digital prescriptions, Free follow-up"
          value={value.about.points}
          onChange={(v) => setIn('about', { points: v })}
        />
      </Group>

      <Group title="Highlight stats" icon="query_stats" count={value.highlights.length}>
        <RepeatList
          rows={value.highlights}
          onChange={(rows) => set({ highlights: rows })}
          blank={() => ({ value: '', label: '', icon: 'check_circle' })}
          addLabel="Add stat"
          render={(row, patch) => (
            <>
              <div className="md:col-span-3">
                <Field label="Value">
                  <input
                    type="text"
                    placeholder="25+"
                    value={row.value}
                    onChange={(e) => patch({ value: e.target.value })}
                    className={inputCls}
                  />
                </Field>
              </div>
              <div className="md:col-span-6">
                <Field label="Label">
                  <input
                    type="text"
                    placeholder="Years of Service"
                    value={row.label}
                    onChange={(e) => patch({ label: e.target.value })}
                    className={inputCls}
                  />
                </Field>
              </div>
              <div className="md:col-span-3">
                <Field label="Icon">
                  <input
                    type="text"
                    placeholder="workspace_premium"
                    value={row.icon}
                    onChange={(e) => patch({ icon: e.target.value })}
                    className={inputCls}
                  />
                </Field>
              </div>
            </>
          )}
        />
      </Group>

      <Group title="Opening hours" icon="schedule" count={value.timings.length}>
        <RepeatList
          rows={value.timings}
          onChange={(rows) => set({ timings: rows })}
          blank={() => ({ day: '', hours: '', note: '' })}
          addLabel="Add row"
          render={(row, patch) => (
            <>
              <div className="md:col-span-4">
                <Field label="Day(s)">
                  <input
                    type="text"
                    placeholder="Monday – Saturday"
                    value={row.day}
                    onChange={(e) => patch({ day: e.target.value })}
                    className={inputCls}
                  />
                </Field>
              </div>
              <div className="md:col-span-4">
                <Field label="Hours">
                  <input
                    type="text"
                    placeholder="9:00 AM – 8:00 PM"
                    value={row.hours}
                    onChange={(e) => patch({ hours: e.target.value })}
                    className={inputCls}
                  />
                </Field>
              </div>
              <div className="md:col-span-4">
                <Field label="Note">
                  <input
                    type="text"
                    placeholder="Lunch break 2–3 PM"
                    value={row.note}
                    onChange={(e) => patch({ note: e.target.value })}
                    className={inputCls}
                  />
                </Field>
              </div>
            </>
          )}
        />
      </Group>

      <Group title="Lists shown on the page" icon="checklist">
        <ListInput
          label="Departments (blank = taken from the doctor roster)"
          placeholder="Cardiology, Orthopedics, Pediatrics"
          value={value.departments}
          onChange={(v) => set({ departments: v })}
        />
        <ListInput
          label="Amenities"
          placeholder="Free parking, Wheelchair access, Cafeteria, Lift"
          value={value.amenities}
          onChange={(v) => set({ amenities: v })}
        />
        <ListInput
          label="Accreditations"
          placeholder="NABH, NABL, ISO 9001"
          value={value.accreditations}
          onChange={(v) => set({ accreditations: v })}
        />
        <ListInput
          label="Languages spoken"
          placeholder="Hindi, English, Bhojpuri"
          value={value.languages}
          onChange={(v) => set({ languages: v })}
        />
        <ListInput
          label="Gallery image URLs"
          placeholder="https://img1…, https://img2…"
          value={value.gallery}
          onChange={(v) => set({ gallery: v })}
        />
      </Group>

      <Group title="FAQs" icon="quiz" count={value.faqs.length}>
        <RepeatList
          rows={value.faqs}
          onChange={(rows) => set({ faqs: rows })}
          blank={() => ({ q: '', a: '' })}
          addLabel="Add question"
          render={(row, patch) => (
            <>
              <div className="md:col-span-5">
                <Field label="Question">
                  <input
                    type="text"
                    placeholder="Do I need an appointment?"
                    value={row.q}
                    onChange={(e) => patch({ q: e.target.value })}
                    className={inputCls}
                  />
                </Field>
              </div>
              <div className="md:col-span-7">
                <Field label="Answer">
                  <input
                    type="text"
                    placeholder="No — book a live token on WhatsApp and arrive when it's near."
                    value={row.a}
                    onChange={(e) => patch({ a: e.target.value })}
                    className={inputCls}
                  />
                </Field>
              </div>
            </>
          )}
        />
      </Group>

      <Group title="Patient testimonials" icon="reviews" count={value.testimonials.length}>
        <RepeatList
          rows={value.testimonials}
          onChange={(rows) => set({ testimonials: rows })}
          blank={() => ({ name: '', role: '', text: '', rating: 5 })}
          addLabel="Add testimonial"
          render={(row, patch) => (
            <>
              <div className="md:col-span-3">
                <Field label="Name">
                  <input
                    type="text"
                    value={row.name}
                    onChange={(e) => patch({ name: e.target.value })}
                    className={inputCls}
                  />
                </Field>
              </div>
              <div className="md:col-span-2">
                <Field label="Role">
                  <input
                    type="text"
                    placeholder="Patient"
                    value={row.role}
                    onChange={(e) => patch({ role: e.target.value })}
                    className={inputCls}
                  />
                </Field>
              </div>
              <div className="md:col-span-5">
                <Field label="Quote">
                  <input
                    type="text"
                    value={row.text}
                    onChange={(e) => patch({ text: e.target.value })}
                    className={inputCls}
                  />
                </Field>
              </div>
              <div className="md:col-span-2">
                <Field label="Rating">
                  <select
                    value={row.rating}
                    onChange={(e) => patch({ rating: parseInt(e.target.value, 10) })}
                    className={inputCls}
                  >
                    {[5, 4, 3, 2, 1].map((r) => (
                      <option key={r} value={r}>
                        {r} ★
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </>
          )}
        />
      </Group>

      <Group title="Contact & social" icon="contact_page">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Public email">
            <input
              type="email"
              placeholder="care@facility.in"
              value={value.contact.email}
              onChange={(e) => setIn('contact', { email: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="Website">
            <input
              type="text"
              placeholder="https://…"
              value={value.contact.website}
              onChange={(e) => setIn('contact', { website: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="Emergency number">
            <input
              type="text"
              placeholder="+91 98765 43210"
              value={value.contact.emergencyNumber}
              onChange={(e) => setIn('contact', { emergencyNumber: e.target.value })}
              className={inputCls}
            />
          </Field>
          <Field label="Landmark">
            <input
              type="text"
              placeholder="Opposite the bus stand"
              value={value.contact.landmark}
              onChange={(e) => setIn('contact', { landmark: e.target.value })}
              className={inputCls}
            />
          </Field>
          <div className="md:col-span-2">
            <Field label="Google Maps link (blank = generated from coordinates)">
              <input
                type="text"
                placeholder="https://maps.google.com/…"
                value={value.contact.mapUrl}
                onChange={(e) => setIn('contact', { mapUrl: e.target.value })}
                className={inputCls}
              />
            </Field>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {['facebook', 'instagram', 'youtube', 'linkedin', 'x'].map((net) => (
            <Field key={net} label={net}>
              <input
                type="text"
                placeholder="https://…"
                value={value.social[net]}
                onChange={(e) => setIn('social', { [net]: e.target.value })}
                className={inputCls}
              />
            </Field>
          ))}
        </div>
      </Group>

      <Group title="Search preview (SEO)" icon="travel_explore">
        <Field label="Title">
          <input
            type="text"
            placeholder={facilityName ? `${facilityName} — book online` : 'Page title'}
            value={value.seo.title}
            onChange={(e) => setIn('seo', { title: e.target.value })}
            className={inputCls}
          />
        </Field>
        <Field label="Description">
          <textarea
            rows={2}
            placeholder="Shown under the title in search results and link previews."
            value={value.seo.description}
            onChange={(e) => setIn('seo', { description: e.target.value })}
            className={inputCls}
          />
        </Field>
      </Group>
    </div>
  );
}
