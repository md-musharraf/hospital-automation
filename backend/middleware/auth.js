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
const EFFECTIVE_SECRET = JWT_SECRET || (process.env.NODE_ENV !== 'production'
  ? require('crypto').randomBytes(32).toString('hex')
  : (() => { throw new Error('JWT_SECRET is required in production'); })());

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
    req.user = user; // Contains id, username/email, role ('doctor', 'staff', or 'lab')
    next();
  });
};

// Role-checking middleware factories
const ensureRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ message: `Access denied: ${roles.join(' or ')} only` });
  }
  next();
};

module.exports = { authenticateToken, JWT_SECRET: EFFECTIVE_SECRET, ensureRole };
