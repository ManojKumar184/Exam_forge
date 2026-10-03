import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import crypto from 'node:crypto';

export function signAccessToken(userId) {
  return jwt.sign({ sub: userId }, env.jwt.accessSecret, {
    expiresIn: env.jwt.accessExpiresIn,
  });
}

export function signRefreshToken(userId) {
  return jwt.sign({ sub: userId, type: 'refresh' }, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshExpiresIn,
  });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.jwt.accessSecret);
}

export function verifyRefreshToken(token) {
  const payload = jwt.verify(token, env.jwt.refreshSecret);
  if (payload.type !== 'refresh') {
    throw new Error('Invalid refresh token');
  }
  return payload;
}

export function csrfTokenFor(accessToken) {
  return crypto.createHmac('sha256', env.jwt.accessSecret).update(`csrf:${accessToken}`).digest('hex');
}
