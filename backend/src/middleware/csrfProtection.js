import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { csrfTokenFor } from '../utils/tokens.js';
import { AppError } from '../utils/AppError.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function csrfProtection(req, _res, next) {
  if (SAFE_METHODS.has(req.method)) return next();
  const origin = req.get('origin');
  const cookieAuthenticated = Boolean(req.cookies?.accessToken || req.cookies?.refreshToken);
  if (cookieAuthenticated && process.env.NODE_ENV === 'production' && (!origin || !env.corsOrigins.includes(origin))) {
    return next(new AppError('Request origin is not allowed', 403, 'CSRF_ORIGIN_REJECTED'));
  }
  // Refresh can run after the short access cookie expires; Origin validation still applies.
  if (req.path === '/auth/refresh') return next();
  const cookieToken = req.cookies?.accessToken;
  if (!cookieToken) return next(); // Bearer-only integrations remain supported.
  const supplied = req.get('x-csrf-token') || '';
  const expected = csrfTokenFor(cookieToken);
  const left = Buffer.from(supplied);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    return next(new AppError('CSRF token is missing or invalid', 403, 'CSRF_TOKEN_INVALID'));
  }
  next();
}
