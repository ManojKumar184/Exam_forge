import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { migrateInstitutions } from '../migrateInstitutions.js';
import { User } from '../models/User.js';
import { Question } from '../models/Question.js';
import { QuestionBank } from '../models/QuestionBank.js';
import { Paper } from '../models/Paper.js';
import { Upload } from '../models/Upload.js';
import { Institution } from '../models/Institution.js';
import { Membership } from '../models/Membership.js';

const uri = process.env.MONGODB_TEST_URI;
const isTestDatabase = (value) => {
  try { return /^examforge_test(?:_|$)/i.test(new URL(value).pathname.replace(/^\//, '')); }
  catch { return false; }
};
const isolatedTestUri = (value) => { const parsed = new URL(value); parsed.pathname = `${parsed.pathname.replace(/\/$/, '')}_migration`; return parsed.toString(); };

test('institution migration preserves representative legacy records and is repeatable', {
  skip: !uri ? 'Set MONGODB_TEST_URI to a dedicated isolated test database.' : false,
}, async (t) => {
  assert.ok(isTestDatabase(uri), 'MONGODB_TEST_URI must name an examforge_test database; refusing to touch another database.');
  await mongoose.connect(isolatedTestUri(uri));
  await mongoose.connection.dropDatabase();
  t.after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });

  const user = await User.create({ email: 'legacy@example.test', fullName: 'Legacy Faculty', role: 'faculty', passwordHash: 'fixture-hash', isActive: true });
  const question = await Question.create({ questionText: 'Legacy question', questionType: 'MCQ_SINGLE', class: 8, status: 'approved', createdBy: user._id, ownerId: user._id, isPrivate: true, visibility: 'private', options: [{ text: 'A' }, { text: 'B' }], correctOption: 0 });
  const bank = await QuestionBank.create({ name: 'Legacy bank', type: 'faculty', visibility: 'private', createdBy: user._id });
  question.bankIds = [bank._id];
  await question.save();
  const paper = await Paper.create({ title: 'Legacy paper', paperCode: 'LEGACY-1', class: 8, totalMarks: 1, totalQuestions: 1, createdBy: user._id, questions: [{ questionId: question._id, questionOrder: 0, customMarks: 1 }] });
  const upload = await Upload.create({ filename: 'legacy.docx', originalName: 'legacy.docx', filePath: '/uploads/documents/legacy.docx', fileType: 'docx', uploadedBy: user._id });

  await migrateInstitutions();
  const migratedUser = await User.findById(user._id);
  const institutionId = migratedUser.defaultInstitutionId;
  assert.ok(institutionId);
  assert.equal((await Membership.findOne({ userId: user._id, institutionId })).role, 'INSTITUTION_ADMIN');
  assert.equal((await Question.findById(question._id)).institutionId.toString(), institutionId.toString());
  assert.equal((await QuestionBank.findById(bank._id)).institutionId.toString(), institutionId.toString());
  assert.equal((await Paper.findById(paper._id)).institutionId.toString(), institutionId.toString());
  assert.equal((await Upload.findById(upload._id)).institutionId.toString(), institutionId.toString());

  const countsBeforeRepeat = {
    institutions: await Institution.countDocuments(), memberships: await Membership.countDocuments(),
    questions: await Question.countDocuments(), banks: await QuestionBank.countDocuments(),
    papers: await Paper.countDocuments(), uploads: await Upload.countDocuments(),
  };
  await migrateInstitutions();
  assert.deepEqual({
    institutions: await Institution.countDocuments(), memberships: await Membership.countDocuments(),
    questions: await Question.countDocuments(), banks: await QuestionBank.countDocuments(),
    papers: await Paper.countDocuments(), uploads: await Upload.countDocuments(),
  }, countsBeforeRepeat, 'rerunning migration neither duplicates tenant records nor deletes legacy resources');
});
