import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const index = readFileSync('src/index.ts', 'utf8');
const stats = readFileSync('src/lib/stats.ts', 'utf8');
const exp = readFileSync('src/lib/export.ts', 'utf8');
const session = readFileSync('src/lib/session.ts', 'utf8');
const workflow = readFileSync('.github/workflows/deploy.yml', 'utf8');

test('workflow is manual only and runs checks', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /push:\s*\n\s*branches:/);
  for (const cmd of [
    'npm ci --ignore-scripts',
    'npm audit --audit-level=high',
    'npm run typecheck',
    'npm test',
    'npm run format:check',
  ])
    assert.ok(workflow.includes(cmd));
});

test('auth uses jwt access and refresh cookies without legacy session kv renewal', () => {
  assert.match(session, /__Host-access_token/);
  assert.match(session, /__Host-refresh_token/);
  assert.match(readFileSync('src/lib/jwt.ts', 'utf8'), /alg: 'EdDSA'/);
  assert.doesNotMatch(session, /sessions:/);
  assert.match(session, /refreshSessions:/);
});

test('aa algorithm uses floor share and owner remainder', () => {
  assert.match(stats, /Math\.floor\(total \/ ids\.length\)/);
  assert.match(stats, /remainderOwnerMemberId/);
  assert.match(stats, /payer_not_participant/);
  assert.match(stats, /duplicate_members/);
});

test('export has fixed csv columns, formula protection and real xlsx zip', () => {
  assert.match(exp, /RECORD_COLUMNS/);
  assert.match(exp, /\^\[=\+\\-@\\t\\r\\n\]/);
  assert.match(exp, /0x04034b50/);
  assert.doesNotMatch(exp, /<table>/);
});

test('validation and upload protections are present', () => {
  assert.match(index, /magic\(f, ct\)/);
  assert.match(index, /MAX_FILES/);
  assert.match(index, /written\.map\(\(k\) => env\.CLIMB_IMAGES\.delete\(k\)\)/);
  assert.match(index, /version_conflict/);
});

test('errors are sanitized', () => {
  assert.match(readFileSync('src/lib/errors.ts', 'utf8'), /服务器暂时不可用/);
  assert.doesNotMatch(index, /e\.message \|\| '服务器错误'/);
});
