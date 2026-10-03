import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';

export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  const statusCode = err.statusCode || 500;
  const code = err.code || 'INTERNAL_ERROR';

  if (statusCode >= 500) {
    logger.error('Request error', {
      code,
      message: err.message,
      path: req.originalUrl,
      method: req.method,
      requestId: req.id,
      userId: req.user?._id?.toString(),
      institutionId: req.institutionId?.toString(),
    });
  }

  const message = statusCode >= 500 && process.env.NODE_ENV === 'production'
    ? 'An unexpected server error occurred.'
    : (err.message || 'Internal server error');
  res.status(statusCode).json({
    success: false,
    error: {
      message,
      code,
      requestId: req.id,
    },
  });
}

export function notFoundHandler(req, res, next) {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404, 'NOT_FOUND'));
}
