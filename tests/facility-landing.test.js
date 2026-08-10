const path = require('path');
const { section, check, report } = require('./helpers/assert');

// The real normalizers and page composer, not a copy — the whole point of these
// checks is to catch the day one of them stops agreeing with the admin panel.
const {
  normalizeModules,
  normalizeLanding,
  reconcileLegacyFlags,
  buildLandingPage,
  templateForType,
  modulesForType,
  LANDING_TEMPLATES,
  ALL_SECTIONS
} = require(path.resolve(__dirname, '..', 'backend', 'utils', 'facilityProfile'));

(async () => {
  section('Facility Modules — what a facility is allowed to have');

  // A dental clinic has no ICU. If the module map ever accepted `ipd` for a
  // Clinic, the admin panel would start asking a two-chair practice how many
  // ICU beds it runs, and the landing page would advertise wards it has not got.
  const clinicModules = normalizeModules(
    { opd: { enabled: true, cabinCount: '3' }, ipd: { enabled: true, bedCount: '40' } },
    'Clinic'
  );
  check('Clinic cannot switch on inpatient wards', clinicModules.ipd === undefined, clinicModules);
  check('Clinic keeps its OPD', clinicModules.opd.enabled === true, clinicModules.opd);
  check('Number fields are coerced from form strings', clinicModules.opd.cabinCount === 3, clinicModules.opd);

  const hospitalModules = normalizeModules({ ipd: { enabled: true, bedCount: '40' } }, 'Hospital');
  check('Hospital CAN switch on inpatient wards', hospitalModules.ipd.enabled === true, hospitalModules.ipd);
  check('Bed count survives on a hospital', hospitalModules.ipd.bedCount === 40, hospitalModules.ipd);

  // A pathology lab is never offered a dispensing counter.
  check(
    'Lab is not offered a pharmacy module',
    !modulesForType('Lab').some((m) => m.key === 'pharmacy'),
    modulesForType('Lab').map((m) => m.key)
  );

  // Field coercion: lists arrive comma-separated from the form, booleans as
  // checkbox values, and anything the module did not declare is dropped rather
  // than stored — the module map is the API's contract, not a junk drawer.
  const labModules = normalizeModules(
    {
      lab: {
        enabled: true,
        homeCollection: 'true',
        popularTests: 'CBC, Lipid Profile , ',
        secretBackdoor: 'nope'
      }
    },
    'Lab'
  );
  check('Checkbox strings become booleans', labModules.lab.homeCollection === true, labModules.lab);
  check(
    'Comma lists become trimmed arrays',
    JSON.stringify(labModules.lab.popularTests) === JSON.stringify(['CBC', 'Lipid Profile']),
    labModules.lab
  );
  check('Undeclared fields are dropped', labModules.lab.secretBackdoor === undefined, labModules.lab);

  // Details for a unit that is switched OFF are not kept — a facility that
  // un-ticks its pharmacy should not still be publishing counter hours for it.
  const offModules = normalizeModules({ pharmacy: { enabled: false, openHours: '9-9' } }, 'Hospital');
  check('Disabled modules keep no details', offModules.pharmacy.openHours === undefined, offModules.pharmacy);

  section('Legacy flags follow the module grid');

  // hasInternalLab / hasInternalPharmacy are read by queue routing, the portals
  // and the directory badges. They must never contradict the checkbox the admin
  // actually ticked, whichever side of the API the request came from.
  const flags = reconcileLegacyFlags(
    normalizeModules({ lab: { enabled: false }, pharmacy: { enabled: true } }, 'Hospital'),
    { hasInternalLab: true, hasInternalPharmacy: false }
  );
  check('Module grid wins over the legacy booleans', flags.hasInternalLab === false, flags);
  check('...in both directions', flags.hasInternalPharmacy === true, flags);

  section('Landing content — sanitization');

  const dirty = normalizeLanding({
    heroImage: 'javascript:alert(1)',
    contact: { website: 'https://good.example/clinic', mapUrl: 'data:text/html,<script>' },
    gallery: ['https://ok.example/a.jpg', 'javascript:void(0)', 'ftp://nope/x.jpg'],
    faqs: [{ q: 'Open on Sunday?', a: 'Emergency only.' }, { q: 'Missing answer' }],
    testimonials: [{ name: 'Asha', text: 'Kind staff', rating: 99 }, { text: 'no name' }],
    highlights: [{ value: '25+', label: 'Years' }, { label: 'no value' }],
    template: 'not-a-real-template'
  });

  // These strings end up in src/href on a public page — a javascript: URL typed
  // into the admin panel would be stored XSS waiting for the first visitor.
  check('javascript: hero image is rejected', dirty.heroImage === '', dirty.heroImage);
  check('data: map URL is rejected', dirty.contact.mapUrl === '', dirty.contact.mapUrl);
  check('https website is kept', dirty.contact.website === 'https://good.example/clinic', dirty.contact);
  check('Gallery keeps only http(s) images', dirty.gallery.length === 1, dirty.gallery);

  check('Half-filled FAQs are dropped', dirty.faqs.length === 1, dirty.faqs);
  check('Nameless testimonials are dropped', dirty.testimonials.length === 1, dirty.testimonials);
  check('Ratings are clamped to 5', dirty.testimonials[0].rating === 5, dirty.testimonials[0]);
  check('Highlights without a value are dropped', dirty.highlights.length === 1, dirty.highlights);
  check('Unknown template falls back to auto', dirty.template === 'auto', dirty.template);

  section('Landing page — a facility that filled in nothing still gets a page');

  // The promise of the feature: onboarding a facility in 90 seconds, typing
  // nothing optional, still produces a complete, non-embarrassing website.
  const bare = buildLandingPage(
    {
      id: 'sunrise-dental',
      name: 'Sunrise Dental Clinic',
      type: 'Clinic',
      city: 'Patna',
      address: 'Boring Road',
      phone: '+919876543210'
    },
    []
  );

  check('Template auto-picked from the facility type', bare.template.key === 'clinic-warm', bare.template);
  check(
    'Headline falls back to the facility name',
    bare.hero.headline === 'Sunrise Dental Clinic',
    bare.hero
  );
  check(
    'Sub-headline is filled with the city',
    bare.hero.subheadline.includes('Patna'),
    bare.hero.subheadline
  );
  check('There is a call-to-action label', Boolean(bare.hero.ctaLabel), bare.hero);
  check('Highlights are never empty', bare.highlights.length > 0, bare.highlights);
  check('Opening hours are never empty', bare.timings.length > 0, bare.timings);
  check('SEO title is composed', bare.seo.title.includes('Sunrise Dental Clinic'), bare.seo);
  check('Every section named by the template can render', bare.template.sections.length > 0, bare.template);

  section('Landing page — modules drive the content');

  const hospital = {
    id: 'city-general',
    name: 'City General Hospital',
    type: 'Hospital',
    city: 'Patna',
    address: 'Station Road',
    phone: '+910000000000',
    landing: { establishedYear: 2001 },
    modules: normalizeModules(
      {
        opd: { enabled: true },
        emergency: { enabled: true, contactNumber: '+919999900000', is24x7: true },
        ipd: { enabled: true, bedCount: '120', icuBeds: '12' },
        lab: { enabled: true, reportTime: 'Same day' },
        insurance: { enabled: true, insurers: 'Ayushman Bharat, Star Health', cashless: true },
        healthCheckup: { enabled: true, packages: 'Full Body, Diabetes Care' }
      },
      'Hospital'
    )
  };

  const page = buildLandingPage(hospital, [
    { _id: 'd1', name: 'Dr. Rao', department: 'Cardiology', passwordHash: 'SECRET-HASH' },
    { _id: 'd2', name: 'Dr. Iqbal', department: 'Orthopedics', passwordHash: 'SECRET-HASH' }
  ]);

  check('Hospital gets the hospital template', page.template.key === 'care-classic', page.template);
  check(
    'Enabled modules become facility cards',
    page.modules.some((m) => m.key === 'ipd') && page.modules.some((m) => m.key === 'emergency'),
    page.modules.map((m) => m.key)
  );
  check(
    'Disabled modules stay off the page',
    !page.modules.some((m) => m.key === 'ambulance'),
    page.modules.map((m) => m.key)
  );
  check(
    'Bed count reaches the stat strip',
    page.highlights.some((h) => h.value === '120'),
    page.highlights
  );
  check(
    'Emergency number surfaces on contact',
    page.contact.emergencyNumber === '+919999900000',
    page.contact
  );
  check(
    'Insurers reach the insurance block',
    page.insurance.insurers.length === 2 && page.insurance.cashless === true,
    page.insurance
  );
  check('Checkup packages are listed', page.packages.length === 2, page.packages);
  check(
    'Departments fall back to the doctor roster',
    page.departments.includes('Cardiology') && page.departments.includes('Orthopedics'),
    page.departments
  );

  // This payload is served to anyone on the internet. A password hash reaching
  // it would be a credential leak on a marketing page.
  check(
    'No credential ever reaches the public page',
    !JSON.stringify(page).includes('SECRET-HASH'),
    Object.keys(page.doctors[0])
  );

  section('Landing page — facilities onboarded before modules existed');

  // No `modules` key at all, just the two old booleans. Their page must still be
  // populated — no migration script, no half-rendered sites.
  const legacy = buildLandingPage(
    {
      id: 'old-lab',
      name: 'Old Town Diagnostics',
      type: 'Lab',
      city: 'Gaya',
      address: 'GB Road',
      hasInternalLab: true,
      hasInternalPharmacy: false
    },
    []
  );
  check('Legacy facility resolves a template', legacy.template.key === 'lab-precision', legacy.template);
  check(
    'Legacy lab flag becomes a lab module',
    legacy.modules.some((m) => m.key === 'lab'),
    legacy.modules.map((m) => m.key)
  );
  check('Legacy services grid is populated', legacy.services.length > 0, legacy.services);

  section('No template silently swallows content the facility typed');

  // Templates differ by ORDER, not by which content they are willing to show.
  // A clinic that listed its amenities and its empanelled insurers used to see
  // neither, because the clinic template simply had no slot for them — content
  // an admin took the trouble to enter vanished with no error anywhere.
  for (const template of Object.values(LANDING_TEMPLATES)) {
    const missing = ALL_SECTIONS.filter((s) => !template.sections.includes(s));
    check(`${template.key} can render every section`, missing.length === 0, missing);
  }

  section('Template routing per facility type');
  check('Government hospital → civic-trust', templateForType('Government Hospital') === 'civic-trust');
  check('Government lab → civic-trust (govt wins)', templateForType('Government Lab') === 'civic-trust');
  check('Medical store → pharma-fresh', templateForType('Medical') === 'pharma-fresh');
  check('Unknown type → care-classic', templateForType('Something Else') === 'care-classic');

  report();
})();
