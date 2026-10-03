import crypto from 'node:crypto';
import { InstitutionInvitation } from '../models/InstitutionInvitation.js';
import { Institution } from '../models/Institution.js';
import { Membership } from '../models/Membership.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { getEmailProvider } from './emailProvider.js';
import { env, isProduction } from '../config/env.js';

const TOKEN_TTL_MS = 48 * 60 * 60 * 1000;
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

export async function createInvitation({ institutionId, email, role, invitedBy }) {
  const normalizedEmail = email.trim().toLowerCase();
  const existingUser = await User.findOne({ email: normalizedEmail }).select('_id');
  if (existingUser) {
    const existingMembership = await Membership.findOne({ userId: existingUser._id, institutionId });
    if (existingMembership && ['ACTIVE', 'INVITED'].includes(existingMembership.status)) {
      throw new AppError('This user is already a member or has a pending invitation.', 409, 'MEMBERSHIP_EXISTS');
    }
  }

  const institution = await Institution.findById(institutionId).select('name');
  if (!institution) throw new AppError('Institution not found', 404, 'NOT_FOUND');
  const rawToken = crypto.randomBytes(32).toString('base64url');
  const invitation = await InstitutionInvitation.create({
    institutionId, email: normalizedEmail, role, tokenHash: hashToken(rawToken), invitedBy,
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
  });
  const invitationUrl = `${env.clientUrl.replace(/\/$/, '')}/accept-invitation?token=${encodeURIComponent(rawToken)}`;
  try {
    const delivery = await getEmailProvider().sendInstitutionInvitation({
      email: normalizedEmail, institutionName: institution.name, role, invitationUrl,
    });
    const previewUrl = !isProduction ? delivery.previewUrl : undefined;
    return {
      invitation: {
        _id: invitation._id,
        institutionId: invitation.institutionId,
        email: invitation.email,
        role: invitation.role,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
        createdAt: invitation.createdAt,
      },
      previewUrl,
    };
  } catch (error) {
    await InstitutionInvitation.updateOne({ _id: invitation._id, status: 'PENDING' }, { $set: { status: 'REVOKED' } });
    throw new AppError('Invitation could not be delivered. Check the institution email configuration.', 503, 'INVITATION_DELIVERY_FAILED');
  }
}

export async function acceptInvitation({ token, fullName, password }) {
  const tokenHash = hashToken(token);
  const invitation = await InstitutionInvitation.findOne({ tokenHash, status: 'PENDING', expiresAt: { $gt: new Date() } }).select('+tokenHash');
  if (!invitation) {
    const expired = await InstitutionInvitation.findOne({ tokenHash, status: 'PENDING' }).select('_id');
    if (expired) await InstitutionInvitation.updateOne({ _id: expired._id, status: 'PENDING' }, { $set: { status: 'EXPIRED' } });
    throw new AppError('Invitation is invalid, expired, or already used.', 400, 'INVALID_INVITATION');
  }

  let user = await User.findOne({ email: invitation.email }).select('+passwordHash');
  let createdUser = false;
  if (!user) {
    if (!fullName || !password) throw new AppError('Name and password are required to create an account.', 400, 'ACCOUNT_DETAILS_REQUIRED');
    const bcrypt = await import('bcryptjs');
    const passwordHash = await bcrypt.default.hash(password, 12);
    try {
      user = await User.create({
        email: invitation.email, fullName: fullName.trim(), passwordHash,
        role: invitation.role.toLowerCase(), isActive: true, approvalStatus: 'approved',
      });
      createdUser = true;
    } catch (error) {
      if (error.code !== 11000) throw error;
      user = await User.findOne({ email: invitation.email });
    }
  }
  if (!user?.isActive) throw new AppError('This account is inactive. Contact the institution administrator.', 403, 'ACCOUNT_INACTIVE');
  if (user.role !== invitation.role.toLowerCase() && user.role !== 'super_admin') {
    throw new AppError('This invitation role does not match the existing account.', 409, 'ROLE_MISMATCH');
  }

  const claimed = await InstitutionInvitation.findOneAndUpdate({
    _id: invitation._id, tokenHash, status: 'PENDING', expiresAt: { $gt: new Date() },
  }, { $set: { status: 'ACCEPTED', acceptedBy: user._id, acceptedAt: new Date() } }, { new: true });
  if (!claimed) {
    // Another concurrent acceptance may already be using this account. A failed
    // claim is not sufficient evidence that this request owns the new account.
    throw new AppError('Invitation has already been used.', 409, 'INVITATION_ALREADY_USED');
  }

  try {
    await Membership.findOneAndUpdate(
      { userId: user._id, institutionId: invitation.institutionId },
      { $set: { role: invitation.role, status: 'ACTIVE', invitedBy: invitation.invitedBy } },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    );
    await User.updateOne({ _id: user._id, defaultInstitutionId: null }, { $set: { defaultInstitutionId: invitation.institutionId } });
  } catch (error) {
    await InstitutionInvitation.updateOne({ _id: claimed._id, status: 'ACCEPTED', acceptedBy: user._id }, {
      $set: { status: 'PENDING', acceptedBy: null, acceptedAt: null },
    });
    if (createdUser) await User.deleteOne({ _id: user._id });
    throw error;
  }
  return { user, institutionId: invitation.institutionId, role: invitation.role };
}
