import * as authService from '../services/authService.js';
import { toAuthUser, toProfile } from '../utils/userMapper.js';
import { csrfTokenFor } from '../utils/tokens.js';

export async function register(req, res) {
  const result = await authService.registerUser(req.body);
  if (result.pendingApproval) {
    return res.status(202).json({
      success: true,
      message: 'Registration successful! Your account is pending Super Admin approval.',
      data: {
        user: toAuthUser(result.user),
        profile: toProfile(result.user),
        pendingApproval: true,
      },
    });
  }
  setRefreshCookie(res, result.refreshToken);
  setAccessCookie(res, result.accessToken);
  setCsrfHeader(res, result.accessToken);
  res.status(201).json({
    success: true,
    data: {
      user: toAuthUser(result.user),
      profile: toProfile(result.user),
    },
  });
}

export async function login(req, res) {
  const { user, accessToken, refreshToken } = await authService.loginUser(req.body);
  setRefreshCookie(res, refreshToken);
  setAccessCookie(res, accessToken);
  setCsrfHeader(res, accessToken);
  res.json({
    success: true,
    data: {
      user: toAuthUser(user),
      profile: toProfile(user),
    },
  });
}

export async function refresh(req, res) {
  const token = req.body.refreshToken || req.cookies?.refreshToken;
  const { user, accessToken, refreshToken } = await authService.refreshSession(token);
  setRefreshCookie(res, refreshToken);
  setAccessCookie(res, accessToken);
  setCsrfHeader(res, accessToken);
  res.json({
    success: true,
    data: {
      user: toAuthUser(user),
      profile: toProfile(user),
    },
  });
}

export async function logout(req, res) {
  const token = req.body.refreshToken || req.cookies?.refreshToken;
  await authService.logoutUser(req.user._id.toString(), token);
  res.clearCookie('refreshToken', cookieOptions());
  res.clearCookie('accessToken', accessCookieOptions());
  res.json({ success: true, message: 'Logged out' });
}

export async function me(req, res) {
  if (req.authToken) setCsrfHeader(res, req.authToken);
  res.json({
    success: true,
    data: {
      user: toAuthUser(req.user),
      profile: toProfile(req.user),
    },
  });
}

export async function updateMe(req, res) {
  const user = await authService.updateUserProfile(req.user._id, req.body);
  res.json({ success: true, data: { profile: toProfile(user) } });
}

export async function forgotPassword(req, res) {
  const result = await authService.requestPasswordReset(req.body.email);
  res.json({ success: true, data: result });
}

export async function resetPassword(req, res) {
  const result = await authService.resetPassword(req.body);
  res.json({ success: true, data: result });
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/api/auth',
  };
}

function setRefreshCookie(res, refreshToken) {
  res.cookie('refreshToken', refreshToken, cookieOptions());
}

function accessCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 15 * 60 * 1000,
    path: '/',
  };
}

function setAccessCookie(res, accessToken) {
  res.cookie('accessToken', accessToken, accessCookieOptions());
}

function setCsrfHeader(res, accessToken) {
  res.setHeader('X-CSRF-Token', csrfTokenFor(accessToken));
}
