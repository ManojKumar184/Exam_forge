import { env, isProduction } from '../config/env.js';
import { logger } from '../utils/logger.js';

class DevelopmentEmailProvider {
  async sendInstitutionInvitation({ email, institutionName, role, invitationUrl }) {
    logger.info('Development invitation prepared', { role });
    return { delivered: false, previewUrl: invitationUrl };
  }

  async sendPasswordReset() {
    return { delivered: false };
  }
}

class ResendEmailProvider {
  async sendInstitutionInvitation({ email, institutionName, role, invitationUrl }) {
    if (!env.email.apiKey || !env.email.from) throw new Error('Transactional email is not configured.');
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.email.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.email.from,
        to: [email],
        subject: `Invitation to join ${institutionName} on ExamForge`,
        html: `<p>You have been invited to join ${escapeHtml(institutionName)} as ${escapeHtml(role.toLowerCase())}.</p><p><a href="${escapeHtml(invitationUrl)}">Accept invitation</a></p>`,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`Invitation email delivery failed (${response.status}).`);
    return { delivered: true };
  }

  async sendPasswordReset({ email, resetUrl }) {
    if (!env.email.apiKey || !env.email.from) throw new Error('Transactional email is not configured.');
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.email.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.email.from,
        to: [email],
        subject: 'Reset your ExamForge password',
        html: `<p>A password reset was requested for your ExamForge account.</p><p><a href="${escapeHtml(resetUrl)}">Reset password</a></p><p>This link expires in one hour and can only be used once.</p>`,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error(`Password reset email delivery failed (${response.status}).`);
    return { delivered: true };
  }
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

export function getEmailProvider() {
  if (env.email.provider === 'resend') return new ResendEmailProvider();
  if (!isProduction && env.email.provider === 'development') return new DevelopmentEmailProvider();
  throw new Error('A production transactional email provider must be configured.');
}
