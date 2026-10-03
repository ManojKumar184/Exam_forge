import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { Institution } from '../models/Institution.js';
import { User } from '../models/User.js';
import { Membership } from '../models/Membership.js';
import { Question } from '../models/Question.js';
import { Paper } from '../models/Paper.js';
import { OnlineTest } from '../models/OnlineTest.js';
import { TestAttempt } from '../models/TestAttempt.js';
import { Upload } from '../models/Upload.js';
import { ExportPreset } from '../models/ExportPreset.js';
import * as exportPresetController from '../controllers/exportPresetController.js';
import { approveQuestion, bulkApprove, bulkUpdateMetadata, updateQuestion, validateQuestionForApproval } from '../services/questionService.js';
import { commitStagedQuestions, reprocessUpload } from '../services/uploadService.js';
import { claimNextEnrichmentQuestion } from '../jobs/enrichmentWorker.js';
import { startAttempt, getAttemptHistory, getLeaderboard, updateTest, autosaveAttempt, submitAttempt } from '../services/testService.js';
import { requestPasswordReset, resetPassword } from '../services/authService.js';

const configuredUri = process.env.MONGODB_TEST_URI;
const isolatedUri = configuredUri ? (() => { const parsed = new URL(configuredUri); parsed.pathname += '_production_blockers'; return parsed.toString(); })() : null;

