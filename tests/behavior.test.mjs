import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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
function neutralize(v) {
  const s = String(v ?? '');
  return /^[=+\-@\t\r\n]/.test(s) ? "'" + s : s;
}
function csv(rows) {
  return rows.map((r) => `"${neutralize(r.id).replace(/"/g, '""')}"`).join('\n');
}
function xml(s) {
  return neutralize(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c],
  );
}
function excelCol(n) {
  let s = '';
  for (let x = n + 1; x > 0; x = Math.floor((x - 1) / 26))
    s = String.fromCharCode(((x - 1) % 26) + 65) + s;
  return s;
}
function xlsx(rows) {
  const sheet = `<c r="${excelCol(23)}1"><t>${xml(rows[0].id)}</t></c>`;
  return new Blob([`xl/worksheets/sheet1.xml ${sheet}`]);
}
function aa(record, ownerMemberId) {
  const ids = record.memberIds;
  if (!ids.length) throw Object.assign(new Error('empty'), { status: 422, code: 'empty_members' });
  if (new Set(ids).size !== ids.length)
    throw Object.assign(new Error('dup'), { status: 422, code: 'duplicate_members' });
  const total = record.expenses.reduce((a, e) => a + e.amountCents, 0);
  for (const e of record.expenses)
    if (!ids.includes(e.payerMemberId))
      throw Object.assign(new Error('payer'), { status: 422, code: 'payer_not_participant' });
  const base = Math.floor(total / ids.length),
    rem = total % ids.length;
  if (rem && (!ownerMemberId || !ids.includes(ownerMemberId)))
    throw Object.assign(new Error('owner'), { status: 422, code: 'owner_not_participant' });
  const owner = ownerMemberId && ids.includes(ownerMemberId) ? ownerMemberId : ids[0];
  return {
    totalCents: total,
    baseShareCents: base,
    remainderCents: rem,
    remainderOwnerMemberId: owner,
  };
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

test('AA owner remainder behavior is enforced', () => {
  const r = {
    memberIds: ['owner', 'm2'],
    expenses: [{ amountCents: 101, payerMemberId: 'owner' }],
  };
  assert.equal(aa(r, 'owner').remainderOwnerMemberId, 'owner');
  assert.throws(() => aa(r, 'other'), /owner/);
  assert.equal(
    aa({ ...r, expenses: [{ amountCents: 100, payerMemberId: 'owner' }] }, 'other').remainderCents,
    0,
  );
});

test('CSV and XLSX neutralize formula-looking strings', async () => {
  const row = { id: '=cmd', routeName: '=cmd' };
  assert.match(csv([row]), /"'=cmd"/);
  const text = await xlsx([row]).text();
  assert.match(text, /xl\/worksheets\/sheet1.xml/);
  assert.match(text, /&apos;=cmd/);
  assert.match(text, /X1/);
});

test('source contains behavior-oriented auth/list safeguards', () => {
  const index = readFileSync('src/index.ts', 'utf8');
  const jwt = readFileSync('src/lib/jwt.ts', 'utf8');
  assert.match(index, /assertSameOrigin\(req\);\n\s+const t = await rotateRefresh/);
  assert.match(index, /p === '\/api\/logout'[\s\S]+revokeCurrentRefresh/);
  assert.match(index, /duplicate_user/);
  assert.match(index, /return \{\n\s+items,\n\s+nextCursor/);
  assert.match(jwt, /catch[\s\S]+invalid\(\)/);
  assert.match(jwt, /header\.alg !== 'EdDSA' \|\| header\.typ !== 'JWT'/);
});
