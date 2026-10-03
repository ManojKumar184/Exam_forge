import mongoose from 'mongoose';

const membershipSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', required: true },
  role: { type: String, enum: ['INSTITUTION_ADMIN', 'FACULTY', 'STUDENT'], required: true },
  status: { type: String, enum: ['ACTIVE', 'SUSPENDED', 'INVITED', 'REMOVED'], default: 'ACTIVE' },
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

membershipSchema.index({ userId: 1, institutionId: 1 }, { unique: true });
membershipSchema.index({ institutionId: 1, status: 1, role: 1 });
export const Membership = mongoose.model('Membership', membershipSchema);
