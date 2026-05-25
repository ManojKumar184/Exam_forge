import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { authorize } from '../middleware/authorize.js';
import { validate } from '../middleware/validate.js';
import { validateQuery } from '../middleware/validateQuery.js';
import * as userController from '../controllers/userController.js';

const router = Router();

router.use(authenticate);
router.use(authorize('super_admin'));

router.get(
  '/',
  validateQuery(
    z.object({
      role: z.enum(['super_admin', 'faculty', 'student']).optional(),
      search: z.string().optional(),
      is_active: z.string().optional(),
      page: z.coerce.number().optional(),
      limit: z.coerce.number().optional(),
    })
  ),
  asyncHandler(userController.list)
);
router.get('/:id', asyncHandler(userController.getOne));
router.patch(
  '/:id',
  validate(
    z.object({
      full_name: z.string().optional(),
      role: z.enum(['super_admin', 'faculty', 'student']).optional(),
      is_active: z.boolean().optional(),
      school_institute: z.string().nullable().optional(),
      phone: z.string().nullable().optional(),
    })
  ),
  asyncHandler(userController.update)
);

export default router;
