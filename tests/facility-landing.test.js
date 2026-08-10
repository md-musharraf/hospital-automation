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
  accountKindsFor,
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

  section('A facility can never be left with no way in');

  // The unit that makes a type operable is force-enabled whatever the request
  // says. The admin panel shows these locked, but the panel is not the only
  // thing that can POST — a hand-written call must not be able to create a Lab
  // with its lab bench switched off, because nobody could then sign in to run
  // a single test at that tenant.
  const strippedLab = normalizeModules({ lab: { enabled: false }, staffDesk: { enabled: false } }, 'Lab');
  check('A Lab cannot switch off its lab', strippedLab.lab.enabled === true, strippedLab.lab);
  check(
    '...but may still drop its front desk',
    strippedLab.staffDesk.enabled === false,
    strippedLab.staffDesk
  );

  const strippedClinic = normalizeModules({ opd: { enabled: false } }, 'Clinic');
  check('A Clinic cannot switch off consultation', strippedClinic.opd.enabled === true, strippedClinic.opd);

  const strippedStore = normalizeModules({ pharmacy: { enabled: false } }, 'Medical');
  check(
    'A Medical store cannot switch off its counter',
    strippedStore.pharmacy.enabled === true,
    strippedStore.pharmacy
  );

  const strippedHospital = normalizeModules({ staffDesk: { enabled: false } }, 'Hospital');
  check(
    'A Hospital cannot switch off reception',
    strippedHospital.staffDesk.enabled === true,
    strippedHospital.staffDesk
  );

  section('Modules decide which team portals a facility links to');

  // The landing page offers its own staff a login only for the units it runs —
  // a clinic with no lab should never show a lab login nobody can use.
  const kinds = accountKindsFor(
    normalizeModules(
      {
        opd: { enabled: true },
        staffDesk: { enabled: true },
        lab: { enabled: false },
        pharmacy: { enabled: true }
      },
      'Hospital'
    ),
    'Hospital'
  );
  check('Doctor console offered when OPD is on', kinds.includes('doctors'), kinds);
  check('Reception offered when the desk is on', kinds.includes('staff'), kinds);
  check('Pharmacy offered when the counter is on', kinds.includes('pharmacy'), kinds);
  check('Lab NOT offered when there is no lab', !kinds.includes('lab'), kinds);

  const labOnly = accountKindsFor(normalizeModules({ staffDesk: { enabled: false } }, 'Lab'), 'Lab');
  check('A Lab never offers a doctor console it cannot have', !labOnly.includes('doctors'), labOnly);

  const bookable = buildLandingPage(
    { id: 'x', name: 'X', type: 'Clinic', city: 'Patna', modules: normalizeModules({}, 'Clinic') },
    []
  );
  check('Landing payload carries the portal list', Array.isArray(bookable.logins), bookable.logins);
  check(
    'Landing payload never carries credentials',
    !JSON.stringify(bookable.logins).match(/password|username/i),
    bookable.logins
  );

  section('Every landing page can be booked from');

  // The booking assistant is the point of the page. A template that forgot the
  // section would render a beautiful brochure with no way to get a token.
  for (const template of Object.values(LANDING_TEMPLATES)) {
    check(
      `${template.key} includes the booking section`,
      template.sections.includes('booking'),
      template.sections
    );
  }

  section('Doctor profiles — what a patient is shown to choose on');

  const roster = buildLandingPage({ id: 'multi', name: 'Multi Hospital', type: 'Hospital', city: 'Patna' }, [
    {
      _id: 'd1',
      name: 'Dr. Rao',
      department: 'Cardiology',
      qualification: 'MBBS, MD',
      experienceYears: '14',
      languages: 'Hindi, English',
      // Deliberately messy, the way a legacy row or a seed script can be:
      // a junk day, a numeric string, and a hostile photo URL.
      opdDays: ['sat', 'banana', 'Mon'],
      opdHours: '10:00 AM – 1:00 PM',
      consultationFee: '500',
      photoUrl: 'javascript:alert(1)',
      registrationNumber: 'BMC/12345',
      averageCheckupTime: 12,
      waiting: 3,
      email: 'rao@hospital.test',
      passwordHash: 'SECRET-HASH'
    },
    { _id: 'd2', name: 'Dr. Iqbal', department: 'Orthopedics' },
    { _id: 'd3', name: 'Dr. Sen', department: 'Cardiology', experienceYears: 900 }
  ]);

  check('Every doctor is listed, not just the first', roster.doctors.length === 3, roster.doctors.length);

  const rao = roster.doctors[0];
  check('Qualification reaches the page', rao.qualification === 'MBBS, MD', rao);
  check('Experience is coerced to a number', rao.experienceYears === 14, rao);
  check('Fee is coerced to a number', rao.consultationFee === 500, rao);
  check(
    'Languages are split into a list',
    JSON.stringify(rao.languages) === JSON.stringify(['Hindi', 'English']),
    rao.languages
  );
  // Normalizing on READ as well as write is what protects the public page from
  // rows that predate this feature or were seeded straight into the database.
  check(
    'OPD days are cleaned and put in week order',
    JSON.stringify(rao.opdDays) === JSON.stringify(['Mon', 'Sat']),
    rao.opdDays
  );
  check('A javascript: photo never reaches the page', rao.photoUrl === '', rao.photoUrl);
  check('Live waiting count is carried through', rao.waiting === 3, rao);

  // The projection is an allow-list: a private field added to the Doctor model
  // later must not become public just by existing.
  check(
    'Doctor email is never published',
    !JSON.stringify(roster.doctors).includes('rao@hospital.test'),
    Object.keys(rao)
  );
  check(
    'Password hash is never published',
    !JSON.stringify(roster).includes('SECRET-HASH'),
    Object.keys(rao)
  );

  // A doctor with no profile still has to render — every key present, blank.
  const bare2 = roster.doctors[1];
  check('A doctor with no profile still has the full shape', Array.isArray(bare2.opdDays), bare2);
  check('...with sensible zeroes, not undefined', bare2.experienceYears === 0, bare2);
  check('...and no live count rather than a fake one', bare2.waiting === null, bare2);

  check('A nonsense experience value is capped', roster.doctors[2].experienceYears === 70, roster.doctors[2]);

  check(
    'Departments still come off the roster',
    roster.departments.includes('Cardiology') && roster.departments.includes('Orthopedics'),
    roster.departments
  );

  section('Template routing per facility type');
  check('Government hospital → civic-trust', templateForType('Government Hospital') === 'civic-trust');
  check('Government lab → civic-trust (govt wins)', templateForType('Government Lab') === 'civic-trust');
  check('Medical store → pharma-fresh', templateForType('Medical') === 'pharma-fresh');
  check('Unknown type → care-classic', templateForType('Something Else') === 'care-classic');

  report();
})();
