const jwt = require('jsonwebtoken');

// SECURITY: Require JWT_SECRET from environment — never use a hardcoded fallback
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET environment variable is not set. Server cannot start securely.');
  console.error('Please set JWT_SECRET in backend/.env before starting the server.');
  // In development/mock mode, allow a generated fallback for convenience
  if (process.env.NODE_ENV !== 'production' || process.env.USE_MOCK_DB === 'true') {
    console.warn('WARNING: Using auto-generated JWT secret for development mode. Do NOT use in production.');
  }
}

// Generate a runtime secret for dev mode only — unique per server restart for safety
const EFFECTIVE_SECRET =
  JWT_SECRET ||
  (process.env.NODE_ENV !== 'production'
    ? require('crypto').randomBytes(32).toString('hex')
    : (() => {
        throw new Error('JWT_SECRET is required in production');
      })());

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Authentication token required' });
  }

  jwt.verify(token, EFFECTIVE_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid or expired token' });
    }
    // A facility session: { role: 'facility', hospital, name, scopes }.
    // See utils/facilityAuth.js — one credential per facility, and `scopes` says
    // which consoles that facility actually runs.
    req.user = user;
    next();
  });
};

/**
 * Guard a route to one or more consoles.
 *
 * Routes still say what they mean — `ensureRole('lab')` on the lab bench,
 * `ensureRole('doctor')` on the cabin — and none of them had to change when the
 * four per-role logins collapsed into one facility login. What changed is who
 * satisfies the guard: a facility token passes when the requested console is in
 * the scope list its own module map produced at sign-in.
 *
 * That last part is the reason this is a scope check and not simply "facility
 * tokens may do anything". A pathology lab that runs no OPD signs in through the
 * same door as a district hospital, and its token carries no `doctor` scope — so
 * the cabin endpoints stay closed to it, exactly as they were when the only way
 * in was a doctor password it never had.
 */
const ensureRole =
  (...roles) =>
  (req, res, next) => {
    if (roles.includes(req.user.role)) return next();

    if (req.user.role === 'facility') {
      const scopes = Array.isArray(req.user.scopes) ? req.user.scopes : [];
      if (roles.some((role) => scopes.includes(role))) return next();

      return res.status(403).json({
        message: `This facility does not run a ${roles.join(' or ')} unit. Ask the owner to switch the module on.`
      });
    }

    return res.status(403).json({ message: `Access denied: ${roles.join(' or ')} only` });
  };

module.exports = { authenticateToken, JWT_SECRET: EFFECTIVE_SECRET, ensureRole };
