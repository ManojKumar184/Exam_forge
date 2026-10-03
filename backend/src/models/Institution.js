import mongoose from 'mongoose';

const institutionSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 160 },
  slug: { type: String, required: true, lowercase: true, trim: true },
  type: { type: String, enum: ['SCHOOL', 'COLLEGE', 'UNIVERSITY', 'COACHING', 'OTHER'], default: 'OTHER' },
  status: { type: String, enum: ['TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED', 'CANCELLED', 'ARCHIVED'], default: 'TRIAL' },
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  contact: { email: String, phone: String },
  address: { type: mongoose.Schema.Types.Mixed, default: {} },
  settings: { type: mongoose.Schema.Types.Mixed, default: {} },
  planId: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', default: null },
  subscriptionStatus: { type: String, enum: ['TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'SUSPENDED'], default: 'TRIAL' },
}, { timestamps: true });

institutionSchema.index({ slug: 1 }, { unique: true });
institutionSchema.index({ status: 1, createdAt: -1 });
export const Institution = mongoose.model('Institution', institutionSchema);
