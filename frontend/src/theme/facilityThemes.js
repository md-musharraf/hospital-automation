/**
 * Facility Theme System
 * ---------------------------------------------------------------------------
 * A senior-designer design-token map that gives every facility category its
 * own visual identity — colour mood, gradient, signature icon, ambient
 * pattern, hero imagery and voice. Each healthcare category communicates a
 * different feeling (per the UI/UX Pro Max healthcare colour strategy):
 *
 *   Hospital  → Trust & authority        (deep teal / slate)   — comprehensive
 *   Clinic    → Warmth & personal care   (indigo / violet)     — boutique
 *   Lab       → Precision & science      (electric cyan / navy)— data-driven
 *   Medical   → Freshness & wellness     (green / lime)         — retail care
 *   Govt      → Official & dependable    (royal blue / saffron) — public trust
 *
 * Colours are supplied as raw hex so they can be injected as CSS variables and
 * composed with alpha at the call-site (e.g. `${primary}1a`).
 */

export const FACILITY_THEMES = {
  hospital: {
    key: 'hospital',
    label: 'Hospital',
    kind: 'Multi-Specialty Hospital',
    tagline: 'Comprehensive, connected care — 24/7.',
    icon: 'local_hospital',
    markIcon: 'emergency',
    primary: '#0d9488',      // teal-600
    primaryDark: '#0f766e',  // teal-700
    secondary: '#0f172a',    // slate-900
    accent: '#06b6d4',       // cyan-500
    ring: 'rgba(13, 148, 136, 0.35)',
    tint: 'rgba(13, 148, 136, 0.07)',
    gradient: ['#0d9488', '#0891b2', '#0f172a'],
    pattern: 'cross',
    heroImage: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?q=80&w=1200&auto=format&fit=crop',
    heroKicker: 'Verified Multi-Specialty Partner',
    heroTitle: 'Advanced Care, Zero Waiting Lines',
    heroSub: 'Full-spectrum diagnostics, emergency response and specialist consultations with real-time queue automation.',
    stat: { value: '25+', label: 'Years of Excellence', altValue: '4000+', altLabel: 'Patients Treated' },
  },

  clinic: {
    key: 'clinic',
    label: 'Clinic',
    kind: 'Specialist Clinic',
    tagline: 'Focused, personal specialist care.',
    icon: 'medical_services',
    markIcon: 'stethoscope',
    primary: '#6366f1',      // indigo-500
    primaryDark: '#4f46e5',  // indigo-600
    secondary: '#312e81',    // indigo-900
    accent: '#a855f7',       // purple-500
    ring: 'rgba(99, 102, 241, 0.35)',
    tint: 'rgba(99, 102, 241, 0.07)',
    gradient: ['#6366f1', '#8b5cf6', '#312e81'],
    pattern: 'dots',
    heroImage: 'https://images.unsplash.com/photo-1631217868264-e5b90bb7e133?q=80&w=1200&auto=format&fit=crop',
    heroKicker: 'Focused Specialty Clinic',
    heroTitle: 'Personal Care, Perfectly Timed',
    heroSub: 'Boutique specialist consultations with unhurried attention, warm surroundings and instant token booking.',
    stat: { value: '12+', label: 'Years of Care', altValue: '2000+', altLabel: 'Happy Patients' },
  },

  lab: {
    key: 'lab',
    label: 'Lab',
    kind: 'Diagnostic Laboratory',
    tagline: 'Precision diagnostics you can trust.',
    icon: 'biotech',
    markIcon: 'labs',
    primary: '#0284c7',      // sky-600
    primaryDark: '#0369a1',  // sky-700
    secondary: '#0c4a6e',    // sky-950
    accent: '#22d3ee',       // cyan-400
    ring: 'rgba(2, 132, 199, 0.35)',
    tint: 'rgba(2, 132, 199, 0.07)',
    gradient: ['#0284c7', '#06b6d4', '#0c4a6e'],
    pattern: 'grid',
    heroImage: 'https://images.unsplash.com/photo-1579154204601-01588f351167?q=80&w=1200&auto=format&fit=crop',
    heroKicker: 'Accredited Diagnostics Lab',
    heroTitle: 'Better Diagnostics. Brighter Lives.',
    heroSub: 'Automated sample processing, rapid turnaround and digital reports — with live counter queue tracking.',
    stat: { value: '500+', label: 'Diagnostic Tests', altValue: '3000+', altLabel: 'Screenings Monthly' },
  },

  medical: {
    key: 'medical',
    label: 'Medical Store',
    kind: 'Pharmacy & Wellness',
    tagline: 'Your trusted neighbourhood pharmacy.',
    icon: 'local_pharmacy',
    markIcon: 'pill',
    primary: '#16a34a',      // green-600
    primaryDark: '#15803d',  // green-700
    secondary: '#14532d',    // green-900
    accent: '#84cc16',       // lime-500
    ring: 'rgba(22, 163, 74, 0.35)',
    tint: 'rgba(22, 163, 74, 0.07)',
    gradient: ['#16a34a', '#22c55e', '#14532d'],
    pattern: 'plus',
    heroImage: 'https://images.unsplash.com/photo-1607619056574-7b8d304a3b6f?q=80&w=1200&auto=format&fit=crop',
    heroKicker: 'Licensed Pharmacy Partner',
    heroTitle: 'Wellness, Ready When You Are',
    heroSub: 'Genuine medicines, fast prescription refills and doorstep delivery — skip the counter queue entirely.',
    stat: { value: '8000+', label: 'Products in Stock', altValue: '30 Min', altLabel: 'Avg Delivery' },
  },

  government: {
    key: 'government',
    label: 'Government',
    kind: 'Public Health Facility',
    tagline: 'Accessible public healthcare for all.',
    icon: 'account_balance',
    markIcon: 'health_and_safety',
    primary: '#1d4ed8',      // blue-700
    primaryDark: '#1e40af',  // blue-800
    secondary: '#1e3a8a',    // blue-900
    accent: '#ea580c',       // orange-600 (saffron)
    ring: 'rgba(29, 78, 216, 0.35)',
    tint: 'rgba(29, 78, 216, 0.07)',
    gradient: ['#1d4ed8', '#2563eb', '#1e3a8a'],
    pattern: 'cross',
    heroImage: 'https://images.unsplash.com/photo-1587351021759-3e566b6af7cc?q=80&w=1200&auto=format&fit=crop',
    heroKicker: 'Government-Certified Facility',
    heroTitle: 'Quality Public Care, No Queues',
    heroSub: 'Subsidised, dependable healthcare for every citizen — now with digital tokens and live status updates.',
    stat: { value: 'Free', label: 'Essential Services', altValue: '10K+', altLabel: 'Citizens Served' },
  },
};

