import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import express from 'express';
import cookieParser from 'cookie-parser';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createPrivateUploadRouter } from '../middleware/privateUploadRouter.js';
import apiRoutes from '../routes/index.js';
import { errorHandler, notFoundHandler } from '../middleware/errorHandler.js';
import { signAccessToken } from '../utils/tokens.js';
import { User } from '../models/User.js';
import { Institution } from '../models/Institution.js';
import { Membership } from '../models/Membership.js';
import { Question } from '../models/Question.js';
import { QuestionBank } from '../models/QuestionBank.js';
import { Paper } from '../models/Paper.js';
import { OnlineTest } from '../models/OnlineTest.js';
import { Upload } from '../models/Upload.js';
import { TestAttempt } from '../models/TestAttempt.js';
import { InstitutionInvitation } from '../models/InstitutionInvitation.js';

const uri = process.env.MONGODB_TEST_URI;
const testOnlyUri = (value) => {
  try {
    const database = new URL(value).pathname.replace(/^\//, '');
    return /^examforge_test(?:_|$)/i.test(database);
  } catch { return false; }
};
const isolatedTestUri = (value) => { const parsed = new URL(value); parsed.pathname = `${parsed.pathname.replace(/\/$/, '')}_tenant_http`; return parsed.toString(); };

test('two-tenant HTTP isolation matrix uses real auth, routes, services, and MongoDB', {
  skip: !uri ? 'Set MONGODB_TEST_URI to a dedicated isolated test database.' : false,
}, async (t) => {
  assert.ok(testOnlyUri(uri), 'MONGODB_TEST_URI database name must begin with examforge_test; refusing to touch another database.');
  await mongoose.connect(isolatedTestUri(uri));
  await mongoose.connection.dropDatabase();
  t.after(async () => { await mongoose.connection.dropDatabase(); await mongoose.disconnect(); });

  const institutions = await Institution.create([
    { name: 'Demo School', slug: 'demo-school-test', type: 'SCHOOL', status: 'ACTIVE' },
    { name: 'Demo College', slug: 'demo-college-test', type: 'COLLEGE', status: 'ACTIVE' },
  ]);
  const [school, college] = institutions;
  const users = {};
  for (const [key, institution, role] of [
    ['schoolAdmin', school, 'faculty'], ['schoolFaculty', school, 'faculty'], ['schoolStudent', school, 'student'],
    ['collegeAdmin', college, 'faculty'], ['collegeFaculty', college, 'faculty'], ['collegeStudent', college, 'student'],
  ]) {
    const user = await User.create({ email: `${key}@example.test`, fullName: key, role, passwordHash: 'integration-test-hash', defaultInstitutionId: institution._id, isActive: true });
    users[key] = user;
    await Membership.create({ userId: user._id, institutionId: institution._id, role: key.endsWith('Admin') ? 'INSTITUTION_ADMIN' : role.toUpperCase(), status: 'ACTIVE' });
  }

  const resources = {};
  for (const [key, institution, faculty, student] of [
    ['school', school, users.schoolFaculty, users.schoolStudent],
    ['college', college, users.collegeFaculty, users.collegeStudent],
  ]) {
    const question = await Question.create({
      questionText: `${key} private question`, questionType: 'MCQ_SINGLE', class: 10,
      status: 'approved', createdBy: faculty._id, ownerId: faculty._id, institutionId: institution._id,
      isPrivate: false, visibility: 'institution', options: [{ text: 'one' }, { text: 'two' }], correctOption: 0,
    });
    const bank = await QuestionBank.create({ name: `${key} bank`, type: 'institution', visibility: 'institution', institutionId: institution._id, createdBy: faculty._id });
    question.bankIds = [bank._id];
    await question.save();
    const paper = await Paper.create({
      title: `${key} paper`, paperCode: `${key.toUpperCase()}-TEST`, class: 10, totalMarks: 2, totalQuestions: 1,
      createdBy: faculty._id, institutionId: institution._id, status: 'published',
      questions: [{ questionId: question._id, questionOrder: 0, customMarks: 2 }],
    });
    const exam = await OnlineTest.create({
      paperId: paper._id, testCode: `${key.toUpperCase()}-EXAM`, durationMinutes: 30,
      createdBy: faculty._id, institutionId: institution._id, status: 'active',
      isPublic: true, showAnswers: false, allowReview: true,
    });
    const attempt = await TestAttempt.create({
      testId: exam._id, userId: student._id, institutionId: institution._id,
      status: 'submitted', attemptNumber: 1, answers: [{ questionId: question._id, selectedOption: 0, isCorrect: true }],
    });
    const upload = await Upload.create({
      filename: `${key}-fixture.docx`, originalName: `${key}-fixture.docx`, filePath: `/uploads/documents/${key}-fixture.docx`,
      fileType: 'docx', uploadedBy: faculty._id, institutionId: institution._id,
    });
    resources[key] = { institution, faculty, student, question, bank, paper, exam, attempt, upload };
  }

  const app = express();
  const uploadRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'examforge-tenant-test-'));
  await fs.mkdir(path.join(uploadRoot, 'documents'), { recursive: true });
  await fs.writeFile(path.join(uploadRoot, 'documents', 'school-fixture.docx'), 'school-private-fixture');
  await fs.writeFile(path.join(uploadRoot, 'documents', 'college-fixture.docx'), 'college-private-fixture');
  t.after(() => fs.rm(uploadRoot, { recursive: true, force: true }));
  app.use(express.json());
  app.use(cookieParser());
  app.use('/uploads', createPrivateUploadRouter(uploadRoot));
  app.use('/api', apiRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, () => resolve(listener));
  });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}/api`;

  async function request(resource, user, method, route, body) {
    const response = await fetch(`${base}${route}`, {
      method,
      headers: {
        Authorization: `Bearer ${signAccessToken(user._id.toString())}`,
        'X-Institution-Id': resource.institution._id.toString(),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  }

  for (const [key, owner, outsider] of [['school', resources.school, resources.college], ['college', resources.college, resources.school]]) {
    const ownQuestion = await request(owner, owner.faculty, 'GET', `/questions/${owner.question._id}`);
    assert.equal(ownQuestion.status, 200, `${key} can read own question`);
    const ownBank = await request(owner, owner.faculty, 'GET', `/question-banks/${owner.bank._id}`);
    assert.equal(ownBank.status, 200, `${key} can read own bank`);
    const ownPaper = await request(owner, owner.faculty, 'GET', `/papers/${owner.paper._id}`);
    assert.equal(ownPaper.status, 200, `${key} can read own paper`);
    const ownExam = await request(owner, owner.student, 'GET', `/tests/${owner.exam._id}`);
    assert.equal(ownExam.status, 200, `${key} student can read own active exam`);
    const ownUpload = await request(owner, owner.faculty, 'GET', `/uploads/${owner.upload._id}`);
    assert.equal(ownUpload.status, 200, `${key} faculty can read own upload`);
    const ownFile = await fetch(`http://127.0.0.1:${server.address().port}${owner.upload.filePath}`, {
      headers: { Authorization: `Bearer ${signAccessToken(owner.faculty._id.toString())}`, 'X-Institution-Id': owner.institution._id.toString() },
    });
    assert.equal(ownFile.status, 200, `${key} faculty can read own private file`);
    const crossFile = await fetch(`http://127.0.0.1:${server.address().port}${outsider.upload.filePath}`, {
      headers: { Authorization: `Bearer ${signAccessToken(owner.faculty._id.toString())}`, 'X-Institution-Id': owner.institution._id.toString() },
    });
    assert.equal(crossFile.status, 404, `${key} cannot read another institution's file path`);

    for (const [method, route, body] of [
      ['GET', `/questions/${outsider.question._id}`],
      ['PATCH', `/questions/${outsider.question._id}`, { questionText: 'attempted cross-tenant write' }],
      ['DELETE', `/questions/${outsider.question._id}`],
      ['GET', `/question-banks/${outsider.bank._id}`],
      ['PATCH', `/question-banks/${outsider.bank._id}`, { name: 'attempted cross-tenant write' }],
      ['GET', `/papers/${outsider.paper._id}`],
      ['PATCH', `/papers/${outsider.paper._id}`, { title: 'attempted cross-tenant write' }],
      ['DELETE', `/papers/${outsider.paper._id}`],
      ['GET', `/papers/${outsider.paper._id}/export/html`],
      ['GET', `/papers/${outsider.paper._id}/export/docx`],
      ['GET', `/tests/${outsider.exam._id}`],
      ['PATCH', `/tests/${outsider.exam._id}`, { status: 'completed' }],
      ['GET', `/tests/${outsider.exam._id}/attempts/${outsider.attempt._id}`],
      ['GET', `/uploads/${outsider.upload._id}`],
      ['GET', `/analytics/test/${outsider.exam._id}`],
      ['GET', `/leaderboard/tests/${outsider.exam._id}`],
    ]) {
      const denied = await request(owner, owner.faculty, method, route, body);
      assert.ok([403, 404].includes(denied.status), `${key} ${method} ${route} denied; got ${denied.status}`);
    }

    const filtered = await request(owner, owner.faculty, 'GET', `/questions?institutionId=${outsider.institution._id}&page=1&limit=100&sort_by=createdAt&sort_order=asc`);
    assert.equal(filtered.status, 200);
    assert.ok(filtered.body.data.items.every((item) => item.question_text?.includes(`${key} `) || item.questionText?.includes(`${key} `)), `${key} filters ignore a spoofed institutionId`);
    const crossAttemptList = await request(owner, owner.student, 'GET', `/tests/${outsider.exam._id}/attempts`);
    assert.equal(crossAttemptList.status, 200);
    assert.equal(crossAttemptList.body.data.length, 0, `${key} cannot enumerate another institution's attempts`);
    const crossQuestionPaperWrite = await request(owner, owner.faculty, 'PATCH', `/papers/${owner.paper._id}`, {
      questions: [{ questionId: outsider.question._id, questionOrder: 0, customMarks: 2 }],
    });
    assert.ok([400, 422].includes(crossQuestionPaperWrite.status), `${key} cannot add the other tenant's question to a paper`);
  }

  const raceExam = await OnlineTest.create({
    paperId: resources.school.paper._id, testCode: 'SCHOOL-RACE-EXAM', durationMinutes: 30,
    createdBy: resources.school.faculty._id, institutionId: school._id, status: 'active',
    isPublic: true, showAnswers: false, allowReview: true,
  });
  await TestAttempt.create({
    testId: raceExam._id, userId: resources.school.student._id, institutionId: school._id,
    status: 'in_progress', attemptNumber: 1, answers: [{ questionId: resources.school.question._id, selectedOption: 0 }],
  });
  const concurrentSubmissions = await Promise.all([
    request(resources.school, resources.school.student, 'POST', `/tests/${raceExam._id}/submit`, {}),
    request(resources.school, resources.school.student, 'POST', `/tests/${raceExam._id}/submit`, {}),
  ]);
  assert.ok(concurrentSubmissions.every((response) => [200, 409].includes(response.status)), 'concurrent duplicate submissions return the existing result or an in-progress conflict');
  const finalAttempts = await TestAttempt.find({ testId: raceExam._id, userId: resources.school.student._id, institutionId: school._id });
  assert.equal(finalAttempts.length, 1, 'atomic submit must retain exactly one attempt');
  assert.ok(['submitted', 'auto_submitted'].includes(finalAttempts[0].status), 'one request must finalize the attempt');
  assert.equal(finalAttempts[0].score, 2, 'the final score is written once and is consistent');

  const invite = await request(resources.school, users.schoolAdmin, 'POST', '/institutions/invitations', {
    email: 'new-faculty@example.test', role: 'FACULTY',
  });
  assert.equal(invite.status, 201, 'institution admin can invite faculty');
  assert.equal(invite.body.data.invitation.status, 'PENDING');
  assert.equal(Object.hasOwn(invite.body.data.invitation, 'tokenHash'), false, 'token hashes are not returned');
  const invitationToken = new URL(invite.body.data.developmentUrl).searchParams.get('token');
  const accepted = await request(resources.school, users.schoolAdmin, 'POST', '/auth/accept-invitation', {
    token: invitationToken, fullName: 'New Faculty', password: 'SecureInvite123!',
  });
  assert.equal(accepted.status, 200, 'invitee can create an account and accept the invitation');
  const invitedUser = await User.findOne({ email: 'new-faculty@example.test' });
  assert.equal((await Membership.findOne({ userId: invitedUser._id, institutionId: school._id })).status, 'ACTIVE');
  const duplicateAcceptance = await request(resources.school, users.schoolAdmin, 'POST', '/auth/accept-invitation', { token: invitationToken });
  assert.equal(duplicateAcceptance.status, 400, 'invitation token is single-use');

  const suspended = await request(resources.school, users.schoolAdmin, 'PATCH', `/institutions/members/${invitedUser._id}`, { status: 'SUSPENDED' });
  assert.equal(suspended.status, 200, 'institution admin can suspend a member');
  const suspendedAccess = await request(resources.school, invitedUser, 'GET', `/questions/${resources.school.question._id}`);
  assert.ok([403, 404].includes(suspendedAccess.status), 'suspended membership cannot use institution APIs');
  const reactivated = await request(resources.school, users.schoolAdmin, 'PATCH', `/institutions/members/${invitedUser._id}`, { status: 'ACTIVE' });
  assert.equal(reactivated.status, 200, 'institution admin can reactivate a member');
  const roleChanged = await request(resources.school, users.schoolAdmin, 'PATCH', `/institutions/members/${invitedUser._id}`, { role: 'STUDENT' });
  assert.equal(roleChanged.status, 200, 'institution admin can change the role when the account has no other institutional memberships');
  assert.equal((await User.findById(invitedUser._id)).role, 'student');
  await Membership.create({ userId: invitedUser._id, institutionId: college._id, role: 'STUDENT', status: 'ACTIVE' });
  const blockedMultiTenantRoleChange = await request(resources.school, users.schoolAdmin, 'PATCH', `/institutions/members/${invitedUser._id}`, { role: 'FACULTY' });
  assert.equal(blockedMultiTenantRoleChange.status, 409, 'role changes cannot silently alter a multi-institution account role');

  const facultyForbiddenInvite = await request(resources.school, resources.school.faculty, 'POST', '/institutions/invitations', {
    email: 'not-admin@example.test', role: 'STUDENT',
  });
  assert.equal(facultyForbiddenInvite.status, 403, 'faculty cannot invite members');
  const crossTenantMembers = await request(resources.college, users.collegeAdmin, 'GET', '/institutions/members');
  assert.equal(crossTenantMembers.status, 200, 'college admin can view college members');

  const studentInvite = await request(resources.school, users.schoolAdmin, 'POST', '/institutions/invitations', {
    email: 'new-student@example.test', role: 'STUDENT',
  });
  assert.equal(studentInvite.status, 201, 'institution admin can enroll a student by invitation');
  const studentToken = new URL(studentInvite.body.data.developmentUrl).searchParams.get('token');
  const studentAccepted = await request(resources.college, users.collegeStudent, 'POST', '/auth/accept-invitation', {
    token: studentToken, fullName: 'New Student', password: 'SecureInvite123!',
  });
  assert.equal(studentAccepted.status, 200, 'student can accept enrollment and create account');
  const newStudent = await User.findOne({ email: 'new-student@example.test' });
  assert.equal((await Membership.findOne({ userId: newStudent._id, institutionId: school._id })).status, 'ACTIVE');
  const studentCannotInvite = await request(resources.school, newStudent, 'POST', '/institutions/invitations', {
    email: 'student-invite@example.test', role: 'STUDENT',
  });
  assert.equal(studentCannotInvite.status, 403, 'student cannot invite members');
  assert.equal((await request(resources.school, newStudent, 'GET', '/institutions/members')).status, 403, 'student cannot view the member directory');
  assert.equal((await request(resources.school, newStudent, 'PATCH', `/institutions/members/${users.schoolFaculty._id}`, { role: 'FACULTY' })).status, 403, 'student cannot change another member role');

  const revokedInvite = await request(resources.school, users.schoolAdmin, 'POST', '/institutions/invitations', {
    email: 'revoked@example.test', role: 'STUDENT',
  });
  assert.equal(revokedInvite.status, 201);
  assert.equal((await request(resources.school, users.schoolAdmin, 'DELETE', `/institutions/invitations/${revokedInvite.body.data.invitation._id}`)).status, 200);
  const revokedToken = new URL(revokedInvite.body.data.developmentUrl).searchParams.get('token');
  assert.equal((await request(resources.school, users.schoolAdmin, 'POST', '/auth/accept-invitation', { token: revokedToken, fullName: 'Revoked User', password: 'SecureInvite123!' })).status, 400, 'revoked invitation cannot be accepted');

  const expiredInvite = await request(resources.school, users.schoolAdmin, 'POST', '/institutions/invitations', {
    email: 'expired@example.test', role: 'STUDENT',
  });
  await InstitutionInvitation.updateOne({ _id: expiredInvite.body.data.invitation._id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
  const expiredToken = new URL(expiredInvite.body.data.developmentUrl).searchParams.get('token');
  assert.equal((await request(resources.school, users.schoolAdmin, 'POST', '/auth/accept-invitation', { token: expiredToken, fullName: 'Expired User', password: 'SecureInvite123!' })).status, 400, 'expired invitation cannot be accepted');
  assert.equal((await InstitutionInvitation.findById(expiredInvite.body.data.invitation._id)).status, 'EXPIRED', 'expired invitation state is persisted');
});
