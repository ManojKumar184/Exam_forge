import crypto from 'crypto';
import { Institution } from './models/Institution.js';
import { InstitutionProfile } from './models/InstitutionProfile.js';
import { Membership } from './models/Membership.js';
import { User } from './models/User.js';
import { Question } from './models/Question.js';
import { QuestionBank } from './models/QuestionBank.js';
import { Paper } from './models/Paper.js';
import { Upload } from './models/Upload.js';
import { OnlineTest } from './models/OnlineTest.js';
import { TestAttempt } from './models/TestAttempt.js';
import { Plan } from './models/Plan.js';
import { Subscription } from './models/Subscription.js';

// Idempotent, additive backfill. No documents are deleted; unassigned legacy data
// goes to a clearly named legacy tenant until an operator reviews ownership.
export async function migrateInstitutions() {
  // Profiles are institution-owned, so an administrator can manage a profile
  // in each institution. Remove the old globally unique creator constraint.
  const profileIndexes = await InstitutionProfile.collection.indexes().catch(() => []);
  if (profileIndexes.some((index) => index.name === 'createdBy_1' && index.unique)) {
    await InstitutionProfile.collection.dropIndex('createdBy_1');
  }
  await InstitutionProfile.collection.createIndex({ institutionId: 1 }, { unique: true, sparse: true });

  const trialPlan = await Plan.findOneAndUpdate(
    { code: 'trial' },
    { $setOnInsert: { code: 'trial', name: 'Trial', active: true, limits: { faculty: 5, students: 250, questions: 10000, uploadsPerMonth: 50, papers: 500, onlineExams: 100 }, features: { onlineExams: true, exports: true, imports: true } } },
    { upsert: true, new: true }
  );
  const legacy = await Institution.findOneAndUpdate(
    { slug: 'legacy-migrated-data' },
    { $setOnInsert: { name: 'Legacy migrated data', slug: 'legacy-migrated-data', type: 'OTHER', status: 'ACTIVE', subscriptionStatus: 'ACTIVE' } },
    { upsert: true, new: true }
  );
  const userTenant = new Map();
  const users = await User.find({ role: { $ne: 'super_admin' } }).select('_id schoolInstitute role defaultInstitutionId isActive').lean();
  for (const user of users) {
    const label = String(user.schoolInstitute || '').trim();
    // schoolInstitute was a user supplied string, not proof of shared ownership.
    // Isolate each legacy account until an administrator explicitly invites others.
    const suffix = crypto.createHash('sha1').update(user._id.toString()).digest('hex').slice(0, 8);
    const slugBase = (label || 'legacy-user').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) || 'legacy-user';
    const institution = await Institution.findOneAndUpdate(
      { slug: `${slugBase}-${suffix}` },
      { $setOnInsert: { name: label || `Legacy account ${user._id.toString().slice(-6)}`, slug: `${slugBase}-${suffix}`, type: 'OTHER', status: 'ACTIVE' } },
      { upsert: true, new: true }
    );
    await Institution.updateOne({ _id: institution._id, planId: null }, { $set: { planId: trialPlan._id, subscriptionStatus: 'ACTIVE' } });
    await Subscription.updateOne(
      { institutionId: institution._id },
      { $setOnInsert: { institutionId: institution._id, planId: trialPlan._id, status: 'ACTIVE' } },
      { upsert: true }
    );
    userTenant.set(user._id.toString(), institution._id);
    const role = user.role === 'faculty' ? 'FACULTY' : 'STUDENT';
    const membershipRole = institution.ownerId?.toString() === user._id.toString() ? 'INSTITUTION_ADMIN' : role;
    await Membership.updateOne(
      { userId: user._id, institutionId: institution._id },
      { $set: { role: membershipRole, status: user.isActive ? 'ACTIVE' : 'SUSPENDED' }, $setOnInsert: { userId: user._id, institutionId: institution._id } },
      { upsert: true }
    );
    await User.updateOne({ _id: user._id, defaultInstitutionId: null }, { $set: { defaultInstitutionId: institution._id } });
    if (!institution.ownerId && user.role === 'faculty') {
      await Institution.updateOne({ _id: institution._id, ownerId: null }, { $set: { ownerId: user._id } });
      await Membership.updateOne({ userId: user._id, institutionId: institution._id }, { $set: { role: 'INSTITUTION_ADMIN' } });
    }
  }

  for (const user of users) {
    const institutionId = userTenant.get(user._id.toString());
    if (!institutionId) continue;
    await Question.updateMany({ createdBy: user._id, institutionId: null, visibility: { $ne: 'public' } }, { $set: { institutionId } });
    await Paper.updateMany({ createdBy: user._id, institutionId: null }, { $set: { institutionId } });
    await Upload.updateMany({ uploadedBy: user._id, institutionId: null }, { $set: { institutionId } });
    await QuestionBank.updateMany({ createdBy: user._id, institutionId: null, type: { $ne: 'system' } }, { $set: { institutionId } });
    await InstitutionProfile.updateMany({ createdBy: user._id, institutionId: null }, { $set: { institutionId } });
  }
  const ownedPapers = await Paper.find({ institutionId: { $ne: null } }).select('_id institutionId').lean();
  for (const paper of ownedPapers) {
    await OnlineTest.updateMany({ paperId: paper._id, institutionId: null }, { $set: { institutionId: paper.institutionId } });
  }
  const tests = await OnlineTest.find({ institutionId: { $ne: null } }).select('_id institutionId').lean();
  for (const test of tests) {
    await TestAttempt.updateMany({ testId: test._id, institutionId: null }, { $set: { institutionId: test.institutionId } });
  }
  // Records with no owner are not exposed as tenant-owned data by default.
  await Question.updateMany({ institutionId: null, visibility: { $nin: ['public'] }, createdBy: null }, { $set: { institutionId: legacy._id } });
  await Paper.updateMany({ institutionId: null, createdBy: null }, { $set: { institutionId: legacy._id } });
  await Upload.updateMany({ institutionId: null, uploadedBy: null }, { $set: { institutionId: legacy._id } });
  return { institutions: await Institution.countDocuments(), memberships: await Membership.countDocuments() };
}
