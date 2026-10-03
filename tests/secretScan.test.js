import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const credentialPattern = new RegExp(`(?:${['nva', 'pi-'].join('')}[A-Za-z0-9_-]{20,}|${['s', 'k-'].join('')}[A-Za-z0-9]{20,})`);

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesIn(fullPath));
    else if (!entry.name.endsWith('.lock')) files.push(fullPath);
  }
  return files;
}

test('working tree contains no hard-coded NVIDIA/API credential-like tokens', async () => {
  const matches = [];
  for (const file of await filesIn(root)) {
    const content = await readFile(file, 'utf8').catch(() => '');
    if (credentialPattern.test(content)) matches.push(path.relative(root, file));
  }
  assert.deepEqual(matches, [], 'credential-like token found; do not print its value');
  const nvidiaTest = await readFile(path.join(root, 'tests/nvidia_fast_test.mjs'), 'utf8');
  assert.match(nvidiaTest, /process\.env\.NVIDIA_API_KEY/);
});
