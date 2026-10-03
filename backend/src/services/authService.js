import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../utils/tokens.js';
import { env } from '../config/env.js';
import { getEmailProvider } from './emailProvider.js';

const SALT_ROUNDS = 12;
const MAX_REFRESH_TOKENS = 5;

function hashRefreshToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function parseExpiryToMs(expiry) {
  const match = /^(\d+)([smhd])$/.exec(expiry);
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const n = Number(match[1]);
  const unit = match[2];
  const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return n * multipliers[unit];
}

/**
 * @param {{ email: string, password: string, fullName: string, role: import('../models/User.js').UserRole, schoolInstitute?: string }} params
 * @returns {Promise<{ user: import('../models/User.js').IUser, accessToken: string, refreshToken: string } | { user: import('../models/User.js').IUser, pendingApproval: boolean }>}
 */
export async function registerUser({ email, password, fullName, role, schoolInstitute }) {
  if (role === 'super_admin') {
    throw new AppError('Cannot register as administrator', 403, 'FORBIDDEN_ROLE');
  }

  if (!User.PUBLIC_REGISTER_ROLES.includes(role)) {
    throw new AppError('Invalid role', 400, 'INVALID_ROLE');
  }

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    throw new AppError('Email already registered', 409, 'EMAIL_EXISTS');
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const isFaculty = role === 'faculty';
  const user = await User.create({
    email: email.toLowerCase(),
    passwordHash,
    fullName,
    role,
    schoolInstitute: schoolInstitute || null,
    isActive: !isFaculty,
    approvalStatus: isFaculty ? 'pending' : 'approved',
  });

  if (isFaculty) {
    return { user, pendingApproval: true };
  }

  return issueTokenPair(user);
}

/**
 * @param {{ email: string, password: string }} params
 * @returns {Promise<{ user: import('../models/User.js').IUser, accessToken: string, refreshToken: string }>}
 */
export async function loginUser({ email, password }) {
  const user = await User.findOne({ email: email.toLowerCase() }).select('+passwordHash');
  if (!user) {
    throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    throw new AppError('Invalid email or password', 401, 'INVALID_CREDENTIALS');
  }

  if (user.approvalStatus === 'pending') {
    throw new AppError(
      'Your faculty account is pending approval by the Super Admin.',
      403,
      'PENDING_APPROVAL'
    );
  }

  if (user.approvalStatus === 'rejected') {
    throw new AppError(
      'Your faculty account registration has been rejected by the Super Admin.',
      403,
      'REGISTRATION_REJECTED'
    );
  }

  if (!user.isActive) {
    throw new AppError('Your account has been deactivated. Please contact support.', 403, 'ACCOUNT_DEACTIVATED');
  }

  return issueTokenPair(user);
}

/**
 * @param {string} refreshToken
 * @returns {Promise<{ user: import('../models/User.js').IUser, accessToken: string, refreshToken: string }>}
 */
export async function refreshSession(refreshToken) {
  if (!refreshToken) {
    throw new AppError('Refresh token required', 401, 'NO_REFRESH_TOKEN');
  }

  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError('Invalid refresh token', 401, 'INVALID_REFRESH_TOKEN');
  }

  const user = await User.findById(payload.sub).select('+refreshTokens');
  if (!user || !user.isActive) {
    throw new AppError('User not found', 401, 'USER_NOT_FOUND');
  }

  const storedHash = hashRefreshToken(refreshToken);
  const stored = user.refreshTokens.find((t) => t.token === storedHash || t.token === refreshToken);
  if (!stored || stored.expiresAt < new Date()) {
    throw new AppError('Refresh token expired', 401, 'REFRESH_EXPIRED');
  }

  user.refreshTokens = user.refreshTokens.filter((t) => t.token !== stored.token);
  await user.save();

  return issueTokenPair(user);
}

/**
 * @param {string} userId
 * @param {string} [refreshToken]
 * @returns {Promise<void>}
 */
