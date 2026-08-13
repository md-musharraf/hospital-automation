const mongoose = require('mongoose');
const { tenantGuardPlugin } = require('../utils/tenantGuard');

/**
 * The one password a facility signs in with.
 *
 * Its own collection rather than a field on Hospital, because the Hospital
 * document is the most widely published object in this codebase: it is the
 * public directory listing, the landing page source, the sign-in picker and the
 * chatbot's facility card. Every one of those paths would have to remember to
 * project a hash away, forever, including in the mock database used for local
 * runs — where `.select()` is a no-op. A row that nothing except sign-in ever
 * loads cannot be leaked by forgetting.
 *
 * One row per facility. No default, no seeded value: a facility with no row here
 * cannot be signed into at all, and the owner console is the only thing that
 * creates one. See utils/facilityAuth.js.
 */
const FacilityCredentialSchema = new mongoose.Schema(
  {
    hospital: { type: String, required: true, unique: true, index: true },
    passwordHash: { type: String, required: true },
    // Who last set it and when — an owner resetting a facility's password wants
    // to see that it happened, and a facility asking "has ours ever been set?"
    // is answered by the row existing at all.
    setAt: { type: Date, default: Date.now },
    setBy: { type: String, default: 'owner' }
  },
  { timestamps: true }
);

// Tenant-owned like every other per-facility collection: an unscoped query here
// would hand back every facility's hash at once.
FacilityCredentialSchema.plugin(tenantGuardPlugin, { modelName: 'FacilityCredential' });

module.exports = mongoose.model('FacilityCredential', FacilityCredentialSchema);
