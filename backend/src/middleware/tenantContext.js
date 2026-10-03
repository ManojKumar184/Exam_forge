import mongoose from 'mongoose';
import { Membership } from '../models/Membership.js';
import { Institution } from '../models/Institution.js';
import { AppError } from '../utils/AppError.js';

/** Resolve an active institution only through a verified membership. */
export async function resolveTenantContext(req, _res, next) {
  try {
    if (!req.user) return next(new AppError('Authentication required', 401, 'UNAUTHORIZED'));
    const requested = req.get('x-institution-id') || req.user.defaultInstitutionId?.toString();
    if (req.user.role === 'super_admin') {
      if (requested && mongoose.isValidObjectId(requested)) {
        const institution = await Institution.findOne({ _id: requested, status: { $nin: ['SUSPENDED', 'ARCHIVED'] } }).lean();
        if (!institution) return next(new AppError('Institution not found', 404, 'INSTITUTION_NOT_FOUND'));
        req.institution = institution;
        req.institutionId = institution._id;
        req.user.activeInstitutionId = institution._id;
      }
      return next();
    }
    if (!requested || !mongoose.isValidObjectId(requested)) {
      return next(new AppError('Select an active institution to continue', 403, 'INSTITUTION_CONTEXT_REQUIRED'));
    }
    const membership = await Membership.findOne({
      userId: req.user._id,
      institutionId: requested,
      status: 'ACTIVE',
    }).lean();
    if (!membership) return next(new AppError('Institution access denied', 404, 'INSTITUTION_NOT_FOUND'));
    const institution = await Institution.findOne({ _id: requested, status: { $in: ['TRIAL', 'ACTIVE', 'PAST_DUE'] } }).lean();
    if (!institution) return next(new AppError('Institution is not available', 403, 'INSTITUTION_SUSPENDED'));
    req.membership = membership;
    req.institution = institution;
    req.institutionId = institution._id;
    req.user.activeInstitutionId = institution._id;
    req.user.membershipRole = membership.role;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireInstitutionContext(req, _res, next) {
  if (!req.institutionId) {
    return next(new AppError('Active institution context required', 403, 'INSTITUTION_CONTEXT_REQUIRED'));
  }
  next();
}

export function institutionFilter(user, field = 'institutionId') {
  if (user?.role === 'super_admin') return {};
  return { [field]: user?.activeInstitutionId || user?.defaultInstitutionId || null };
}
