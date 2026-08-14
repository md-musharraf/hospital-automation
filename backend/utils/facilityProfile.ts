/**
 * Facility capability modules + the public landing page each facility gets.
 * ---------------------------------------------------------------------------
 * Two jobs live here, and they are deliberately in the same file because they
 * are the same data seen from two sides:
 *
 *   1. MODULE CATALOGUE — what a facility *has*. A dental clinic with no beds
 *      should never be asked how many ICU beds it runs, and a pathology lab has
 *      no OPD cabins. The admin panel renders its checkbox grid straight from
 *      `FACILITY_MODULES`, so adding a unit here (say "Dialysis") makes the
 *      onboarding form, the landing page and the API all learn about it at
 *      once — that is the whole point of keeping it as data, not as JSX.
 *
 *   2. LANDING PAGE — what a facility *shows*. Every partner gets a real
 *      website generated from a template: the same layout, their name, their
 *      photos, their timings, their departments. `buildLandingPage()` fills
 *      every gap from the template + facility type, so a hospital that
 *      registered in 90 seconds and typed nothing optional still gets a
 *      complete, non-embarrassing page.
 *
 * Both `Hospital.modules` and `Hospital.landing` are stored as Mixed on
 * purpose (see the ChatSession.tempData lesson): declared sub-schema paths
 * silently drop keys a later version adds. The normalizers below are the
 * validation layer that replaces schema typing — nothing reaches the database
 * without passing through them.
 */

/** Field kinds the admin panel knows how to render for a module's details. */
export const FIELD = {
  TEXT: 'text',
  NUMBER: 'number',
  TEL: 'tel',
  BOOL: 'bool',
  LIST: 'list' // comma-separated in the UI, string[] on the wire
};

/**
 * Every unit/service a facility can switch on, and the details worth asking for
 * once they do. `appliesTo` is the list of facility types that may offer it —
 * anything else never sees the checkbox.
 *
 * `createsAccounts` names the login account kind this module implies, which is
 * how "has a pharmacy" and "needs a pharmacist login" stay one decision instead
 * of two that can disagree.
 */
/**
 * Which login accounts each facility type needs vs. merely offers. Lives here,
 * next to the modules, because the two answer the same question from opposite
 * ends — a Lab `requires` a lab account precisely because a lab bench is the
 * thing it has. `routes/auth.js` validates registrations against this, and
 * `normalizeModules()` uses it to refuse to switch off the one unit that makes a
 * tenant operable.
 */
export const FACILITY_TYPE_RULES: Record<string, { requires: string[]; offers: string[] }> = {
  Hospital: { requires: ['staff'], offers: ['staff', 'doctors', 'lab', 'pharmacy'] },
  'Government Hospital': { requires: ['staff'], offers: ['staff', 'doctors', 'lab', 'pharmacy'] },
  Clinic: { requires: ['doctors'], offers: ['staff', 'doctors', 'lab', 'pharmacy'] },
  Lab: { requires: ['lab'], offers: ['staff', 'lab'] },
  'Government Lab': { requires: ['lab'], offers: ['staff', 'lab'] },
  Medical: { requires: ['pharmacy'], offers: ['staff', 'pharmacy'] },
  Government: { requires: ['staff'], offers: ['staff', 'doctors', 'lab', 'pharmacy'] }
};

