import test from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  readdirSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function transpileTree() {
  const out = mkdtempSync(join(tmpdir(), 'fc-worker-'));
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.ts')) {
        const rel = relative('src', p).replace(/\.ts$/, '.mjs');
        const dest = join(out, rel);
        mkdirSync(join(dest, '..'), { recursive: true });
        let js = ts.transpileModule(readFileSync(p, 'utf8'), {
          compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 },
        }).outputText;
        js = js
          .replace(/from '([^']+)'/g, (_, spec) => `from '${spec}.mjs'`)
          .replace(/from "([^"]+)"/g, (_, spec) => `from "${spec}.mjs"`);
        writeFileSync(dest, js);
      }
    }
  };
  walk('src');
  return out;
}
async function importWorker() {
  const dir = transpileTree();
  const mod = await import(pathToFileURL(join(dir, 'index.mjs')) + '?t=' + Date.now());
  return { worker: mod.default, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
class FakeKV {
  constructor(fail = () => false) {
    this.m = new Map();
    this.fail = fail;
  }
  async get(k, type) {
    const v = this.m.get(k);
    if (v == null) return null;
    return type === 'json' ? JSON.parse(v) : v;
  }
  async put(k, v) {
    if (this.fail(k)) throw new Error('fake put failure ' + k);
    this.m.set(k, String(v));
  }
  async delete(k) {
    this.m.delete(k);
  }
  async list({ prefix = '', cursor, limit = 1000 } = {}) {
    const keys = [...this.m.keys()].filter((k) => k.startsWith(prefix)).sort();
    const start = cursor ? Number(cursor) : 0;
    const page = keys.slice(start, start + limit);
    return {
      keys: page.map((name) => ({ name })),
      list_complete: start + limit >= keys.length,
      cursor: start + limit < keys.length ? String(start + limit) : undefined,
    };
  }
}
class FakeR2 {
  constructor() {
    this.m = new Map();
  }
  async put(k, v, opts) {
    this.m.set(k, { body: v, ...opts });
  }
  async get(k) {
    const o = this.m.get(k);
    return (
      o && {
        ...o,
        arrayBuffer: async () =>
          typeof o.body === 'string'
            ? new TextEncoder().encode(o.body).buffer
            : await new Response(o.body).arrayBuffer(),
      }
    );
  }
  async delete(k) {
    this.m.delete(k);
  }
}
async function keys() {
  return crypto.subtle.generateKey('Ed25519', true, ['sign', 'verify']).then(async (k) => ({
    priv: JSON.stringify(await crypto.subtle.exportKey('jwk', k.privateKey)),
    pub: JSON.stringify(await crypto.subtle.exportKey('jwk', k.publicKey)),
  }));
}
async function env(kv = new FakeKV()) {
  const k = await keys();
  return {
    CLIMB_KV: kv,
    CLIMB_IMAGES: new FakeR2(),
    JWT_ED25519_PRIVATE_JWK: k.priv,
    JWT_ED25519_PUBLIC_JWK: k.pub,
    JWT_KEY_ID: 'test-kid',
  };
}
async function json(res) {
  const j = await res.json();
  return j && Object.prototype.hasOwnProperty.call(j, 'data') ? j.data : j;
}
function cookie(res, name) {
  return res.headers.getSetCookie().find((x) => x.startsWith(name + '='));
}
function req(path, opts = {}) {
  return new Request('https://app.test' + path, {
    ...opts,
    headers: { Origin: 'https://app.test', ...(opts.headers || {}) },
  });
}
async function setup() {
  const { worker, cleanup } = await importWorker();
  const e = await env();
  await worker.fetch(
    req('/api/init-owner', {
      method: 'POST',
      body: JSON.stringify({ username: 'owner1', password: 'password12345' }),
    }),
    e,
  );
  const login = await worker.fetch(
    req('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username: 'owner1', password: 'password12345' }),
    }),
    e,
  );
  const cookies = login.headers
    .getSetCookie()
    .map((x) => x.split(';')[0])
    .join('; ');
  return { worker, env: e, cookies, cleanup };
}

test('GET / returns random CSP nonce wired to script tag', async () => {
  const { worker, cleanup } = await importWorker();
  const e = await env();
  try {
    const a = await worker.fetch(new Request('https://app.test/'), e);
    const b = await worker.fetch(new Request('https://app.test/'), e);
    const ta = await a.text(),
      tb = await b.text();
    const na = /nonce-([^' ;]+)/.exec(a.headers.get('Content-Security-Policy'))[1];
    const nb = /nonce-([^' ;]+)/.exec(b.headers.get('Content-Security-Policy'))[1];
    assert.match(ta, new RegExp(`<script nonce="${na}"`));
    assert.notEqual(na, nb);
    assert.notEqual(ta, tb);
  } finally {
    cleanup();
  }
});

test('/api/refresh without Origin is 403 and malformed JWT is 401 not 500', async () => {
  const { worker, cleanup } = await importWorker();
  const e = await env();
  try {
    assert.equal(
      (await worker.fetch(new Request('https://app.test/api/refresh', { method: 'POST' }), e))
        .status,
      403,
    );
    const r = await worker.fetch(
      req('/api/me', { headers: { Cookie: '__Host-access_token=bad.jwt.token' } }),
      e,
    );
    assert.equal(r.status, 401);
  } finally {
    cleanup();
  }
});

test('logout with only refresh cookie clears cookies and revokes session', async () => {
  const s = await setup();
  try {
    const refresh = cookie(
      await s.worker.fetch(
        req('/api/login', {
          method: 'POST',
          body: JSON.stringify({ username: 'owner1', password: 'password12345' }),
        }),
        s.env,
      ),
      '__Host-refresh_token',
    );
    const r = await s.worker.fetch(
      req('/api/logout', { method: 'POST', headers: { Cookie: refresh.split(';')[0] } }),
      s.env,
    );
    assert.equal(r.status, 200);
    assert.equal(r.headers.getSetCookie().length, 2);
    const sessions = [...s.env.CLIMB_KV.m.keys()]
      .filter((k) => k.startsWith('refreshSessions:'))
      .map((k) => JSON.parse(s.env.CLIMB_KV.m.get(k)));
    assert.ok(sessions.some((x) => x.revokedAt));
  } finally {
    s.cleanup();
  }
});

test('login big body returns 413', async () => {
  const { worker, cleanup } = await importWorker();
  const e = await env();
  try {
    const r = await worker.fetch(
      req('/api/login', {
        method: 'POST',
        headers: { 'Content-Length': '5000' },
        body: 'x'.repeat(5000),
      }),
      e,
    );
    assert.equal(r.status, 413);
  } finally {
    cleanup();
  }
});

test('duplicate user is 409 without overwrite or orphan member; lists are paginated and sanitized', async () => {
  const s = await setup();
  try {
    const body = JSON.stringify({
      username: 'bob1',
      password: 'password12345',
      role: 'Member',
      nickname: 'Bob',
    });
    const h = { Cookie: s.cookies };
    assert.equal(
      (await s.worker.fetch(req('/api/users', { method: 'POST', headers: h, body }), s.env)).status,
      200,
    );
    assert.equal(
      (
        await s.worker.fetch(
          req('/api/users', {
            method: 'POST',
            headers: h,
            body: JSON.stringify({
              username: 'bob1',
              password: 'password45678',
              role: 'Member',
              nickname: 'Evil',
            }),
          }),
          s.env,
        )
      ).status,
      409,
    );
    const users = await json(await s.worker.fetch(req('/api/users', { headers: h }), s.env));
    assert.ok(Array.isArray(users.items));
    assert.equal(typeof users.hasMore, 'boolean');
    assert.equal(users.items.find((u) => u.username === 'bob1').member.nickname, 'Bob');
    assert.equal(
      users.items.some((u) => 'passwordHash' in u),
      false,
    );
    assert.equal([...s.env.CLIMB_KV.m.keys()].filter((k) => k.startsWith('members:')).length, 2);
  } finally {
    s.cleanup();
  }
});

test('plans/records member validation, AA owner remainder, and XLSX export are real fetch behavior', async () => {
  const s = await setup();
  try {
    const h = { Cookie: s.cookies };
    assert.equal(
      (
        await s.worker.fetch(
          req('/api/plans', {
            method: 'POST',
            headers: h,
            body: JSON.stringify({ routeName: 'P', difficulty: '休闲', planDate: '2026-01-01' }),
          }),
          s.env,
        )
      ).status,
      422,
    );
    const mid = (await json(await s.worker.fetch(req('/api/me', { headers: h }), s.env))).memberId;
    assert.equal(
      (
        await s.worker.fetch(
          req('/api/plans', {
            method: 'POST',
            headers: h,
            body: JSON.stringify({
              routeName: 'P',
              difficulty: '休闲',
              planDate: '2026-01-01',
              memberIds: [mid],
            }),
          }),
          s.env,
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await s.worker.fetch(
          req('/api/records', {
            method: 'POST',
            headers: h,
            body: JSON.stringify({ routeName: 'R', difficulty: '休闲', date: '2026-01-02' }),
          }),
          s.env,
        )
      ).status,
      422,
    );
    const rec = await json(
      await s.worker.fetch(
        req('/api/records', {
          method: 'POST',
          headers: h,
          body: JSON.stringify({
            routeName: '=cmd',
            difficulty: '休闲',
            date: '2026-01-02',
            memberIds: [mid],
            expenses: [{ id: 'e1', category: '油费', amountCents: 101, payerMemberId: mid }],
          }),
        }),
        s.env,
      ),
    );
    assert.equal(
      (await s.worker.fetch(req('/api/records/' + rec.id + '/aa', { headers: h }), s.env)).status,
      200,
    );
    const otherUser = await json(
      await s.worker.fetch(
        req('/api/users', {
          method: 'POST',
          headers: h,
          body: JSON.stringify({
            username: 'other1',
            password: 'password12345',
            role: 'Member',
            nickname: 'Other',
          }),
        }),
        s.env,
      ),
    );
    const other = otherUser.memberId;
    const otherUser2 = await json(
      await s.worker.fetch(
        req('/api/users', {
          method: 'POST',
          headers: h,
          body: JSON.stringify({
            username: 'other2',
            password: 'password12345',
            role: 'Member',
            nickname: 'Other2',
          }),
        }),
        s.env,
      ),
    );
    const other2 = otherUser2.memberId;
    const bad = await json(
      await s.worker.fetch(
        req('/api/records', {
          method: 'POST',
          headers: h,
          body: JSON.stringify({
            routeName: 'bad',
            difficulty: '休闲',
            date: '2026-01-02',
            memberIds: [other, other2],
            expenses: [{ id: 'e1', category: '油费', amountCents: 101, payerMemberId: other }],
          }),
        }),
        s.env,
      ),
    );
    assert.equal(
      (await s.worker.fetch(req('/api/records/' + bad.id + '/aa', { headers: h }), s.env)).status,
      422,
    );
    const x = await (
      await s.worker.fetch(req('/api/export/all?format=xlsx', { headers: h }), s.env)
    ).text();
    assert.match(x, /xl\/worksheets\/sheet1.xml/);
    assert.match(x, /&apos;=cmd/);
  } finally {
    s.cleanup();
  }
});

test('user update protects last owner and password tokenVersion behavior', async () => {
  const s = await setup();
  try {
    const h = { Cookie: s.cookies };
    const owner = (
      await json(await s.worker.fetch(req('/api/users', { headers: h }), s.env))
    ).items.find((u) => u.username === 'owner1');
    assert.equal(
      (
        await s.worker.fetch(
          req('/api/users/owner1', {
            method: 'PUT',
            headers: h,
            body: JSON.stringify({ ...owner, role: 'Owner', disabled: true, password: '' }),
          }),
          s.env,
        )
      ).status,
      409,
    );
    assert.equal(
      (
        await s.worker.fetch(
          req('/api/users/owner1', {
            method: 'PUT',
            headers: h,
            body: JSON.stringify({ ...owner, role: 'Member', disabled: false, password: '' }),
          }),
          s.env,
        )
      ).status,
      409,
    );
    const before = JSON.parse(s.env.CLIMB_KV.m.get('users:owner1')).tokenVersion;
    assert.equal(
      (
        await s.worker.fetch(
          req('/api/users/owner1', {
            method: 'PUT',
            headers: h,
            body: JSON.stringify({ ...owner, role: 'Owner', disabled: false, password: '' }),
          }),
          s.env,
        )
      ).status,
      200,
    );
    assert.equal(JSON.parse(s.env.CLIMB_KV.m.get('users:owner1')).tokenVersion, before);
    const latest = await json(
      await s.worker.fetch(req('/api/users/owner1', { headers: h }), s.env),
    );
    assert.equal(
      (
        await s.worker.fetch(
          req('/api/users/owner1', {
            method: 'PUT',
            headers: h,
            body: JSON.stringify({
              ...latest,
              role: 'Owner',
              disabled: false,
              password: 'newpassword12345',
            }),
          }),
          s.env,
        )
      ).status,
      200,
    );
    assert.equal(JSON.parse(s.env.CLIMB_KV.m.get('users:owner1')).tokenVersion, before + 1);
  } finally {
    s.cleanup();
  }
});

test('init-owner compensates member if user write fails', async () => {
  const { worker, cleanup } = await importWorker();
  const e = await env(new FakeKV((k) => k.startsWith('users:')));
  try {
    const r = await worker.fetch(
      req('/api/init-owner', {
        method: 'POST',
        body: JSON.stringify({ username: 'owner1', password: 'password12345' }),
      }),
      e,
    );
    assert.equal(r.status, 500);
    assert.equal(
      [...e.CLIMB_KV.m.keys()].some((k) => k.startsWith('members:')),
      false,
    );
    assert.equal(e.CLIMB_KV.m.has('init-owner-lock'), false);
  } finally {
    cleanup();
  }
});
