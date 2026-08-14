/**
 * Upload credentials for facility branding.
 *
 * The file never passes through this server — see utils/imagekit.js for why.
 * All this route does is decide WHO may upload and WHERE their bytes are allowed
 * to land, then hand back a credential that expires in minutes.
 *
 * Two kinds of caller are legitimate:
 *
 *   - Facility staff, holding a JWT. Their folder comes from the token's own
 *     `hospital` claim and nothing else. A `hospitalId` in the request body is
 *     ignored for them, because a client that can name its own folder can write
 *     into another facility's.
 *
 *   - The platform super-admin, holding the admin secret. They manage every
 *     tenant by definition, so they may name the facility — that is the whole
 *     job of the console they are using.
 */

const express = require('express');
const router = express.Router();

const { authenticateToken } = require('../middleware/auth');
const { safeCompare } = require('../utils/env');
const logger = require('../utils/logger');
const {
  isConfigured,
  buildAuthParams,
  folderFor,
  PURPOSES,
  ALLOWED_MIME,
  EXPIRY_SECONDS
} = require('../utils/imagekit');
const r2 = require('../utils/r2');

/**
 * Resolve the caller into a facility, or refuse.
 *
 * Written as one function rather than two mounted middlewares because the
 * decision and the folder are the same decision — splitting them is how a route
 * ends up authenticated against one facility and writing into another.
 */
function resolveUploader(req) {
  const submittedAdminSecret = req.headers['x-admin-secret'];
  const expectedAdminSecret = process.env.ADMIN_SECRET;

  if (submittedAdminSecret && expectedAdminSecret && safeCompare(submittedAdminSecret, expectedAdminSecret)) {
    const hospitalId = req.body.hospitalId || req.query.hospitalId;
    if (!hospitalId) {
      return { error: 400, message: 'hospitalId is required when uploading as super admin.' };
    }
    return { hospitalId: String(hospitalId), actor: 'super-admin' };
  }

  // Not the admin — fall through to the normal staff token.
  return null;
}

/**
 * POST /api/v1/uploads/imagekit/auth
 *
 * Returns short-lived upload credentials plus the folder they are valid for.
 * A 501 here is a normal, expected answer: ImageKit is optional, and the editor
 * falls back to a plain URL field when it is not configured. Failing loudly with
 * a 500 would make an unconfigured deployment look broken when it is merely
 * running without an optional integration.
 */
router.post('/imagekit/auth', (req, res, next) => {
  if (!isConfigured()) {
    return res.status(501).json({
      configured: false,
      message: 'Image uploads are not configured on this server.'
    });
  }

  const purpose = String(req.body.purpose || req.query.purpose || '');
  if (!PURPOSES[purpose]) {
    return res.status(400).json({
      message: `Unknown upload purpose. Expected one of: ${Object.keys(PURPOSES).join(', ')}.`
    });
  }

  const admin = resolveUploader(req);
  if (admin && admin.error) {
    return res.status(admin.error).json({ message: admin.message });
  }

  const issue = (hospitalId, actor) => {
    const folder = folderFor(hospitalId, purpose);
    if (!folder) {
      return res.status(400).json({ message: 'That facility id cannot be used as a storage folder.' });
    }

    const auth = buildAuthParams();
    logger.info('[UPLOAD] Issued credential', { actor, hospitalId, purpose });

    return res.json({
      configured: true,
      ...auth,
      folder,
      maxBytes: PURPOSES[purpose].maxBytes,
      allowedTypes: ALLOWED_MIME,
      expiresInSeconds: EXPIRY_SECONDS
    });
  };

  if (admin) {
    return issue(admin.hospitalId, admin.actor);
  }

  // Staff path: the token decides the facility, so authenticate first.
  return authenticateToken(req, res, () => {
    const hospitalId = req.user && req.user.hospital;
    if (!hospitalId) {
      return res.status(403).json({ message: 'This account is not attached to a facility.' });
    }
    return issue(hospitalId, req.user.role || 'staff');
  });
});

/**
 * GET /api/v1/uploads/config
 *
 * Lets the editor decide which control to render before anyone picks a file.
 * Unauthenticated on purpose: it reveals only whether an optional feature is
 * switched on, and the browser needs it to draw the form.
 */
router.get('/config', (req, res) => {
  res.json({
    configured: isConfigured(),
    purposes: Object.keys(PURPOSES),
    allowedTypes: ALLOWED_MIME,
    // Reports are a separate integration with its own keys, so the lab bench has
    // to be able to tell that images are switched on while PDFs are not.
    reports: { configured: r2.isConfigured(), allowedType: r2.ALLOWED_MIME, maxBytes: r2.MAX_BYTES }
  });
});

/**
 * POST /api/v1/uploads/r2/report-auth
 *
 * Permission to upload ONE lab report PDF, and the URL it will be readable at.
 *
 * Staff-only and always token-authenticated — unlike the branding route there is
 * no super-admin path, because nobody administers a tenant by uploading a
 * clinical document into it. The facility comes from the token's own `hospital`
 * claim, so a client cannot name the tenant whose reports folder it writes into.
 *
 * A 501 is a normal answer here for the same reason it is for images: R2 is
 * optional, and a deployment without it should look unconfigured, not broken.
 */
router.post('/r2/report-auth', authenticateToken, (req, res) => {
  if (!r2.isConfigured()) {
    return res.status(501).json({
      configured: false,
      message: 'Report uploads are not configured on this server.'
    });
  }

  const hospitalId = req.user && req.user.hospital;
  if (!hospitalId) {
    return res.status(403).json({ message: 'This account is not attached to a facility.' });
  }

  // The lab bench is the only console that files a report. A facility session
  // carries scopes rather than a single role, so accept either shape.
  const scopes = Array.isArray(req.user.scopes) ? req.user.scopes : [];
  const isLab = req.user.role === 'lab' || scopes.includes('lab');
  if (!isLab) {
    return res.status(403).json({ message: 'This facility does not run a lab.' });
  }

  const { tokenId, fileName, contentType, size } = req.body || {};
  if (!tokenId) {
    return res.status(400).json({ message: 'Which token is this report for?' });
  }

  // Checked before signing rather than trusted afterwards: the signature is
  // permission to write, so anything the storage rules care about has to be
  // decided on this side of it.
  if (contentType && contentType !== r2.ALLOWED_MIME) {
    return res.status(400).json({ message: `A lab report must be a PDF, not ${contentType}.` });
  }
  if (size && Number(size) > r2.MAX_BYTES) {
    return res.status(413).json({
      message: `That report is over the ${Math.round(r2.MAX_BYTES / (1024 * 1024))}MB limit.`
    });
  }

  const ticket = r2.presignUpload(hospitalId, tokenId, fileName);
  if (!ticket) {
    return res.status(400).json({ message: 'That facility id cannot be used as a storage folder.' });
  }

  logger.info('[UPLOAD] Issued report credential', { hospitalId, tokenId, key: ticket.key });
  return res.json({ configured: true, ...ticket });
});

export default router;
module.exports = router;
