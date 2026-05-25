import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validate } from '../middleware/validate.js';
import { authenticate } from '../middleware/authenticate.js';
import {
  registerSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateProfileSchema,
} from '../validators/authValidators.js';
import * as authController from '../controllers/authController.js';
import { authLimiter } from '../middleware/rateLimits.js';

const router = Router();

router.use(authLimiter);

router.post('/register', validate(registerSchema), asyncHandler(authController.register));
router.post('/login', validate(loginSchema), asyncHandler(authController.login));
router.post('/refresh', asyncHandler(authController.refresh));
router.post('/forgot-password', validate(forgotPasswordSchema), asyncHandler(authController.forgotPassword));
router.post('/reset-password', validate(resetPasswordSchema), asyncHandler(authController.resetPassword));

router.get('/me', authenticate, asyncHandler(authController.me));
router.patch('/me', authenticate, validate(updateProfileSchema), asyncHandler(authController.updateMe));
router.post('/logout', authenticate, asyncHandler(authController.logout));

export default router;
