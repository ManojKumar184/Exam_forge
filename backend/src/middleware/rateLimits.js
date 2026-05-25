import rateLimit from 'express-rate-limit';

export const globalApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 400,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { message: 'Too many requests', code: 'RATE_LIMIT' } },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { message: 'Too many auth attempts', code: 'RATE_LIMIT' } },
});

export const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { message: 'Upload limit exceeded', code: 'UPLOAD_RATE_LIMIT' } },
});

export const heavyOperationLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { message: 'Too many heavy requests', code: 'THROTTLE' } },
});
