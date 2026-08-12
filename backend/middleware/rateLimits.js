/**
 * Request throttling, keyed by WHO is asking rather than by where they sit.
 *
 * The previous limiters counted per IP address, which is the wrong unit for this
 * product. A hospital is one building on one internet connection: reception,
 * every doctor's console, the lab bench, the pharmacy counter and the waiting-room
 * TV all leave the network through a single NAT address. A per-IP cap of 60
 * requests a minute was therefore a cap on the whole facility, shared between
 * roughly a dozen screens that each poll and re-fetch on every queue change. The
 * first busy morning would have produced 429s across every portal at once, and
 * the facility would have experienced it as "the system is down".
 *
 * The login limiter had the same shape and a sharper edge: ten attempts per
 * fifteen minutes per IP meant the eleventh member of staff to sign in each
 * morning was locked out by their colleagues.
 *
 * So identity comes first. A signed-in user gets their own generous bucket; an
 * anonymous caller is still held to a tight per-IP limit, because that is where
 * abuse actually comes from.
 */

const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./auth');

/**
 * Best-effort identity for throttling purposes.
 *
 * This runs before the routers, so `req.user` does not exist yet — the token has
 * to be read here. It is fully verified rather than merely decoded: an unverified
 * token would let anyone claim another user's bucket and exhaust it for them.
 * A missing or invalid token is not an error at this stage; it simply means the
 * caller is treated as anonymous and the route's own auth middleware decides
 * what happens next.
 */
function identify(req) {
  const header = req.headers['authorization'];
  const token = header && header.split(' ')[1];
  if (!token) return null;

  try {
    const claims = jwt.verify(token, JWT_SECRET);
    return claims && claims.id ? `${claims.role || 'user'}:${claims.id}` : null;
  } catch {
    return null;
  }
}

/** IPv6-safe IP key. A bare `req.ip` buckets a whole /64 prefix as one client. */
const ipKey = (req, res) => `ip:${ipKeyGenerator(req, res)}`;

/**
 * The general API limiter.
 *
 * The signed-in ceiling is deliberately high. A staff dashboard legitimately
 * bursts: one doctor completing a checkup fans out into several events, each
 * portal coalesces them into a refresh, and a refresh is several parallel calls.
 * The limit exists to stop a runaway loop or a scraper, not to pace normal work.
 */
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: (req) => (identify(req) ? 600 : 60),
  keyGenerator: (req, res) => identify(req) || ipKey(req, res),
  standardHeaders: true,
  legacyHeaders: false,
  // Mounted on '/api/', so req.path has the mount stripped — match on
  // originalUrl to reliably exempt the health check and CORS preflight.
  skip: (req) => req.originalUrl.startsWith('/api/v1/health') || req.method === 'OPTIONS',
  message: {
    message: 'Too many requests, please slow down and try again in a minute.'
  }
});

/**
 * The login limiter.
 *
 * Keyed by IP *and* the account being attempted, so the budget belongs to one
 * account rather than one building. Brute-forcing a single login still hits the
 * wall after ten tries, while a second member of staff signing in from the same
 * reception desk starts with a full allowance of their own.
 */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: (req, res) => {
    const account = (req.body && (req.body.email || req.body.username)) || 'unknown';
    return `${ipKey(req, res)}|${String(account).toLowerCase()}`;
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts for this account. Please try again in 15 minutes.' }
});

/**
 * The limiter for endpoints an unauthenticated stranger can reach: the patient
 * chatbot, the public facility list, the landing pages. Tighter than the signed-in
 * ceiling, looser than login, and keyed by IP because there is no identity yet.
 */
const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  keyGenerator: ipKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please wait a moment and try again.' }
});

module.exports = { apiLimiter, loginLimiter, publicLimiter, identify };
