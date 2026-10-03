import { Institution } from '../models/Institution.js';
import { Subscription } from '../models/Subscription.js';
import { Plan } from '../models/Plan.js';
import { UsageCounter } from '../models/UsageCounter.js';
import { User } from '../models/User.js';
import { Question } from '../models/Question.js';
import { QuestionBank } from '../models/QuestionBank.js';
import { Paper } from '../models/Paper.js';
import { OnlineTest } from '../models/OnlineTest.js';
import { Upload } from '../models/Upload.js';
import { Membership } from '../models/Membership.js';
import { AppError } from '../utils/AppError.js';

const countFor = {
  faculty: (id) => Membership.countDocuments({ institutionId: id, role: { $in: ['FACULTY', 'INSTITUTION_ADMIN'] }, status: 'ACTIVE' }),
  students: (id) => Membership.countDocuments({ institutionId: id, role: 'STUDENT', status: 'ACTIVE' }),
  questions: (id) => Question.countDocuments({ institutionId: id }),
  questionBanks: (id) => QuestionBank.countDocuments({ institutionId: id }),
  papers: (id) => Paper.countDocuments({ institutionId: id }),
  onlineExams: (id) => OnlineTest.countDocuments({ institutionId: id }),
  uploadsPerMonth: (id) => Upload.countDocuments({ institutionId: id, createdAt: { $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } }),
};

export async function getEntitlements(institutionId) {
  const institution = await Institution.findById(institutionId).lean();
  if (!institution || ['SUSPENDED', 'CANCELLED', 'ARCHIVED'].includes(institution.status)) throw new AppError('Institution is not active', 403, 'INSTITUTION_SUSPENDED');
  const subscription = await Subscription.findOne({ institutionId, status: { $in: ['TRIAL', 'ACTIVE', 'PAST_DUE'] } }).sort({ createdAt: -1 }).lean();
  if (!subscription) throw new AppError('Institution subscription is inactive', 403, 'SUBSCRIPTION_INACTIVE');
  if (subscription.status === 'TRIAL' && subscription.trialEnd && subscription.trialEnd < new Date()) throw new AppError('Institution trial has expired', 403, 'TRIAL_EXPIRED');
  const plan = await Plan.findById(subscription.planId).lean();
  if (!plan?.active) throw new AppError('Institution plan is unavailable', 403, 'PLAN_INACTIVE');
  return { institution, subscription, plan };
}

export async function assertWithinEntitlement(institutionId, metric, amount = 1) {
  const { plan } = await getEntitlements(institutionId);
  const limit = Number(plan.limits?.[metric]);
  if (!Number.isFinite(limit)) return;
  const counter = countFor[metric];
  const used = counter ? await counter(institutionId) : 0;
  if (used + amount > limit) throw new AppError(`Your current plan allows up to ${limit} ${metric}.`, 402, 'ENTITLEMENT_LIMIT');
}

export async function recordUsage(institutionId, metric, amount = 1) {
  const period = new Date().toISOString().slice(0, 7);
  await UsageCounter.updateOne(
    { institutionId, period },
    { $inc: { [`counters.${metric}`]: amount }, $setOnInsert: { institutionId, period } },
    { upsert: true }
  );
}