export async function logoutUser(userId, refreshToken) {
  const user = await User.findById(userId).select('+refreshTokens');
  if (!user) return;

  if (refreshToken) {
    const tokenHash = hashRefreshToken(refreshToken);
    user.refreshTokens = user.refreshTokens.filter((t) => t.token !== tokenHash && t.token !== refreshToken);
  } else {
    user.refreshTokens = [];
  }
  await user.save();
}

/**
 * @param {string} userId
 * @returns {Promise<import('../models/User.js').IUser>}
 */
export async function getUserById(userId) {
  const user = await User.findById(userId);
  if (!user || !user.isActive) {
    throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  }
  return user;
}

/**
 * @param {string} userId
 * @param {Record<string, any>} updates
 * @returns {Promise<import('../models/User.js').IUser>}
 */
export async function updateUserProfile(userId, updates) {
  const allowed = ['fullName', 'schoolInstitute', 'phone', 'avatarUrl'];
  const patch = {};
  if (updates.full_name !== undefined) patch.fullName = updates.full_name;
  if (updates.school_institute !== undefined) patch.schoolInstitute = updates.school_institute;
  if (updates.phone !== undefined) patch.phone = updates.phone;
  if (updates.avatar_url !== undefined) patch.avatarUrl = updates.avatar_url;
  for (const key of allowed) {
    if (updates[key] !== undefined) patch[key] = updates[key];
  }

  const user = await User.findByIdAndUpdate(userId, patch, { new: true });
  if (!user) throw new AppError('User not found', 404, 'USER_NOT_FOUND');
  return user;
}

/**
 * @param {string} email
 * @returns {Promise<{ message: string, resetToken?: string }>}
 */
export async function requestPasswordReset(email) {
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user) {
    return { message: 'If that email exists, a reset link was sent' };
  }

  const token = crypto.randomBytes(32).toString('hex');
  user.passwordResetToken = crypto.createHash('sha256').update(token).digest('hex');
  user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000);
  await user.save();
  const resetUrl = `${env.clientUrl.replace(/\/$/, '')}/reset-password?token=${encodeURIComponent(token)}`;
  try {
    await getEmailProvider().sendPasswordReset({ email: user.email, resetUrl });
  } catch {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();
    // Avoid account enumeration and avoid logging the recipient or reset URL.
  }
  return {
    message: 'If that email exists, a reset link was sent',
    ...(env.nodeEnv !== 'production' ? { resetToken: token } : {}),
  };
}

/**
 * @param {{ token: string, password: string }} params
 * @returns {Promise<{ message: string }>}
 */
export async function resetPassword({ token, password }) {
  const hashed = crypto.createHash('sha256').update(token).digest('hex');
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await User.findOneAndUpdate({
    passwordResetToken: hashed,
    passwordResetExpires: { $gt: new Date() },
  }, {
    $set: { passwordHash, refreshTokens: [] },
    $unset: { passwordResetToken: 1, passwordResetExpires: 1 },
  }, { new: true }).select('_id');

  if (!user) {
    throw new AppError('Invalid or expired reset token', 400, 'INVALID_RESET_TOKEN');
  }

  return { message: 'Password updated successfully' };
}

export async function issueTokenPair(user) {
  const accessToken = signAccessToken(user._id.toString());
  const refreshToken = signRefreshToken(user._id.toString());
  const expiresAt = new Date(Date.now() + parseExpiryToMs(env.jwt.refreshExpiresIn));

  const userWithTokens = await User.findById(user._id).select('+refreshTokens');
  userWithTokens.refreshTokens.push({ token: hashRefreshToken(refreshToken), expiresAt });
  if (userWithTokens.refreshTokens.length > MAX_REFRESH_TOKENS) {
    userWithTokens.refreshTokens = userWithTokens.refreshTokens.slice(-MAX_REFRESH_TOKENS);
  }
  await userWithTokens.save();

  return { user, accessToken, refreshToken };
}
