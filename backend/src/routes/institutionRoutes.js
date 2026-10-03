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
import { InstitutionInvitation } from '../models/InstitutionInvitation.js';
import { createInvitation } from '../services/invitationService.js';

const router = Router();
router.use(authenticate);

function requireInstitutionAdmin(req) {
  if (req.user.role !== 'super_admin' && req.membership?.role !== 'INSTITUTION_ADMIN') {
    throw new AppError('Institution administrator access required', 403, 'FORBIDDEN');
  }
}

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

router.get('/members', resolveTenantContext, asyncHandler(async (req, res) => {
  if (!req.institutionId) throw new AppError('Select an institution first.', 400, 'INSTITUTION_CONTEXT_REQUIRED');
  requireInstitutionAdmin(req);
  const members = await Membership.find({ institutionId: req.institutionId, status: { $in: ['ACTIVE', 'SUSPENDED'] } })
    .populate('userId', 'email fullName role isActive createdAt').sort({ createdAt: 1 }).lean();
  res.json({ success: true, data: members });
}));

router.get('/invitations', resolveTenantContext, asyncHandler(async (req, res) => {
  if (!req.institutionId) throw new AppError('Select an institution first.', 400, 'INSTITUTION_CONTEXT_REQUIRED');
  requireInstitutionAdmin(req);
  const invitations = await InstitutionInvitation.find({ institutionId: req.institutionId })
    .select('email role status invitedBy expiresAt acceptedAt createdAt').sort({ createdAt: -1 }).lean();
  res.json({ success: true, data: invitations });
}));

router.post('/invitations', resolveTenantContext, asyncHandler(async (req, res) => {
  if (!req.institutionId) throw new AppError('Select an institution first.', 400, 'INSTITUTION_CONTEXT_REQUIRED');
  requireInstitutionAdmin(req);
  const parsed = z.object({ email: z.string().email().max(254), role: z.enum(['FACULTY', 'STUDENT']) }).safeParse(req.body);
  if (!parsed.success) throw new AppError('Valid email and role are required.', 400, 'VALIDATION_ERROR');
  const result = await createInvitation({ ...parsed.data, institutionId: req.institutionId, invitedBy: req.user._id });
  await recordAudit({ req, action: 'member_invited', resource: 'institution_invitation', resourceId: result.invitation._id, metadata: { email: parsed.data.email, role: parsed.data.role } });
  res.status(201).json({ success: true, data: { invitation: result.invitation, ...(result.previewUrl ? { developmentUrl: result.previewUrl } : {}) } });
}));

router.delete('/invitations/:id', resolveTenantContext, asyncHandler(async (req, res) => {
  if (!req.institutionId) throw new AppError('Select an institution first.', 400, 'INSTITUTION_CONTEXT_REQUIRED');
  requireInstitutionAdmin(req);
  const invitation = await InstitutionInvitation.findOneAndUpdate(
    { _id: req.params.id, institutionId: req.institutionId, status: 'PENDING' },
    { $set: { status: 'REVOKED' } }, { new: true },
  );
  if (!invitation) throw new AppError('Pending invitation not found.', 404, 'NOT_FOUND');
  await recordAudit({ req, action: 'invitation_revoked', resource: 'institution_invitation', resourceId: invitation._id });
  res.json({ success: true });
}));

router.patch('/members/:userId', resolveTenantContext, asyncHandler(async (req, res) => {
  if (!req.institutionId) throw new AppError('Select an institution first.', 400, 'INSTITUTION_CONTEXT_REQUIRED');
  requireInstitutionAdmin(req);
  const parsed = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED']).optional(), role: z.enum(['FACULTY', 'STUDENT']).optional() }).refine((value) => Object.keys(value).length > 0).safeParse(req.body);
  if (!parsed.success) throw new AppError('Provide a valid member status or role.', 400, 'VALIDATION_ERROR');
  if (String(req.user._id) === req.params.userId) throw new AppError('Administrators cannot change their own membership.', 400, 'SELF_MEMBERSHIP_CHANGE');
  const membership = await Membership.findOne({ userId: req.params.userId, institutionId: req.institutionId, status: { $in: ['ACTIVE', 'SUSPENDED'] } });
  if (!membership) throw new AppError('Member not found.', 404, 'NOT_FOUND');
  if (membership.role === 'INSTITUTION_ADMIN' && (parsed.data.status === 'SUSPENDED' || parsed.data.role)) {
    const otherAdmins = await Membership.countDocuments({ institutionId: req.institutionId, role: 'INSTITUTION_ADMIN', status: 'ACTIVE', userId: { $ne: membership.userId } });
    if (!otherAdmins) throw new AppError('The last institution administrator cannot be demoted or suspended.', 409, 'LAST_INSTITUTION_ADMIN');
  }
  if (parsed.data.role) {
    const targetUser = await User.findById(membership.userId).select('role');
    if (!targetUser) throw new AppError('Member account not found.', 404, 'NOT_FOUND');
    if (targetUser.role !== parsed.data.role.toLowerCase()) {
      const otherMemberships = await Membership.countDocuments({ userId: targetUser._id, institutionId: { $ne: req.institutionId }, status: 'ACTIVE' });
      if (otherMemberships) throw new AppError('This account has memberships in other institutions; its global role cannot be changed here.', 409, 'MULTI_TENANT_ROLE_CHANGE');
      targetUser.role = parsed.data.role.toLowerCase();
      targetUser.approvalStatus = 'approved';
      await targetUser.save();
    }
    membership.role = parsed.data.role;
  }
  if (parsed.data.status) membership.status = parsed.data.status;
  await membership.save();
  await recordAudit({ req, action: 'member_updated', resource: 'membership', resourceId: membership._id, metadata: parsed.data });
  res.json({ success: true, data: membership });
}));

export default router;
