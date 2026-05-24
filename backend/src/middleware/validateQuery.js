import { AppError } from '../utils/AppError.js';

export function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const message = result.error.errors.map((e) => e.message).join(', ');
      return next(new AppError(message, 400, 'VALIDATION_ERROR'));
    }
    req.query = { ...req.query, ...result.data };
    next();
  };
}
