import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema({
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', default: null },
  action: { type: String, required: true },
  resource: { type: String, required: true },
  resourceId: { type: String, default: null },
  result: { type: String, enum: ['success', 'denied', 'failure'], default: 'success' },
  requestId: { type: String, default: null },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

auditLogSchema.index({ institutionId:  1, createdAt: -1 });
auditLogSchema.index({ actorId: 1, createdAt: -1 });
export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
