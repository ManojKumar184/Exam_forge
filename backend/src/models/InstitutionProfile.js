import mongoose from 'mongoose';

const institutionProfileSchema = new mongoose.Schema({
  institutionName: { type: String, required: true },
  logoUrl: { type: String, default: null },
  address: { type: String, default: null },
  contactInfo: { type: String, default: null },
  website: { type: String, default: null },
  defaultHeader: { type: String, default: null },
  defaultFooter: { type: String, default: null },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true }
}, { timestamps: true });

export const InstitutionProfile = mongoose.model('InstitutionProfile', institutionProfileSchema);
