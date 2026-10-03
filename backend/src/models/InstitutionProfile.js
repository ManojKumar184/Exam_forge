import mongoose from 'mongoose';

const institutionProfileSchema = new mongoose.Schema({
  institutionName: { type: String, required: true },
  logoUrl: { type: String, default: null },
  address: { type: String, default: null },
  contactInfo: { type: String, default: null },
  website: { type: String, default: null },
  defaultHeader: { type: String, default: null },
  defaultFooter: { type: String, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', default: null }
}, { timestamps: true });

institutionProfileSchema.index({ institutionId: 1 }, { unique: true, sparse: true });

export const InstitutionProfile = mongoose.model('InstitutionProfile', institutionProfileSchema);
