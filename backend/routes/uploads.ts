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
  reportFileName,
  PURPOSES,
  ALLOWED_MIME,
  EXPIRY_SECONDS
} = require('../utils/imagekit');

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

    // A lab report is filed against a person, so it is named after them rather
    // than after whatever the bench's file picker called it ("scan_0012.pdf").
    // The name is built here, from ids the caller supplies but which this
    // server sanitises, so a browser cannot write outside its own tenant's tree
    // or over another patient's document.
    const fileName = purpose === 'report' ? reportFileName(req.body.patientId, req.body.testName) : undefined;

    return res.json({
      configured: true,
      ...auth,
      folder,
      ...(fileName ? { fileName } : {}),
      maxBytes: PURPOSES[purpose].maxBytes,
      allowedTypes: PURPOSES[purpose].allowedMime || ALLOWED_MIME,
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
    allowedTypes: ALLOWED_MIME
  });
});

export default router;
module.exports = router;
