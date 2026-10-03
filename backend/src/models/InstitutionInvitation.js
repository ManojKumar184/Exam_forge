import mongoose from 'mongoose';

const institutionInvitationSchema = new mongoose.Schema({
  institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  role: { type: String, enum: ['FACULTY', 'STUDENT'], required: true },
  tokenHash: { type: String, required: true, unique: true, select: false },
  status: { type: String, enum: ['PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED'], default: 'PENDING' },
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  acceptedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  expiresAt: { type: Date, required: true },
  acceptedAt: { type: Date, default: null },
}, { timestamps: true });

institutionInvitationSchema.index({ institutionId: 1, email: 1, status: 1 });
institutionInvitationSchema.index({ expiresAt: 1, status: 1 });

export const InstitutionInvitation = mongoose.model('InstitutionInvitation', institutionInvitationSchema);
