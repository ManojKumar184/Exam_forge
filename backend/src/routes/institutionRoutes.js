import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler.js';
import { authenticate } from '../middleware/authenticate.js';
import { resolveTenantContext } from '../middleware/tenantContext.js';
import { Institution } from '../models/Institution.js';
import { Membership } from '../models/Membership.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { recordAudit } from '../services/auditLogService.js';
import { Plan } from '../models/Plan.js';
import { Subscription } from '../models/Subscription.js';

const router = Router();
router.use(authenticate);

router.get('/mine', asyncHandler(async (req, res) => {
  const memberships = await Membership.find({ userId: req.user._id, status: 'ACTIVE' })
    .populate('institutionId', 'name slug type status').lean();
  res.json({ success: true, data: memberships });
}));

router.get('/', asyncHandler(async (req, res) => {
  if (req.user.role !== 'super_admin') throw new AppError('Platform administrator access required', 403, 'FORBIDDEN');
  const institutions = await Institution.find({ status: { $ne: 'ARCHIVED' } }).select('name slug type status ownerId subscriptionStatus createdAt').sort({ createdAt: -1 }).lean();
  res.json({ success: true, data: institutions });
}));

router.post('/', asyncHandler(async (req, res) => {
  const schema = z.object({
    name: z.string().trim().min(2).max(160),
    type: z.enum(['SCHOOL', 'COLLEGE', 'UNIVERSITY', 'COACHING', 'OTHER']).default('OTHER'),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) throw new AppError('Invalid institution details', 400, 'VALIDATION_ERROR');
  if (req.user.role !== 'faculty' && req.user.role !== 'super_admin') throw new AppError('Faculty account required to start an institution', 403, 'FORBIDDEN');
  const { name, type } = parsed.data;
  const baseSlug = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 70) || 'institution';
  const slug = `${baseSlug}-${req.user._id.toString().slice(-6)}`;
  const plan = await Plan.findOne({ code: 'trial', active: true });
  const institution = await Institution.create({ name, type, slug, ownerId: req.user._id, planId: plan?._id || null, status: 'TRIAL', subscriptionStatus: 'TRIAL' });
  await Membership.create({ userId: req.user._id, institutionId: institution._id, role: 'INSTITUTION_ADMIN' });
  if (plan) await Subscription.create({ institutionId: institution._id, planId: plan._id, status: 'TRIAL', trialStart: new Date(), trialEnd: new Date(Date.now() + 14 * 86400000) });
  await User.updateOne({ _id: req.user._id, defaultInstitutionId: null }, { $set: { defaultInstitutionId: institution._id } });
  await recordAudit({ req: { ...req, institutionId: institution._id }, action: 'institution_created', resource: 'institution', resourceId: institution._id });
  res.status(201).json({ success: true, data: { institution, role: 'INSTITUTION_ADMIN' } });
}));

router.get('/active', resolveTenantContext, asyncHandler(async (req, res) => {
  res.json({ success: true, data: { institution: req.institution, role: req.membership?.role || 'SUPER_ADMIN' } });
}));

router.patch('/active', resolveTenantContext, asyncHandler(async (req, res) => {
  if (!req.institution || !['INSTITUTION_ADMIN', 'SUPER_ADMIN'].includes(req.membership?.role || (req.user.role === 'super_admin' ? 'SUPER_ADMIN' : ''))) {
    throw new AppError('Institution administrator access required', 403, 'FORBIDDEN');
  }
  const patch = {};
  if (req.body.name !== undefined) patch.name = String(req.body.name).trim().slice(0, 160);
  if (req.body.type !== undefined && ['SCHOOL', 'COLLEGE', 'UNIVERSITY', 'COACHING', 'OTHER'].includes(req.body.type)) patch.type = req.body.type;
  const institution = await Institution.findByIdAndUpdate(req.institution._id, { $set: patch }, { new: true });
  await recordAudit({ req, action: 'institution_updated', resource: 'institution', resourceId: institution._id });
  res.json({ success: true, data: institution });
}));

export default router;
