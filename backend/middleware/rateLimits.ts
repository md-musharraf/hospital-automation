import { rateLimit, ipKeyGenerator } from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { JWT_SECRET } from './auth';

/**
 * Best-effort identity for throttling purposes.
 */
export function identify(req: any): string | null {
  const header = req.headers['authorization'];
  const token = header && header.split(' ')[1];
  if (!token) return null;

  try {
    const claims: any = jwt.verify(token, JWT_SECRET);
    return claims && claims.id ? `${claims.role || 'user'}:${claims.id}` : null;
  } catch {
    return null;
  }
}

/** IPv6-safe IP key. */
export const ipKey = (req: any, res: any): string => `ip:${ipKeyGenerator(req, res)}`;

/**
 * The general API limiter.
 */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: (req: any) => (identify(req) ? 600 : 60),
  keyGenerator: (req: any, res: any) => identify(req) || ipKey(req, res),
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req: any) => req.originalUrl.startsWith('/api/v1/health') || req.method === 'OPTIONS',
  message: {
    message: 'Too many requests, please slow down and try again in a minute.'
  }
});

/**
 * The login limiter.
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: (req: any, res: any) => {
    const account = (req.body && (req.body.email || req.body.username)) || 'unknown';
    return `${ipKey(req, res)}|${String(account).toLowerCase()}`;
  },
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many login attempts for this account. Please try again in 15 minutes.' }
});

/**
 * The limiter for endpoints an unauthenticated stranger can reach.
 */
export const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  keyGenerator: ipKey,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many requests. Please wait a moment and try again.' }
});