/**
 * Resolve a facility "type" string (from the API) to a theme key.
 * Handles "Government Hospital", "Government Lab", "Pharmacy", etc.
 */
export function resolveThemeKey(type) {
  const t = (type || '').toString().toLowerCase();
  if (t.includes('govern')) return 'government';
  if (t.includes('lab')) return 'lab';
  if (t.includes('clinic')) return 'clinic';
  if (t.includes('medical') || t.includes('pharm') || t.includes('store')) return 'medical';
  return 'hospital';
}

/**
 * Get the full theme object for a facility. Optionally overlay the facility's
 * own custom primary/secondary colours (white-labelling) on top of the
 * category defaults so partner branding always wins.
 */
export function getFacilityTheme(type, overrides = {}) {
  const base = FACILITY_THEMES[resolveThemeKey(type)] || FACILITY_THEMES.hospital;
  return {
    ...base,
    primary: overrides.primaryColor || base.primary,
    secondary: overrides.secondaryColor || base.secondary,
  };
}

/**
 * Build the inline CSS-variable style object that themes a subtree. Spread
 * this onto a wrapping element's `style` prop.
 */
export function themeVars(theme) {
  return {
    '--primary-color': theme.primary,
    '--primary-dark': theme.primaryDark,
    '--secondary-color': theme.secondary,
    '--accent-color': theme.accent,
    '--facility-ring': theme.ring,
    '--facility-tint': theme.tint,
    '--grad-from': theme.gradient[0],
    '--grad-via': theme.gradient[1],
    '--grad-to': theme.gradient[2],
  };
}

/** SVG data-URI ambient background patterns keyed by pattern name. */
export function patternDataUri(name, color = '#ffffff', opacity = 0.06) {
  const c = encodeURIComponent(color);
  const patterns = {
    cross: `<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'><g fill='none' stroke='${c}' stroke-width='1.5' opacity='${opacity}'><path d='M20 12v16M12 20h16'/></g></svg>`,
    dots: `<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24'><circle cx='4' cy='4' r='1.5' fill='${c}' opacity='${opacity}'/></svg>`,
    grid: `<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28'><path d='M28 0H0V28' fill='none' stroke='${c}' stroke-width='1' opacity='${opacity}'/></svg>`,
    plus: `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32'><g stroke='${c}' stroke-width='2' opacity='${opacity}'><path d='M16 10v12M10 16h12'/></g></svg>`,
  };
  const svg = patterns[name] || patterns.cross;
  return `url("data:image/svg+xml,${svg.replace(/"/g, "'")}")`;
}
