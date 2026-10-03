import test from 'node:test';
import assert from 'node:assert/strict';
import { findMissingMigrations, REQUIRED_PRODUCTION_MIGRATIONS } from './productionMigrationPlan.js';

test('API startup requires each explicit production setup step to be recorded completed', () => {
  const done = REQUIRED_PRODUCTION_MIGRATIONS.slice(0, 3).map((_id, index) => ({ _id: REQUIRED_PRODUCTION_MIGRATIONS[index], status: 'completed' }));
  const failed = [{ _id: REQUIRED_PRODUCTION_MIGRATIONS[3], status: 'failed' }];
  assert.deepEqual(findMissingMigrations(REQUIRED_PRODUCTION_MIGRATIONS, [...done, ...failed]), REQUIRED_PRODUCTION_MIGRATIONS.slice(3));
  assert.deepEqual(findMissingMigrations(REQUIRED_PRODUCTION_MIGRATIONS, REQUIRED_PRODUCTION_MIGRATIONS.map((_id) => ({ _id, status: 'completed' }))), []);
});
