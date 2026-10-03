import mongoose from 'mongoose';

const usageCounterSchema = new mongoose.Schema({
  institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', required: true },
  period: { type: String, required: true },
  counters: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

usageCounterSchema.index({ institutionId: 1, period: 1 }, { unique: true });
export const UsageCounter = mongoose.model('UsageCounter', usageCounterSchema);
