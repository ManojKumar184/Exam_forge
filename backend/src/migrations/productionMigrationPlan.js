export const REQUIRED_PRODUCTION_MIGRATIONS = Object.freeze([
  'institutions-v1',
  'predefined-templates-v1',
  'predefined-templates-v2',
  'question-banks-v1',
  'syllabus-seed-v1',
  'syllabus-mappings-v1',
  'question-sequence-v1',
  'workspace-question-ownership-v1',
  'question-marks-v1',
  'system-test-bank-v1',
  'question-taxonomy-v1',
  'question-taxonomy-v2',
  'question-groups-v1',
  'question-duplicate-policy-v1',
  'question-duplicate-policy-v2',
]);

export function findMissingMigrations(required, completedRows) {
  const complete = new Set(completedRows.filter((row) => row.status === 'completed').map((row) => row._id));
  return required.filter((id) => !complete.has(id));
}
