import mongoose from 'mongoose';

const planSchema = new mongoose.Schema({
  code: { type: String, unique: true, required: true },
  name: { type: String, required: true },
  active: { type: Boolean, default: true },
  limits: { type: mongoose.Schema.Types.Mixed, default: {} },
  features: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

export const Plan = mongoose.model('Plan', planSchema);
