import mongoose from 'mongoose';

const subscriptionSchema = new mongoose.Schema({
  institutionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Institution', required: true, index: true },
  planId: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', required: true },
  status: { type: String, enum: ['TRIAL', 'ACTIVE', 'PAST_DUE', 'CANCELLED', 'SUSPENDED'], default: 'TRIAL' },
  trialStart: Date,
  trialEnd: Date,
  currentPeriodStart: Date,
  currentPeriodEnd: Date,
  provider: { type: String, default: 'manual' },
  providerCustomerId: String,
  providerSubscriptionId: String,
}, { timestamps: true });

subscriptionSchema.index({ institutionId: 1, status:  1 });
export const Subscription = mongoose.model('Subscription', subscriptionSchema);
