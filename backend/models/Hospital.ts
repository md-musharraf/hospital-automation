import mongoose, { Schema, Document, Model } from 'mongoose';
import { normalizePhone } from '@careeai/shared';

const HospitalSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true },
    address: { type: String, required: true },
    // The facility's public contact number — canonicalized like every other
    // phone on the platform so the landing page and the directory show one
    // format rather than whatever the onboarding admin happened to type.
    phone: { type: String, required: true, trim: true, set: (v: any) => normalizePhone(v) || v },
    // Deliberately NOT normalized, unlike `phone` above.
    //
    // This is a channel address, not a contact number: Twilio-era records store
    // it prefixed (`whatsapp:+91...`), and the callers below strip that prefix
    // themselves. Running it through normalizePhone would silently drop the
    // prefix and change what the Twilio path sends to. The webhook that matches
    // an inbound message to a facility already compares digits-only
    // (routes/chat.js), so it is format-tolerant where it matters and there is
    // nothing here for canonicalization to fix.
    whatsappNumber: { type: String, required: true, trim: true },
    coverImage: { type: String },
    description: { type: String },
    city: { type: String, required: true },
    // State and district power the location-based discovery flow (choose State →
    // District → facility). Optional so pre-existing facilities that only stored a
    // city keep working — the API derives a sensible fallback from the city.
    state: { type: String, default: '' },
    district: { type: String, default: '' },
    coordinates: {
      lat: { type: Number, required: true },
      lng: { type: Number, required: true }
    },
    type: {
      type: String,
      required: true,
      enum: ['Hospital', 'Clinic', 'Medical', 'Lab', 'Government Hospital', 'Government Lab', 'Government'],
      default: 'Hospital'
    },
    // The facility's one credential is deliberately NOT a field here — it lives
    // in its own collection (models/FacilityCredential.js). This document is
    // served to the public directory, to every landing page and to the sign-in
    // picker; a password hash stored on it would be one forgotten projection
    // away from being published. See utils/facilityAuth.js.

    // The local day this facility's board was last closed, as "YYYY-MM-DD".
    //
    // The close-of-day is a midnight cron, and a midnight cron only fires if the
    // process is awake at midnight. On a free hosting tier it is not: the
    // instance sleeps after a quarter-hour of silence, which every night is,
    // so the job never ran, yesterday's queue was still on the board in the
    // morning, and — worse — tokens booked for today were never put into it.
    // This marker is what lets the next request of the day notice the night was
    // missed and close it then. See jobs/dailyReset.ts.
    lastDailyReset: { type: String, default: '' },

    logoUrl: { type: String },
    heroImage: { type: String },
    galleryImages: [{ type: String }],
    doctorCount: { type: Number, default: 1 },
    primaryColor: { type: String, default: '#0d9488' },
    secondaryColor: { type: String, default: '#0f172a' },
    welcomeMessage: { type: String },
    parentHospital: { type: String, default: null },
    hasInternalLab: { type: Boolean, default: true },
    hasInternalPharmacy: { type: Boolean, default: true },
    clinicSubtype: { type: String, default: 'General' },
    customServices: [
      {
        title: { type: String },
        description: { type: String },
        icon: { type: String }
      }
    ],
    features: [{ type: String }],

    // Which units this facility actually runs — `{ lab: { enabled, openHours,
    // homeCollection }, ipd: { enabled, bedCount }, ... }`. Kept Mixed, and
    // validated by utils/facilityProfile.normalizeModules() on the way in, for the
    // same reason ChatSession.tempData is Mixed: a declared sub-schema silently
    // DROPS every key added by a later version, so the day someone adds a
    // "Dialysis" module every existing facility would quietly lose its details on
    // the next save. Modules grow; the schema must not have to be edited for them.
    modules: { type: mongoose.Schema.Types.Mixed, default: {} },

    // The facility's public landing page content (hero copy, about, timings,
    // amenities, FAQs, testimonials, gallery, socials). Mixed for the same reason
    // as `modules`. Everything optional — utils/facilityProfile.buildLandingPage()
    // fills every gap from the template so a facility that typed nothing still
    // gets a complete page.
    landing: { type: mongoose.Schema.Types.Mixed, default: {} },

    // The subscription this facility runs on.
    //
    // Declared rather than Mixed, unlike `modules` and `landing`: those two grow
    // a key every time somebody adds a feature, whereas what was bought — a
    // plan, a start, an end — is a closed set that has not changed since
    // invoices were invented.
    //
    // Note what is NOT here: any stored notion of "expired". The state is
    // computed from `expiresAt` on every read (utils/licenseHelper.ts), because
    // a stored status is only as fresh as the last job that ran, and the day
    // that job does not run the platform is wrong about every tenant at once.
    //
    // A facility with no `expiresAt` is grandfathered, not expired — every
    // tenant onboarded before licensing existed has one, and reading a missing
    // date as "ran out in 1970" would switch off the whole platform on deploy.
    license: {
      plan: { type: String, default: '' }, // '', 'trial', '1m', '6m', '12m', '24m'
      startedAt: { type: Date, default: null },
      expiresAt: { type: Date, default: null },
      // Which price tier this facility is on — 'standalone' | 'starter' |
      // 'growth' | 'hospital' (utils/messageMeter.METER_TIERS). Separate from
      // `plan` because that sells a DURATION and this sells a SIZE: a clinic and
      // a 200-bed hospital both buy twelve months, and they are not the same
      // customer. Empty means nobody has set one, which is reported as an unset
      // tier rather than silently treated as the cheapest — see `tierOf`.
      tier: { type: String, default: '' },
      // Only ever 'Active' or 'Suspended' — a hand switch the owner controls,
      // which beats the dates in both directions.
      status: { type: String, enum: ['Active', 'Suspended'], default: 'Active' },
      // Which renewal threshold has already been messaged (30, 15, 7, 3, 1, then
      // 0 and negatives once expired), so a reminder is sent once and not daily.
      lastRemindedDay: { type: Number, default: null },
      // Where renewal notices go. Falls back to the facility's public phone.
      notifyPhone: { type: String, default: '' },
      // Every term ever granted. The first question after a disputed shutdown is
      // "when did we last renew them?", and it should not need a support ticket.
      history: [
        {
          plan: { type: String },
          months: { type: Number },
          at: { type: Date },
          expiresAt: { type: Date },
          by: { type: String },
          note: { type: String }
        }
      ]
    }
  },
  { timestamps: true }
);

const Hospital: Model<any> =
  (mongoose.models && mongoose.models.Hospital) || mongoose.model<any>('Hospital', HospitalSchema);
export default Hospital;
module.exports = Hospital;
