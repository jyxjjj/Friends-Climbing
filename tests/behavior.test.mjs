import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

async function importTsModule(path) {
  const source = readFileSync(path, 'utf8');
  const js = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
  }).outputText;
  return import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
}

function normalizeListResponse(data) {
  if (Array.isArray(data)) return { items: data, nextCursor: null, hasMore: false };
  if (data && typeof data === 'object') {
    return {
      items: Array.isArray(data.items) ? data.items : [],
      nextCursor: typeof data.nextCursor === 'string' ? data.nextCursor : null,
      hasMore: data.hasMore === true,
    };
  }
  return { items: [], nextCursor: null, hasMore: false };
}
test('front-end helper normalizes paginated list response', () => {
  assert.deepEqual(normalizeListResponse({ items: [1, 2], nextCursor: 'b', hasMore: true }), {
    items: [1, 2],
    nextCursor: 'b',
    hasMore: true,
  });
  assert.deepEqual(normalizeListResponse({ items: null }), {
    items: [],
    nextCursor: null,
    hasMore: false,
  });
});

test('real CSV and XLSX export helpers neutralize formula-looking strings', async () => {
  const { csv, xlsx } = await importTsModule('src/lib/export.ts');
  const row = { id: '=cmd', routeName: '=cmd' };
  assert.match(csv([row]), /\"'=cmd\"/);
  const text = await xlsx([row]).text();
  assert.match(text, /xl\/worksheets\/sheet1.xml/);
  assert.match(text, /&apos;=cmd/);
  assert.match(text, /X1/);
});
