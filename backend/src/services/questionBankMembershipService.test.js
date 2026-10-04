import test from 'node:test';
import assert from 'node:assert/strict';
import { buildQuestionBankAccessFilter } from './questionBankMembershipService.js';

test('faculty can select public system banks while private system banks remain excluded', () => {
  const institutionId = 'institution-a';
  const userId = 'faculty-a';
  const filter = buildQuestionBankAccessFilter({
    role: 'faculty', _id: userId, activeInstitutionId: institutionId, membershipRole: 'FACULTY',
  });

  assert.ok(filter.$or.some((clause) => clause.type === 'system' && clause.visibility === 'public'));
  assert.ok(filter.$or.some((clause) => clause.institutionId === institutionId && clause.createdBy === userId));
  assert.ok(!filter.$or.some((clause) => clause.type === 'system' && clause.visibility === undefined));
});

test('institution administrators can select public system and their own institution banks', () => {
  const institutionId = 'institution-a';
  const filter = buildQuestionBankAccessFilter({
    role: 'faculty', _id: 'admin-a', activeInstitutionId: institutionId, membershipRole: 'INSTITUTION_ADMIN',
  });

  assert.ok(filter.$or.some((clause) => clause.type === 'system' && clause.visibility === 'public'));
  assert.ok(filter.$or.some((clause) => clause.institutionId === institutionId && clause.type === 'institution' && clause.visibility === 'institution'));
});

test('System Test Bank is super-admin-only while hidden and faculty-selectable when visible', () => {
  const faculty = { role: 'faculty', membershipRole: 'FACULTY', activeInstitutionId: 'institution-a' };
  const accessFilter = buildQuestionBankAccessFilter(faculty);
  assert.ok(accessFilter.$or.some((clause) => clause.type === 'system_test' && clause.visibleToFaculty === true), 'MongoDB must only match the persisted visible state');
  const adminFilter = buildQuestionBankAccessFilter({ role: 'faculty', membershipRole: 'INSTITUTION_ADMIN', activeInstitutionId: 'institution-a' });
  assert.ok(!adminFilter.$or.some((clause) => clause.type === 'system_test'));
});

test('platform administrators retain access to all system banks and active-tenant banks', () => {
  const institutionId = 'institution-a';
  const filter = buildQuestionBankAccessFilter({ role: 'super_admin', activeInstitutionId: institutionId });

  assert.ok(filter.$or.some((clause) => clause.type?.$in?.includes('system') && clause.type.$in.includes('system_test')));
  assert.ok(filter.$or.some((clause) => clause.institutionId === institutionId));
});

test('non-admins without an authorized institution cannot select private tenant banks', () => {
  const filter = buildQuestionBankAccessFilter({ role: 'faculty', _id: 'faculty-a', membershipRole: 'FACULTY' });

  assert.deepEqual(filter.$or, [
    { type: 'system', visibility: 'public' },
    { type: 'system_test', visibleToFaculty: true },
  ]);
});