test('production blocker regression suite uses isolated MongoDB', { skip: !isolatedUri ? 'Set MONGODB_TEST_URI to a dedicated test database.' : false }, async (t) => {
  assert.match(new URL(isolatedUri).pathname, /^\/examforge_test/i, 'refusing to use a non-test database');
  await mongoose.connect(isolatedUri);
  await mongoose.connection.dropDatabase();
  t.after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });

  const institution = await Institution.create({ name: 'Blocker Test Institution', slug: 'blocker-test', type: 'SCHOOL', status: 'ACTIVE' });
  const makeUser = async (name, role, memberRole) => {
    const user = await User.create({ email: `${name}@example.test`, fullName: name, role, passwordHash: 'test-hash', defaultInstitutionId: institution._id, isActive: true });
    await Membership.create({ userId: user._id, institutionId: institution._id, role: memberRole, status: 'ACTIVE' });
    return user;
  };
  const faculty = await makeUser('owner', 'faculty', 'FACULTY');
  const otherFaculty = await makeUser('other-faculty', 'faculty', 'FACULTY');
  const student = await makeUser('student', 'student', 'STUDENT');
  const outsider = await makeUser('outsider', 'student', 'STUDENT');
  const context = { role: faculty.role, _id: faculty._id, activeInstitutionId: institution._id, defaultInstitutionId: institution._id };

  const resetRequest = await requestPasswordReset(faculty.email);
  assert.equal(resetRequest.message, 'If that email exists, a reset link was sent');
  const storedReset = await User.findById(faculty._id).select('+passwordResetToken +passwordResetExpires');
  assert.ok(storedReset.passwordResetExpires > new Date());
  assert.notEqual(storedReset.passwordResetToken, resetRequest.resetToken, 'only a hash is stored');
  await resetPassword({ token: resetRequest.resetToken, password: 'Replacement-password-123!' });
  await assert.rejects(resetPassword({ token: resetRequest.resetToken, password: 'Another-password-123!' }), { code: 'INVALID_RESET_TOKEN' });

  const mappedQuestion = {
    questionText: 'Select the true statement.', questionType: 'MCQ_SINGLE', class: 10,
    status: 'pending', createdBy: faculty._id, ownerId: faculty._id, institutionId: institution._id,
    options: [{ text: 'True' }, { text: 'False' }], correctOption: 0,
    syllabusMappings: [{ subjectId: new mongoose.Types.ObjectId(), examPatternId: new mongoose.Types.ObjectId() }],
  };
  const approved = await Question.create(mappedQuestion);
  await approveQuestion(approved._id, context);
  assert.equal((await Question.findById(approved._id)).status, 'approved', 'supported objective question passes canonical approval');
  assert.throws(() => validateQuestionForApproval({ ...mappedQuestion, questionType: 'DESCRIPTIVE' }), { code: 'UNSUPPORTED_QUESTION_TYPE' });
  const pendingUpdateTarget = await Question.create({ ...mappedQuestion, questionText: 'Keep this pending question.', questionType: 'UNCLASSIFIED', serialId: 81100, semanticEnriched: true });
  await updateQuestion(pendingUpdateTarget._id, { status: 'approved', owner_id: outsider._id.toString(), created_by: outsider._id.toString() }, context);
  const afterUntrustedUpdate = await Question.findById(pendingUpdateTarget._id);
  assert.equal(afterUntrustedUpdate.status, 'pending');
  assert.equal(afterUntrustedUpdate.ownerId.toString(), faculty._id.toString());
  assert.equal(afterUntrustedUpdate.createdBy.toString(), faculty._id.toString());
  assert.equal((await bulkUpdateMetadata([pendingUpdateTarget._id], { status: 'approved' }, context)).modified, 0);
  await assert.rejects(bulkApprove([pendingUpdateTarget._id], context), { code: 'UNSUPPORTED_QUESTION_TYPE' });
  assert.equal((await Question.findById(pendingUpdateTarget._id)).status, 'pending');

  const staged = await Upload.create({ filename: 'staged.docx', originalName: 'staged.docx', filePath: '/tmp/staged.docx', fileType: 'docx', uploadedBy: faculty._id, institutionId: institution._id,
    stagedQuestions: [{ questionText: 'Explain why the sky is blue.', questionType: 'DESCRIPTIVE', class: 10 }, { questionText: 'A pending MCQ question', questionType: 'MCQ_SINGLE', class: 10, syllabusMappings: [] }] });
  const beforeCommit = await Question.countDocuments();
  await commitStagedQuestions(staged._id, [0, 1], context);
  assert.equal(await Question.countDocuments(), beforeCommit, 'unsupported and incomplete staged records do not create approved Questions');
  assert.equal((await Upload.findById(staged._id)).questionsApproved, 0);

  const paper = await Paper.create({ title: 'Referenced Paper', paperCode: 'BLOCKER-PAPER', class: 10, totalMarks: 2, totalQuestions: 1, createdBy: faculty._id, institutionId: institution._id, questions: [{ questionId: approved._id, questionOrder: 0, customMarks: 2 }] });
  const upload = await Upload.create({ filename: 'reprocess.docx', originalName: 'reprocess.docx', filePath: '/tmp/reprocess.docx', fileType: 'docx', uploadedBy: faculty._id, institutionId: institution._id, extractedQuestionIds: [approved._id] });
  await Promise.all([reprocessUpload(upload._id, context), reprocessUpload(upload._id, context)]);
  assert.ok(await Question.exists({ _id: approved._id }), 'canonical Question survives repeated reprocessing');
  assert.ok(await Paper.exists({ _id: paper._id, 'questions.questionId': approved._id }), 'Paper reference remains valid');

  const enrichmentCandidate = await Question.create({ ...mappedQuestion, questionText: 'Unenriched question', serialId: 81101, status: 'pending', semanticEnriched: false });
  const claims = await Promise.all([claimNextEnrichmentQuestion('worker-a'), claimNextEnrichmentQuestion('worker-b')]);
  assert.equal(claims.filter(Boolean).length, 1, 'two workers produce only one successful atomic claim');
  assert.equal(claims.find(Boolean).question._id.toString(), enrichmentCandidate._id.toString());
  await Question.updateOne({ _id: enrichmentCandidate._id }, { $set: { enrichmentAttempts: 3, enrichmentClaimedAt: new Date(Date.now() - 6 * 60_000) } });
  const recovered = await claimNextEnrichmentQuestion('recovery-worker');
  assert.equal(recovered.question._id.toString(), enrichmentCandidate._id.toString(), 'stale claims can be recovered after worker crash');

  const testDoc = await OnlineTest.create({ paperId: paper._id, testCode: 'BLOCKER-EXAM', durationMinutes: 30, maxAttempts: 1, createdBy: faculty._id, institutionId: institution._id, status: 'active', isPublic: true });
  const starters = await Promise.all([startAttempt(testDoc._id, { ...student.toObject(), activeInstitutionId: institution._id }), startAttempt(testDoc._id, { ...student.toObject(), activeInstitutionId: institution._id })]);
  assert.equal(starters[0].attempt.id, starters[1].attempt.id, 'concurrent starts reuse the same in-progress attempt');
  assert.equal(await TestAttempt.countDocuments({ testId: testDoc._id, userId: student._id }), 1);
  await assert.rejects(startAttempt(testDoc._id, { ...student.toObject(), activeInstitutionId: institution._id }), { code: 'MAX_ATTEMPTS_REACHED' });
  const history = await getAttemptHistory({ ...otherFaculty.toObject(), activeInstitutionId: institution._id });
  assert.equal(history.length, 0, 'faculty cannot list another faculty owner’s attempts');
  const privateTest = await OnlineTest.create({ paperId: paper._id, testCode: 'BLOCKER-PRIVATE', durationMinutes: 30, createdBy: faculty._id, institutionId: institution._id, status: 'active', isPublic: false, allowedUsers: [student._id] });
  await assert.rejects(getLeaderboard(privateTest._id, { ...outsider.toObject(), activeInstitutionId: institution._id }), { code: 'NOT_FOUND' });

  await assert.rejects(updateTest(privateTest._id, { allowed_users: [faculty._id.toString()] }, context), { code: 'INVALID_ALLOWED_USERS' });
  await assert.rejects(updateTest(privateTest._id, { allowed_users: [new mongoose.Types.ObjectId().toString()] }, context), { code: 'INVALID_ALLOWED_USERS' });
  await updateTest(privateTest._id, { allowed_users: [student._id.toString()] }, context);

  const tenantB = await Institution.create({ name: 'Second Institution', slug: 'blocker-test-b', type: 'SCHOOL', status: 'ACTIVE' });
  const tenantBStudent = await User.create({ email: 'tenant-b-student@example.test', fullName: 'Tenant B Student', role: 'student', passwordHash: 'test-hash', defaultInstitutionId: tenantB._id, isActive: true });
  await Membership.create({ userId: tenantBStudent._id, institutionId: tenantB._id, role: 'STUDENT', status: 'ACTIVE' });
  await assert.rejects(updateTest(privateTest._id, { allowed_users: [tenantBStudent._id.toString()] }, context), { code: 'INVALID_ALLOWED_USERS' });
  const presetA = await ExportPreset.create({ name: 'A preset', institutionId: institution._id, createdBy: faculty._id });
  const presetB = await ExportPreset.create({ name: 'B preset', institutionId: tenantB._id, createdBy: otherFaculty._id });
  const capture = () => ({ statusCode: 200, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
  const presetRequest = { user: { _id: faculty._id }, institutionId: institution._id, body: { name: 'Spoofed tenant', institutionId: tenantB._id } };
  const createdResponse = capture();
  await exportPresetController.create(presetRequest, createdResponse);
  const createdPresetId = createdResponse.body.data._id.toString();
  assert.equal(createdResponse.body.data.institutionId.toString(), institution._id.toString(), 'create ignores client-supplied institutionId');
  const listResponse = capture();
  await exportPresetController.list(presetRequest, listResponse);
  assert.ok(listResponse.body.data.some((preset) => preset._id.toString() === presetA._id.toString()));
  assert.ok(listResponse.body.data.every((preset) => preset.institutionId.toString() === institution._id.toString()));
  const crossRequest = { ...presetRequest, params: { id: presetB._id.toString() }, body: { name: 'Hijacked' } };
  const crossGet = capture();
  await exportPresetController.getOne(crossRequest, crossGet);
  assert.equal(crossGet.statusCode, 404, 'tenant A cannot get tenant B preset by ID');
  const crossUpdate = capture();
  await exportPresetController.update(crossRequest, crossUpdate);
  assert.equal(crossUpdate.statusCode, 404, 'tenant A cannot update tenant B preset');
  const crossDelete = capture();
  await exportPresetController.remove(crossRequest, crossDelete);
  assert.equal(crossDelete.statusCode, 404, 'tenant A cannot delete tenant B preset');
  assert.equal((await ExportPreset.findById(presetB._id)).name, 'B preset');
  assert.equal(await ExportPreset.countDocuments({ institutionId: institution._id, createdBy: faculty._id }), 2);
  assert.ok(await ExportPreset.findById(createdPresetId));

  // Validator and full autosave/submission/scoring coverage for MCQ_MULTIPLE.
  const { autosaveSchema } = await import('../validators/testValidators.js');
  assert.equal(autosaveSchema.safeParse({ answers: [{ question_id: approved._id.toString(), selected_options: [0, 1] }] }).success, true);
  const multiQuestion = await Question.create({ ...mappedQuestion, questionText: 'Choose both correct answers.', questionType: 'MCQ_MULTIPLE', correctAnswers: ['A', 'B'], serialId: 81102, status: 'approved' });
  const multiPaper = await Paper.create({ title: 'Multiple Paper', paperCode: 'BLOCKER-MULTI-PAPER', class: 10, totalMarks: 2, totalQuestions: 1, createdBy: faculty._id, institutionId: institution._id, questions: [{ questionId: multiQuestion._id, questionOrder: 0, customMarks: 2 }] });
  const multiTest = await OnlineTest.create({ paperId: multiPaper._id, testCode: 'BLOCKER-MULTI', durationMinutes: 30, createdBy: faculty._id, institutionId: institution._id, status: 'active' });
  const multiAttempt = await startAttempt(multiTest._id, { ...student.toObject(), activeInstitutionId: institution._id });
  await autosaveAttempt(multiTest._id, { ...student.toObject(), activeInstitutionId: institution._id }, { answers: [{ question_id: multiQuestion._id.toString(), selected_options: [0, 1] }] });
  const submitted = await submitAttempt(multiTest._id, { ...student.toObject(), activeInstitutionId: institution._id });
  assert.deepEqual(submitted.answers[0].selected_options, [0, 1]);
  assert.equal(submitted.score, 2);
});
