import test from 'node:test';
import assert from 'node:assert/strict';
import { Membership } from '../models/Membership.js';
import { Institution } from '../models/Institution.js';
import { resolveTenantContext } from './tenantContext.js';

const tenantId = '64b000000000000000000001';
const userId = '64b000000000000000000002';

test('tenant context accepts an institution explicitly covered by active membership', async (t) => {
  t.mock.method(Membership, 'findOne', () => ({ lean: async () => ({ role: 'FACULTY', institutionId: tenantId }) }));
  t.mock.method(Institution, 'findOne', () => ({ lean: async () => ({ _id: tenantId, status: 'ACTIVE' }) }));
  const req = { user: { _id: userId, role: 'faculty' }, get: () => tenantId };
  let error;
  await resolveTenantContext(req, {}, (value) => { error = value; });
  assert.equal(error, undefined);
  assert.equal(String(req.institutionId), tenantId);
  assert.equal(req.user.membershipRole, 'FACULTY');
});

test('tenant context hides another institution when membership is absent', async (t) => {
  t.mock.method(Membership, 'findOne', () => ({ lean: async () => null }));
  const req = { user: { _id: userId, role: 'faculty' }, get: () => tenantId };
  let error;
  await resolveTenantContext(req, {}, (value) => { error = value; });
  assert.equal(error?.statusCode, 404);
  assert.equal(req.institutionId, undefined);
});

test('super admin must explicitly select an institution before tenant routes can run', async (t) => {
  t.mock.method(Institution, 'findOne', () => ({ lean: async () => ({ _id: tenantId, status: 'ACTIVE' }) }));
  const req = { user: { _id: userId, role: 'super_admin' }, get: () => tenantId };
  let error;
  await resolveTenantContext(req, {}, (value) => { error = value; });
  assert.equal(error, undefined);
  assert.equal(String(req.institutionId), tenantId);
});
