import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import type { Request, Response, NextFunction, RequestHandler } from 'express';

// SECURITY: Require JWT_SECRET from environment — never use a hardcoded fallback
const JWT_SECRET_ENV = process.env.JWT_SECRET;
if (!JWT_SECRET_ENV) {
  console.error('FATAL: JWT_SECRET environment variable is not set. Server cannot start securely.');
  console.error('Please set JWT_SECRET in backend/.env before starting the server.');
  if (process.env.NODE_ENV !== 'production' || process.env.USE_MOCK_DB === 'true') {
    console.warn('WARNING: Using auto-generated JWT secret for development mode. Do NOT use in production.');
  }
}

// Generate a runtime secret for dev mode only — unique per server restart for safety
export const JWT_SECRET: string =
  JWT_SECRET_ENV ||
  (process.env.NODE_ENV !== 'production'
    ? crypto.randomBytes(32).toString('hex')
    : (() => {
        throw new Error('JWT_SECRET is required in production');
      })());

export const authenticateToken: RequestHandler = (req: any, res: Response, next: NextFunction): any => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Authentication token required' });
  }

  // The callback returns nothing on every path on purpose. `return res.json(...)`
  // reads naturally in a handler, but here it makes one branch return a value
  // and the other `undefined`, which `noImplicitReturns` rejects — and jwt does
  // nothing with the return value either way.
  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) {
      res.status(403).json({ message: 'Invalid or expired token' });
      return;
    }
    // A facility session: { role: 'facility', hospital, name, scopes }.
    req.user = user;

    // The one choke point where a lapsed subscription switches the consoles off.
    //
    // Here rather than on each router because every protected route in the app
    // already passes through this function, and a licence guard is only as good
    // as the route nobody forgot to add it to. Required lazily so this module
    // stays importable by anything that only wants JWT_SECRET.
    const { refuseIfUnlicensed } = require('./license');
    refuseIfUnlicensed(req, res)
      .then((refused: boolean) => {
        if (!refused) next();
      })
      .catch(() => next());
  });
};

/**
 * Guard a route to one or more consoles.
 */
export const ensureRole =
  (...roles: string[]): RequestHandler =>
  (req: any, res: Response, next: NextFunction): any => {
    if (req.user && roles.includes(req.user.role)) return next();

    if (req.user && req.user.role === 'facility') {
      const scopes = Array.isArray(req.user.scopes) ? req.user.scopes : [];
      if (roles.some((role) => scopes.includes(role))) return next();

      return res.status(403).json({
        message: `This facility does not run a ${roles.join(' or ')} unit. Ask the owner to switch the module on.`
      });
    }

    return res.status(403).json({ message: `Access denied: ${roles.join(' or ')} only` });
  };

/**
 * Let through a signed-in facility OR the platform super-admin.
 *
 * Some consoles are rendered in both places. The WhatsApp tester is the reason
 * this exists: a facility opens it from its own hub holding a JWT, and the
 * platform owner opens the same panel from the admin portal holding the admin
 * secret. Written as one middleware because the alternative — leaving the routes
 * open so both callers work — is what they were, and it meant a stranger could
 * read the message log and send WhatsApp from the hospital's number.
 *
 * The admin secret is checked first and compared in constant time; failing that,
 * this falls through to the ordinary JWT path (which also applies the licence
 * check, so a lapsed facility does not slip in here).
 */
export const authenticateStaffOrAdmin: RequestHandler = (
  req: any,
  res: Response,
  next: NextFunction
): any => {
  const submitted = req.headers['x-admin-secret'];
  const expected = process.env.ADMIN_SECRET;

  if (submitted && expected) {
    // Required lazily: utils/env pulls in the environment assertions, and this
    // module is imported by rateLimits before those are meaningful.
    const { safeCompare } = require('../utils/env');
    if (safeCompare(String(submitted), expected)) {
      req.user = { role: 'super-admin' };
      return next();
    }
    return res.status(401).json({ message: 'Unauthorized: Invalid Admin Secret Passcode' });
  }

  return authenticateToken(req, res, next);
};