export const FACILITY_MODULES: any[] = [
  {
    key: 'opd',
    label: 'OPD / Doctor Consultation',
    icon: 'stethoscope',
    group: 'Clinical',
    blurb: 'Consultation cabins with live token queues and a doctor console.',
    appliesTo: ['Hospital', 'Clinic', 'Government Hospital', 'Government'],
    defaultOn: true,
    createsAccounts: 'doctors',
    fields: [
      { key: 'cabinCount', label: 'Consultation cabins', type: FIELD.NUMBER, placeholder: '4' },
      { key: 'openHours', label: 'OPD hours', type: FIELD.TEXT, placeholder: '9:00 AM – 8:00 PM' },
      { key: 'departments', label: 'Departments', type: FIELD.LIST, placeholder: 'Cardiology, ENT, Dental' }
    ]
  },
  {
    key: 'staffDesk',
    label: 'Reception / Front Desk',
    icon: 'support_agent',
    group: 'Operations',
    blurb: 'Counter dashboard for walk-ins, billing and queue control.',
    appliesTo: [
      'Hospital',
      'Clinic',
      'Medical',
      'Lab',
      'Government Hospital',
      'Government Lab',
      'Government'
    ],
    defaultOn: true,
    createsAccounts: 'staff',
    fields: [
      { key: 'counterCount', label: 'Counters', type: FIELD.NUMBER, placeholder: '2' },
      { key: 'openHours', label: 'Desk hours', type: FIELD.TEXT, placeholder: '8:00 AM – 9:00 PM' }
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
      { key: 'contactNumber', label: 'Emergency number', type: FIELD.TEL, placeholder: '+91 98765 43210' },
      { key: 'is24x7', label: 'Open 24×7', type: FIELD.BOOL, default: true },
      { key: 'traumaCare', label: 'Trauma / accident care', type: FIELD.BOOL }
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
      { key: 'bedCount', label: 'Total beds', type: FIELD.NUMBER, placeholder: '60' },
      { key: 'icuBeds', label: 'ICU beds', type: FIELD.NUMBER, placeholder: '8' },
      {
        key: 'roomTypes',
        label: 'Room types',
        type: FIELD.LIST,
        placeholder: 'General Ward, Semi-Private, Deluxe'
      }
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
    legacyFlag: 'hasInternalPharmacy',
    fields: [
      { key: 'openHours', label: 'Counter hours', type: FIELD.TEXT, placeholder: '8:00 AM – 10:00 PM' },
      { key: 'homeDelivery', label: 'Home delivery', type: FIELD.BOOL },
      { key: 'is24x7', label: 'Open 24×7', type: FIELD.BOOL }
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
    legacyFlag: 'hasInternalLab',
    fields: [
      { key: 'openHours', label: 'Collection hours', type: FIELD.TEXT, placeholder: '7:00 AM – 7:00 PM' },
      { key: 'homeCollection', label: 'Home sample collection', type: FIELD.BOOL },
      { key: 'reportTime', label: 'Report turnaround', type: FIELD.TEXT, placeholder: 'Same day' },
      {
        key: 'popularTests',
        label: 'Popular tests',
        type: FIELD.LIST,
        placeholder: 'CBC, Lipid Profile, HbA1c'
      }
    ]
  },
  {
    key: 'radiology',
    label: 'Radiology & Imaging',
    icon: 'radiology',
    group: 'Diagnostics',
    blurb: 'X-Ray, ultrasound and advanced scans.',
    appliesTo: ['Hospital', 'Clinic', 'Lab', 'Government Hospital', 'Government Lab', 'Government'],
    fields: [
      {
        key: 'modalities',
        label: 'Machines available',
        type: FIELD.LIST,
        placeholder: 'X-Ray, Ultrasound, CT, MRI, ECG'
      },
      { key: 'openHours', label: 'Imaging hours', type: FIELD.TEXT, placeholder: '9:00 AM – 6:00 PM' }
    ]
  },
  {
    key: 'ambulance',
    label: 'Ambulance Service',
    icon: 'ambulance',
    group: 'Support',
    blurb: 'Own fleet for pickup and inter-facility transfer.',
    appliesTo: ['Hospital', 'Clinic', 'Government Hospital', 'Government'],
    fields: [
      { key: 'contactNumber', label: 'Ambulance number', type: FIELD.TEL, placeholder: '+91 98765 43210' },
      { key: 'vehicleCount', label: 'Vehicles', type: FIELD.NUMBER, placeholder: '2' },
      { key: 'is24x7', label: 'Available 24×7', type: FIELD.BOOL, default: true }
    ]
  },
  {
    key: 'bloodBank',
    label: 'Blood Bank',
    icon: 'bloodtype',
    group: 'Support',
    blurb: 'Licensed storage and issue of blood components.',
    appliesTo: ['Hospital', 'Government Hospital', 'Government'],
    fields: [
      { key: 'contactNumber', label: 'Blood bank number', type: FIELD.TEL, placeholder: '+91 98765 43210' },
      { key: 'licenseNumber', label: 'Licence number', type: FIELD.TEXT, placeholder: 'BB/2024/0001' },
      {
        key: 'components',
        label: 'Components',
        type: FIELD.LIST,
        placeholder: 'Whole Blood, Plasma, Platelets'
      }
    ]
  },
  {
    key: 'physiotherapy',
    label: 'Physiotherapy & Rehab',
    icon: 'accessibility_new',
    group: 'Clinical',
    blurb: 'Rehabilitation sessions and post-op recovery.',
    appliesTo: ['Hospital', 'Clinic', 'Government Hospital', 'Government'],
    fields: [
      { key: 'openHours', label: 'Session hours', type: FIELD.TEXT, placeholder: '10:00 AM – 6:00 PM' },
      {
        key: 'specialities',
        label: 'Focus areas',
        type: FIELD.LIST,
        placeholder: 'Sports injury, Post-op, Neuro rehab'
      }
    ]
  },
  {
    key: 'vaccination',
    label: 'Vaccination / Immunisation',
    icon: 'vaccines',
    group: 'Clinical',
    blurb: 'Child and adult immunisation schedules.',
    appliesTo: ['Hospital', 'Clinic', 'Medical', 'Government Hospital', 'Government'],
    fields: [
      {
        key: 'programmes',
        label: 'Programmes',
        type: FIELD.LIST,
        placeholder: 'Child immunisation, Flu, Hepatitis B'
      },
      {
        key: 'openHours',
        label: 'Vaccination hours',
        type: FIELD.TEXT,
        placeholder: 'Mon–Sat, 10:00 AM – 1:00 PM'
      }
    ]
  },
  {
    key: 'dayCare',
    label: 'Day Care & Minor OT',
    icon: 'healing',
    group: 'Clinical',
    blurb: 'Same-day procedures with short observation.',
    appliesTo: ['Hospital', 'Clinic', 'Government Hospital', 'Government'],
    fields: [
      {
        key: 'procedures',
        label: 'Procedures',
        type: FIELD.LIST,
        placeholder: 'Dressing, Minor surgery, Dialysis'
      },
      { key: 'bedCount', label: 'Day-care beds', type: FIELD.NUMBER, placeholder: '4' }
    ]
  },
  {
    key: 'teleconsult',
    label: 'Tele / Video Consultation',
    icon: 'videocam',
    group: 'Digital',
    blurb: 'Remote consultations for follow-ups.',
    appliesTo: ['Hospital', 'Clinic', 'Government Hospital', 'Government'],
    fields: [
      { key: 'platform', label: 'How patients join', type: FIELD.TEXT, placeholder: 'WhatsApp video call' },
      { key: 'openHours', label: 'Tele-consult hours', type: FIELD.TEXT, placeholder: '6:00 PM – 9:00 PM' }
    ]
  },
  {
    key: 'healthCheckup',
    label: 'Preventive Health Packages',
    icon: 'clinical_notes',
    group: 'Diagnostics',
    blurb: 'Bundled screening packages patients can book.',
    appliesTo: ['Hospital', 'Clinic', 'Lab', 'Government Hospital', 'Government Lab', 'Government'],
    fields: [
      {
        key: 'packages',
        label: 'Packages',
        type: FIELD.LIST,
        placeholder: 'Basic Health Check, Diabetes Care, Full Body'
      }
    ]
  },
  {
    key: 'insurance',
    label: 'Insurance / Cashless (TPA)',
    icon: 'health_and_safety',
    group: 'Billing',
    blurb: 'Empanelled insurers and government schemes.',
    appliesTo: [
      'Hospital',
      'Clinic',
      'Medical',
      'Lab',
      'Government Hospital',
      'Government Lab',
      'Government'
    ],
    fields: [
      {
        key: 'insurers',
        label: 'Empanelled with',
        type: FIELD.LIST,
        placeholder: 'Ayushman Bharat, Star Health, CGHS'
      },
      { key: 'cashless', label: 'Cashless admission', type: FIELD.BOOL }
    ]
  }
];

export const MODULE_BY_KEY: Record<string, any> = FACILITY_MODULES.reduce((acc, m) => {
  acc[m.key] = m;
  return acc;
}, {});

/** The modules a given facility type is allowed to switch on. */
export function modulesForType(type?: string): any[] {
  return FACILITY_MODULES.filter((m) => m.appliesTo.includes(type));
}

/**
 * Landing page templates. A template is a section ORDER plus the default copy
 * used wherever the facility left a field blank — not a different codebase per
 * partner. `auto` resolves from the facility type, which is what makes "every
 * hospital we add gets a landing page" true without anyone choosing anything.
 *
 * Every template lists every section on purpose. Sections render only when they
 * have content, so ordering and emphasis are what actually distinguish a
 * hospital site from a lab site — while a template can never silently swallow
 * something the facility took the trouble to type. (It could before: a clinic
 * that listed its amenities and its empanelled insurers saw neither, because
 * the clinic template simply had no slot for them.)
 */
export const ALL_SECTIONS: string[] = [
  'hero',
  'highlights',
  'booking',
  'about',
  'services',
  'modules',
  'departments',
  'doctors',
  'packages',
  'timings',
  'amenities',
  'gallery',
  'insurance',
  'testimonials',
  'faq',
  'contact'
];

export const LANDING_TEMPLATES: Record<string, any> = {
  'care-classic': {
    key: 'care-classic',
    label: 'Care Classic',
    blurb: 'Full multi-specialty hospital site — departments, doctors, facilities.',
    sections: [
      'hero',
      'highlights',
      'booking',
      'services',
      'modules',
      'departments',
      'doctors',
      'packages',
      'about',
      'timings',
      'amenities',
      'gallery',
      'insurance',
      'testimonials',
      'faq',
      'contact'
    ],
    heroStyle: 'split',
    copy: {
      kicker: 'Trusted Multi-Specialty Care',
      headline: '{name}',
      subheadline:
        'Specialist consultations, diagnostics and 24×7 emergency care in {city} — book your token before you leave home.',
      ctaLabel: 'Book Appointment',
      aboutTitle: 'About {name}'
    }
  },
  'clinic-warm': {
    key: 'clinic-warm',
    label: 'Clinic Warm',
    blurb: 'Boutique single-specialty clinic — personal, doctor-led.',
    sections: [
      'hero',
      'highlights',
      'booking',
      'about',
      'services',
      'doctors',
      'departments',
      'timings',
      'amenities',
      'gallery',
      'packages',
      'testimonials',
      'insurance',
      'modules',
      'faq',
      'contact'
    ],
    heroStyle: 'centered',
    copy: {
      kicker: 'Personal Specialist Care',
      headline: '{name}',
      subheadline:
        'Unhurried consultations in {city}, with a live token so you wait at home instead of in a corridor.',
      ctaLabel: 'Book a Consultation',
      aboutTitle: 'Why patients choose us'
    }
  },
  'lab-precision': {
    key: 'lab-precision',
    label: 'Lab Precision',
    blurb: 'Diagnostics-first — tests, packages, home collection, report turnaround.',
    sections: [
      'hero',
      'highlights',
      'booking',
      'services',
      'packages',
      'modules',
      'about',
      'timings',
      'amenities',
      'insurance',
      'gallery',
      'doctors',
      'departments',
      'testimonials',
      'faq',
      'contact'
    ],
    heroStyle: 'split',
    copy: {
      kicker: 'Accredited Diagnostics',
      headline: '{name}',
      subheadline: 'Accurate reports, fast turnaround and home sample collection across {city}.',
      ctaLabel: 'Book a Test',
      aboutTitle: 'About our laboratory'
    }
  },
  'pharma-fresh': {
    key: 'pharma-fresh',
    label: 'Pharma Fresh',
    blurb: 'Medical store — stock, refills, delivery.',
    sections: [
      'hero',
      'highlights',
      'booking',
      'services',
      'modules',
      'packages',
      'about',
      'timings',
      'amenities',
      'gallery',
      'insurance',
      'testimonials',
      'departments',
      'doctors',
      'faq',
      'contact'
    ],
    heroStyle: 'centered',
    copy: {
      kicker: 'Licensed Pharmacy',
      headline: '{name}',
      subheadline:
        'Genuine medicines and WhatsApp refills in {city} — order ahead and skip the counter queue.',
      ctaLabel: 'Request a Refill',
      aboutTitle: 'About the store'
    }
  },
  'civic-trust': {
    key: 'civic-trust',
    label: 'Civic Trust',
    blurb: 'Government facility — schemes, free services, public notices.',
    sections: [
      'hero',
      'highlights',
      'booking',
      'services',
      'modules',
      'departments',
      'doctors',
      'about',
      'timings',
      'amenities',
      'packages',
      'insurance',
      'gallery',
      'testimonials',
      'faq',
      'contact'
    ],
    heroStyle: 'split',
    copy: {
      kicker: 'Government Health Facility',
      headline: '{name}',
      subheadline: 'Public healthcare in {city} with digital tokens — no need to queue from dawn.',
      ctaLabel: 'Get a Token',
      aboutTitle: 'About this facility'
    }
  }
};

/** Which template a facility type gets when the admin picks "Auto". */
export function templateForType(type?: string): any {
  const t = (type || '').toLowerCase();
  if (t.includes('govern')) return 'civic-trust';
  if (t.includes('lab')) return 'lab-precision';
  if (t === 'medical') return 'pharma-fresh';
  if (t === 'clinic') return 'clinic-warm';
  return 'care-classic';
}

/* ------------------------------------------------------------------ */
/* Normalizers — the validation layer that stands in for schema types  */
/* ------------------------------------------------------------------ */

const str = (v: any, max: number = 400): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const bool = (v: any): boolean => v === true || v === 'true' || v === 'on' || v === 1;
const num = (v: any): number | undefined => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};

/**
 * Only http(s) URLs survive. These strings end up in `src`/`href` on a public
 * page, so a `javascript:` or `data:` value typed into the admin panel would be
 * stored XSS waiting for the first visitor.
 */
export function safeUrl(v: any): string {
  const s = str(v, 600);
  if (!s) return '';
  return /^https?:\/\/[^\s]+$/i.test(s) ? s : '';
}

const strList = (v: any, max: number = 24): string[] => {
  const raw = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : [];
  return raw
    .map((s) => str(s, 120))
    .filter(Boolean)
    .slice(0, max);
};

const urlList = (v: any, max: number = 12): string[] => {
  const raw = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : [];
  return raw.map(safeUrl).filter(Boolean).slice(0, max);
};

/** Days an OPD can sit, in the order a patient reads a week. */
export const OPD_DAYS: string[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Every public profile key, blank — so a doctor with no profile still has the
 *  same shape and the landing page never reads `undefined.length`. */
export const DOCTOR_PROFILE_DEFAULTS: Record<string, any> = {
  photoUrl: '',
  qualification: '',
  registrationNumber: '',
  about: '',
  opdHours: '',
  languages: [],
  opdDays: [],
  experienceYears: 0,
  consultationFee: 0
};

/**
 * The patient-facing half of a doctor record, sanitized.
 *
 * Kept here rather than in the auth route because it guards the same thing the
 * landing normalizers do: `photoUrl` is rendered into an `<img src>` on a public
 * page, so a `javascript:` value pasted into the admin panel would be stored XSS.
 * Returns only the keys that were actually supplied, so callers can spread it
 * over an existing doctor without blanking fields the request never mentioned.
 */
export function normalizeDoctorProfile(input: any): any {
  const d = input && typeof input === 'object' ? input : {};
  const out: Record<string, any> = {};
  if (d.photoUrl !== undefined) out.photoUrl = safeUrl(d.photoUrl);
  if (d.qualification !== undefined) out.qualification = str(d.qualification, 120);
  if (d.registrationNumber !== undefined) out.registrationNumber = str(d.registrationNumber, 60);
  if (d.about !== undefined) out.about = str(d.about, 600);
  if (d.opdHours !== undefined) out.opdHours = str(d.opdHours, 60);
  if (d.languages !== undefined) out.languages = strList(d.languages, 6);
  if (d.opdDays !== undefined) {
    // Keep the week in reading order and drop anything that is not a day, so a
    // profile can never render "Available: Mon, banana".
    const asked = strList(d.opdDays, 7).map((s) => s.slice(0, 3).toLowerCase());
    out.opdDays = OPD_DAYS.filter((day) => asked.includes(day.toLowerCase()));
  }
  if (d.experienceYears !== undefined) {
    const n = num(d.experienceYears);
    // Nobody has practised for 90 years; a typo should not print a lie.
    if (n !== undefined) out.experienceYears = Math.min(70, n);
  }
  if (d.consultationFee !== undefined) {
    const n = num(d.consultationFee);
    if (n !== undefined) out.consultationFee = n;
  }
  return out;
}

/**
 * Coerce whatever the admin panel posted into the stored module map, dropping
 * modules this facility type cannot offer and detail fields the module does not
 * declare. Returns `{ key: { enabled, ...details } }`.
 */
export function normalizeModules(input: any, type?: string): any {
  const allowed = modulesForType(type);
  const source = input && typeof input === 'object' ? input : {};
  // The account kinds this type cannot operate without. A Lab with its lab
  // bench switched off, or a Clinic with no consultation, is a tenant nobody
  // can sign into to do the actual job — so those modules cannot be turned off,
  // whatever the request says. The admin panel shows them locked; this is the
  // half that a hand-written API call cannot get around.
  const required: string[] = ((type && FACILITY_TYPE_RULES[type]) || { requires: [] }).requires;
  const out: Record<string, any> = {};

  for (const mod of allowed) {
    const raw = source[mod.key];
    // Absent key falls back to the module's own default (OPD is on for anything
    // that consults patients) rather than silently switching a unit off.
    const enabled = required.includes(mod.createsAccounts)
      ? true
      : raw === undefined
        ? Boolean(mod.defaultOn)
        : bool(raw && raw.enabled !== undefined ? raw.enabled : raw);
    const entry: Record<string, any> = { enabled };

    if (enabled && raw && typeof raw === 'object') {
      for (const field of mod.fields || []) {
        const value = raw[field.key];
        if (value === undefined || value === null || value === '') continue;
        if (field.type === FIELD.BOOL) entry[field.key] = bool(value);
        else if (field.type === FIELD.NUMBER) {
          const n = num(value);
          if (n !== undefined) entry[field.key] = n;
        } else if (field.type === FIELD.LIST) {
          const list = strList(value);
          if (list.length) entry[field.key] = list;
        } else entry[field.key] = str(value, 200);
      }
    }
    out[mod.key] = entry;
  }
  return out;
}

/**
 * Bridge between the module map and the two boolean columns the rest of the app
 * (queue routing, portals, directory badges) already reads. Whichever side the
 * caller filled in, both end up agreeing.
 */
export function reconcileLegacyFlags(modules: any, body: any): any {
  const flags: Record<string, any> = {};
  for (const mod of FACILITY_MODULES) {
    if (!mod.legacyFlag) continue;
    const fromModule = modules[mod.key] ? modules[mod.key].enabled : undefined;
    const fromBody = body ? body[mod.legacyFlag] : undefined;
    flags[mod.legacyFlag] =
      fromModule !== undefined ? fromModule : fromBody !== undefined ? bool(fromBody) : true;
  }
  return flags;
}

/** Everything the landing page can be given, sanitized and length-capped. */
export function normalizeLanding(input: any): any {
  const l = input && typeof input === 'object' ? input : {};
  const obj = (v: any) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  const arr = (v: any): any[] => (Array.isArray(v) ? v : []);

  const about = obj(l.about);
  const contact = obj(l.contact);
  const social = obj(l.social);
  const seo = obj(l.seo);

  return {
    template: Object.prototype.hasOwnProperty.call(LANDING_TEMPLATES, l.template) ? l.template : 'auto',
    published: l.published === undefined ? true : bool(l.published),
    kicker: str(l.kicker, 80),
    headline: str(l.headline, 120),
    subheadline: str(l.subheadline, 320),
    ctaLabel: str(l.ctaLabel, 40),
    heroImage: safeUrl(l.heroImage),
    about: {
      title: str(about.title, 120),
      body: str(about.body, 1600),
      points: strList(about.points, 8)
    },
    highlights: arr(l.highlights)
      .map((h) => ({
        value: str(h && h.value, 24),
        label: str(h && h.label, 60),
        icon: str(h && h.icon, 40) || 'check_circle'
      }))
      .filter((h) => h.value && h.label)
      .slice(0, 4),
    timings: arr(l.timings)
      .map((t) => ({
        day: str(t && t.day, 40),
        hours: str(t && t.hours, 60),
        note: str(t && t.note, 80)
      }))
      .filter((t) => t.day && t.hours)
      .slice(0, 7),
    departments: strList(l.departments, 20),
    amenities: strList(l.amenities, 16),
    accreditations: strList(l.accreditations, 8),
    faqs: arr(l.faqs)
      .map((f) => ({ q: str(f && f.q, 200), a: str(f && f.a, 800) }))
      .filter((f) => f.q && f.a)
      .slice(0, 10),
    testimonials: arr(l.testimonials)
      .map((t) => ({
        name: str(t && t.name, 60),
        role: str(t && t.role, 60),
        text: str(t && t.text, 500),
        rating: Math.min(5, Math.max(1, num(t && t.rating) || 5))
      }))
      .filter((t) => t.name && t.text)
      .slice(0, 6),
    gallery: urlList(l.gallery),
    contact: {
      email: str(contact.email, 120),
      website: safeUrl(contact.website),
      emergencyNumber: str(contact.emergencyNumber, 40),
      mapUrl: safeUrl(contact.mapUrl),
      landmark: str(contact.landmark, 160)
    },
    social: {
      facebook: safeUrl(social.facebook),
      instagram: safeUrl(social.instagram),
      youtube: safeUrl(social.youtube),
      linkedin: safeUrl(social.linkedin),
      x: safeUrl(social.x)
    },
    seo: {
      title: str(seo.title, 70),
      description: str(seo.description, 180)
    },
    establishedYear: num(l.establishedYear),
    languages: strList(l.languages, 8)
  };
}

/* ------------------------------------------------------------------ */
/* Composition — turning a facility record into a renderable page      */
/* ------------------------------------------------------------------ */

const fill = (template: any, hospital: any) =>
  String(template || '')
    .replace(/\{name\}/g, hospital.name || 'Our Facility')
    .replace(/\{city\}/g, hospital.city || 'your city')
    .replace(/\{type\}/g, hospital.type || 'facility');

/**
 * Default stat strip when the admin supplied none. Drawn from facts the record
 * already knows so it is never invented marketing — beds, doctors, years.
 */
export function defaultHighlights(hospital: any, modules: any, doctorCount?: number): any[] {
  const out: any[] = [];
  const est = hospital.landing && hospital.landing.establishedYear;
  if (est && est > 1800) {
    out.push({
      value: `${Math.max(1, new Date().getFullYear() - est)}+`,
      label: 'Years of Service',
      icon: 'workspace_premium'
    });
  }
  if (typeof doctorCount === 'number' && doctorCount > 0)
    out.push({
      value: `${doctorCount}`,
      label: doctorCount === 1 ? 'Doctor' : 'Doctors',
      icon: 'stethoscope'
    });
  if (modules.ipd && modules.ipd.enabled && modules.ipd.bedCount) {
    out.push({ value: `${modules.ipd.bedCount}`, label: 'Inpatient Beds', icon: 'bed' });
  }
  if (modules.emergency && modules.emergency.enabled) {
    out.push({ value: '24×7', label: 'Emergency Care', icon: 'emergency' });
  }
  if (modules.lab && modules.lab.enabled && modules.lab.reportTime) {
    out.push({ value: modules.lab.reportTime, label: 'Report Turnaround', icon: 'lab_profile' });
  }
  out.push({ value: 'Live', label: 'Queue Tokens', icon: 'confirmation_number' });
  return out.slice(0, 4);
}

/** Mon–Sat / Sunday fallback so the timings block is never blank. */
export function defaultTimings(modules: any): any[] {
  const opd = modules.opd && modules.opd.enabled && modules.opd.openHours;
  const lab = modules.lab && modules.lab.enabled && modules.lab.openHours;
  const hours = opd || lab || '9:00 AM – 8:00 PM';
  return [
    { day: 'Monday – Saturday', hours, note: '' },
    {
      day: 'Sunday',
      hours: modules.emergency && modules.emergency.enabled ? 'Emergency only' : 'Closed',
      note: ''
    }
  ];
}

/**
 * Services shown on the page: the facility's own `customServices` first (an
 * admin who wrote them means them), then one card per enabled module so a
 * facility that only ticked checkboxes still gets a populated services grid.
 */
export function composeServices(hospital: any, modules: any): any[] {
  const custom = (hospital.customServices || [])
    .filter((s: any) => s && s.title)
    .map((s: any) => ({
      title: s.title,
      description: s.description || '',
      icon: s.icon || 'medical_services',
      source: 'custom'
    }));

  const fromModules = FACILITY_MODULES.filter((m) => modules[m.key] && modules[m.key].enabled)
    .filter((m) => !custom.some((c: any) => c.title.toLowerCase() === m.label.toLowerCase()))
    .map((m) => ({
      title: m.label,
      description: describeModule(m, modules[m.key]),
      icon: m.icon,
      source: 'module'
    }));

  return [...custom, ...fromModules];
}

/** Turn a module's stored details into one readable line for its service card. */
export function describeModule(mod: any, entry: any): any {
  const bits: any[] = [];
  for (const field of mod.fields || []) {
    const v = entry[field.key];
    if (v === undefined || v === '' || (Array.isArray(v) && !v.length)) continue;
    if (field.type === FIELD.BOOL) {
      if (v) bits.push(field.label);
    } else if (field.type === FIELD.LIST) {
      bits.push(v.join(', '));
    } else if (field.type === FIELD.NUMBER) {
      bits.push(`${v} ${field.label.toLowerCase()}`);
    } else if (field.type !== FIELD.TEL) {
      bits.push(v);
    }
  }
  return bits.length ? bits.join(' · ') : mod.blurb;
}

/**
 * The renderable landing page for one facility. Everything the page needs is
 * resolved here — template, copy, sections, services, doctors — so the React
 * component is a pure renderer and the same payload can later feed an SSR page,
 * a PDF brochure or a WhatsApp catalogue without re-deriving any of it.
 */
export function buildLandingPage(hospital: any, doctors: any[] = []): any {
  const h = typeof hospital.toObject === 'function' ? hospital.toObject() : hospital || {};
  const landing = normalizeLanding(h.landing);
  const modules = normalizeModules(h.modules || legacyModulesFrom(h), h.type);
  const templateKey = landing.template === 'auto' ? templateForType(h.type) : landing.template;
  const template = LANDING_TEMPLATES[templateKey] || LANDING_TEMPLATES['care-classic'];

  // A strict allow-list, not a blocklist. This payload is served to anyone on
  // the internet, so the safe default is "nothing is public until it is named
  // here" — adding a private field to the Doctor model must never leak it by
  // simply existing. Email in particular stays out: it is a login credential.
  const publicDoctors = (doctors || []).map((d) => ({
    id: String(d._id || d.id || ''),
    name: d.name,
    department: d.department,
    specialization: d.specialization,
    doctorType: d.doctorType,
    availabilityStatus: d.availabilityStatus,
    currentRoom: d.currentRoom,
    // Blank profile for a doctor who has none, then the STORED values run back
    // through the same sanitizer the write path uses. Normalizing on read as
    // well as on write is what stops a row that predates this feature — or one
    // seeded straight into the database — from printing a `javascript:` photo
    // or an opdDays of "banana" onto a public page.
    ...DOCTOR_PROFILE_DEFAULTS,
    ...normalizeDoctorProfile(d),
    averageCheckupTime: d.averageCheckupTime || 10,
    // Attached by the route when it can read the queues — how many people are
    // waiting right now. "3 waiting, ~30 min" is the single most useful thing a
    // patient choosing between four doctors can be told.
    waiting: typeof d.waiting === 'number' ? d.waiting : null
  }));

  const departments = landing.departments.length
    ? landing.departments
    : Array.from(new Set(publicDoctors.map((d) => d.department).filter(Boolean)));

  const emergencyNumber =
    landing.contact.emergencyNumber ||
    (modules.emergency && modules.emergency.enabled && modules.emergency.contactNumber) ||
    '';

  return {
    facility: {
      id: h.id,
      slug: h.slug,
      name: h.name,
      type: h.type,
      clinicSubtype: h.clinicSubtype,
      description: h.description,
      address: h.address,
      city: h.city,
      state: h.state,
      district: h.district,
      phone: h.phone,
      whatsappNumber: h.whatsappNumber,
      coordinates: h.coordinates,
      logoUrl: h.logoUrl,
      coverImage: h.coverImage,
      primaryColor: h.primaryColor,
      secondaryColor: h.secondaryColor,
      parentHospital: h.parentHospital
    },
    template: {
      key: template.key,
      label: template.label,
      sections: template.sections,
      heroStyle: template.heroStyle
    },
    hero: {
      kicker: landing.kicker || template.copy.kicker,
      headline: landing.headline || fill(template.copy.headline, h),
      subheadline: landing.subheadline || fill(template.copy.subheadline, h),
      ctaLabel: landing.ctaLabel || template.copy.ctaLabel,
      image: landing.heroImage || h.heroImage || h.coverImage || ''
    },
    about: {
      title: landing.about.title || fill(template.copy.aboutTitle, h),
      body: landing.about.body || h.description || '',
      points: landing.about.points
    },
    highlights: landing.highlights.length
      ? landing.highlights
      : defaultHighlights({ ...h, landing }, modules, publicDoctors.length || h.doctorCount || 0),
    services: composeServices(h, modules),
    modules: FACILITY_MODULES.filter((m) => modules[m.key] && modules[m.key].enabled).map((m) => ({
      key: m.key,
      label: m.label,
      icon: m.icon,
      group: m.group,
      detail: describeModule(m, modules[m.key]),
      values: modules[m.key]
    })),
    departments,
    doctors: publicDoctors,
    timings: landing.timings.length ? landing.timings : defaultTimings(modules),
    amenities: landing.amenities,
    accreditations: landing.accreditations,
    insurance: {
      insurers: (modules.insurance && modules.insurance.enabled && modules.insurance.insurers) || [],
      cashless: Boolean(modules.insurance && modules.insurance.enabled && modules.insurance.cashless)
    },
    packages:
      (modules.healthCheckup && modules.healthCheckup.enabled && modules.healthCheckup.packages) || [],
    gallery: landing.gallery.length ? landing.gallery : [h.coverImage, h.heroImage].filter(Boolean),
    faqs: landing.faqs,
    testimonials: landing.testimonials,
    contact: {
      ...landing.contact,
      emergencyNumber,
      phone: h.phone,
      whatsappNumber: h.whatsappNumber,
      address: h.address
    },
    social: landing.social,
    seo: {
      title: landing.seo.title || `${h.name} — ${h.type} in ${h.city}`,
      description:
        landing.seo.description || (h.description || fill(template.copy.subheadline, h)).slice(0, 180)
    },
    languages: landing.languages,
    // Which team portals this facility actually runs, so its page can link its
    // own staff and doctors straight to the right login instead of making them
    // hunt through a global nav and then pick their employer from a dropdown.
    // Account KINDS only — never usernames, never counts of who works here.
    logins: accountKindsFor(modules, h.type),
    published: landing.published
  };
}

/**
 * Facilities registered before modules existed only have the two boolean
 * columns. Turn those into a module map so their landing page is populated
 * rather than empty — no migration script, no half-rendered pages.
 */
export function legacyModulesFrom(hospital: any): any {
  const offers: string[] = ((hospital.type && FACILITY_TYPE_RULES[hospital.type]) || { offers: [] }).offers;
  return {
    opd: { enabled: offers.includes('doctors') },
    staffDesk: { enabled: offers.includes('staff') },
    lab: { enabled: hospital.hasInternalLab !== false },
    pharmacy: { enabled: hospital.hasInternalPharmacy !== false }
  };
}

/**
 * The login account kinds a facility's switched-on modules imply — the single
 * answer both the onboarding form (which account sections to show) and the
 * landing page (which staff logins to link to) are asking for.
 */
export function accountKindsFor(modules: any, type?: string): string[] {
  const normalized = modules && Object.keys(modules).length ? modules : {};
  const offers: string[] = ((type && FACILITY_TYPE_RULES[type]) || { offers: [] }).offers;
  const kinds = new Set<string>();
  for (const mod of FACILITY_MODULES) {
    if (!mod.createsAccounts || !offers.includes(mod.createsAccounts)) continue;
    if (normalized[mod.key] && normalized[mod.key].enabled) kinds.add(mod.createsAccounts);
  }
  return Array.from(kinds);
}

/**
 * The cover photo a facility starts with when it uploads none.
 *
 * Registration used to hardcode a single Unsplash ward photo for every tenant,
 * so a medical store and a district hospital opened with the identical picture —
 * on a product that sells each facility its own page. These are still stock
 * images, and the point is only that they are not all the SAME stock image: an
 * administrator who has not uploaded anything yet should still recognise their
 * own kind of place. Uploading a real photo replaces this (see the branding
 * uploader in the profile editor).
 */
export const DEFAULT_COVERS: Record<string, string> = {
  Lab: 'https://images.unsplash.com/photo-1579154204601-01588f351e67?q=80&w=1200&auto=format&fit=crop',
  'Government Lab':
    'https://images.unsplash.com/photo-1579154204601-01588f351e67?q=80&w=1200&auto=format&fit=crop',
  Medical: 'https://images.unsplash.com/photo-1587854692152-cbe660dbde88?q=80&w=1200&auto=format&fit=crop',
  Clinic: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?q=80&w=1200&auto=format&fit=crop',
  Hospital: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?q=80&w=1200&auto=format&fit=crop',
  'Government Hospital':
    'https://images.unsplash.com/photo-1538108149393-fbbd81895907?q=80&w=1200&auto=format&fit=crop',
  Government: 'https://images.unsplash.com/photo-1538108149393-fbbd81895907?q=80&w=1200&auto=format&fit=crop'
};

export const DEFAULT_COVER_FALLBACK: string = DEFAULT_COVERS.Hospital || '';

/** The stock cover for a facility type, never undefined. */
export const defaultCoverFor = (type: string): string => DEFAULT_COVERS[type] || DEFAULT_COVER_FALLBACK;
