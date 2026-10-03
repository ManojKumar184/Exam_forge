import { AuditLog } from '../models/AuditLog.js';

export async function recordAudit({ req, action, resource, resourceId = null, result = 'success', metadata = {} }) {
  try {
    await AuditLog.create({
      actorId: req?.user?._id || null,
      institutionId: req?.institutionId || null,
      action,
      resource,
      resourceId: resourceId ? String(resourceId) : null,
      result,
      requestId: req?.id || null,
      metadata,
    });
  } catch (error) {
    // Audit failure is logged for operators but does not expose details to clients.
    console.error('[audit] Failed to persist audit event:', error.message);
  }
}
