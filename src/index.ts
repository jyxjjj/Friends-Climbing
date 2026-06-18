import type { Env, User, Member, ClimbPlan, ClimbRecord, RecordImage } from './types';
import { csp, html } from './lib/html';
import { hashPassword, verifyPassword, randomId } from './lib/crypto';
import { getJson, putJson, listJson, del } from './lib/kv';
import { currentUser, createSession, cookie, clearCookie, sid } from './lib/session';
import {
  validUser,
  validPass,
  json,
  ok,
  err,
  asRecord,
  str,
  num,
  arrStr,
  oneOf,
  cleanBudget,
  cleanExpenses,
  cleanBodyData,
  safeFileName,
  assertSameOrigin,
} from './lib/validation';
import { canRead, canCreate, canUpdate, canDelete } from './lib/permissions';
import { dashboard, aa } from './lib/stats';
import * as ex from './lib/export';
const DIFF = ['休闲', '进阶', '速穿', '重装'] as const,
  IMG_CAT = ['出发点照片', '途中关键节点', '风景照', '终点照片'] as const,
  MAX_FILE = 10 * 1024 * 1024,
  ALLOWED = new Map([
    ['image/jpeg', 'jpg'],
    ['image/png', 'png'],
    ['image/webp', 'webp'],
    ['image/gif', 'gif'],
  ]);
export default {
  async fetch(req: Request, env: Env) {
    try {
      return await handle(req, env);
    } catch (e: any) {
      return err(e.message || '服务器错误', String(e.message || '').includes('CSRF') ? 403 : 500);
    }
  },
};
function id() {
  return randomId(12);
}
function now() {
  return new Date().toISOString();
}
function page<T>(a: T[], url: URL) {
  const p = Math.max(1, Number(url.searchParams.get('page') || 1)),
    n = Math.min(200, Math.max(1, Number(url.searchParams.get('pageSize') || 50)));
  return a.slice((p - 1) * n, p * n);
}
async function handle(req: Request, env: Env) {
  const url = new URL(req.url),
    p = url.pathname;
  if (!p.startsWith('/api'))
    return new Response(html, {
      headers: {
        'content-type': 'text/html;charset=utf-8',
        'Content-Security-Policy': csp,
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'same-origin',
      },
    });
  if (p === '/api/init-owner' && req.method === 'POST') {
    assertSameOrigin(req, { allowMissingOrigin: true });
    return initOwner(req, env);
  }
  if (p === '/api/login' && req.method === 'POST') {
    assertSameOrigin(req, { allowMissingOrigin: true });
    const b = asRecord(await json(req));
    const u = validUser(String(b.username))
      ? await getJson<User>(env.CLIMB_KV, `users:${b.username}`)
      : null;
    if (!u || !(await verifyPassword(String(b.password || ''), u.passwordHash)))
      return err('账号或密码错误', 401);
    const s = await createSession(env, u.username);
    return ok({ username: u.username, role: u.role }, { headers: { 'Set-Cookie': cookie(s) } });
  }
  const u = await currentUser(req, env);
  if (!u) return err('未登录', 401);
  assertSameOrigin(req);
  if (p === '/api/logout' && req.method === 'POST') {
    const s = sid(req);
    if (s) await del(env.CLIMB_KV, `sessions:${s}`);
    return ok(null, { headers: { 'Set-Cookie': clearCookie() } });
  }
  if (p === '/api/me') return ok({ username: u.username, role: u.role });
  if (p.match(/^\/api\/members\/[^/]+$/) && req.method === 'GET') {
    const mid = p.split('/').pop()!,
      member = await getJson<Member>(env.CLIMB_KV, `members:${mid}`),
      records = (await listJson<ClimbRecord>(env.CLIMB_KV, 'records:')).filter((r) =>
        r.memberIds.includes(mid),
      );
    return ok({ member, records, stats: memberStats(records) });
  }
  let m = p.match(/^\/api\/(members|templates|plans|records)(?:\/([^/]+))?$/);
  if (m) return crud(req, env, u, m[1], m[2], url);
  if (p.startsWith('/api/dashboard'))
    return ok(
      dashboard(
        await listJson<ClimbRecord>(env.CLIMB_KV, 'records:'),
        await listJson<Member>(env.CLIMB_KV, 'members:'),
      ),
    );
  if (p.startsWith('/api/records/from-plan/') && req.method === 'POST') {
    const pid = p.split('/').pop()!,
      pl = await getJson<ClimbPlan>(env.CLIMB_KV, `plans:${pid}`);
    if (!pl) return err('计划不存在', 404);
    if (!canCreate(u, 'records', pl)) return err('无权限', 403);
    const r: ClimbRecord = {
      id: id(),
      planId: pl.id,
      routeName: pl.routeName,
      difficulty: pl.difficulty,
      date: pl.planDate,
      memberIds: pl.memberIds,
      plannedDistanceKm: pl.plannedDistanceKm,
      plannedDurationMin: pl.plannedDurationMin,
      plannedElevationM: pl.plannedElevationM,
      actualDistanceKm: pl.plannedDistanceKm,
      actualDurationMin: pl.plannedDurationMin,
      actualElevationM: pl.plannedElevationM,
      budget: pl.budget,
      expenses: [],
      bodyData: [],
      roadNotes: '',
      riskNotes: '',
      weather: '',
      review: '',
      otherNotes: '',
      createdBy: u.username,
      createdAt: now(),
      updatedAt: now(),
    };
    await putJson(env.CLIMB_KV, `records:${r.id}`, r);
    return ok(r);
  }
  if (p.match(/^\/api\/members\/[^/]+\/stats$/)) {
    const mid = p.split('/')[3],
      records = (await listJson<ClimbRecord>(env.CLIMB_KV, 'records:')).filter((r) =>
        r.memberIds.includes(mid),
      );
    return ok(memberStats(records));
  }
  if (p.match(/^\/api\/records\/[^/]+\/aa$/)) {
    const r = await getJson<ClimbRecord>(env.CLIMB_KV, `records:${p.split('/')[3]}`);
    return r ? ok(aa(r)) : err('记录不存在', 404);
  }
  if (p.match(/^\/api\/records\/[^/]+\/images/)) return images(req, env, u, p);
  if (p.startsWith('/api/export/')) return exportData(env, p, url);
  return err('Not Found', 404);
}
async function initOwner(req: Request, env: Env) {
  const b = asRecord(await json(req));
  if (!validUser(String(b.username)) || !validPass(String(b.password)))
    return err('账号或密码不符合规则');
  if ((await env.CLIMB_KV.list({ prefix: 'users:', limit: 1 })).keys.length)
    return err('Owner 已初始化', 409);
  const nonce = id();
  await putJson(
    env.CLIMB_KV,
    'init-owner-lock',
    { nonce, createdAt: now() },
    { expirationTtl: 60 },
  );
  const lock = await getJson<any>(env.CLIMB_KV, 'init-owner-lock');
  if (lock?.nonce !== nonce) return err('Owner 初始化进行中', 409);
  if ((await env.CLIMB_KV.list({ prefix: 'users:', limit: 1 })).keys.length)
    return err('Owner 已初始化', 409);
  const u: User = {
    username: String(b.username),
    role: 'Owner',
    passwordHash: await hashPassword(String(b.password)),
    createdAt: now(),
  };
  await putJson(env.CLIMB_KV, `users:${u.username}`, u);
  await del(env.CLIMB_KV, 'init-owner-lock');
  return ok({ username: u.username, role: u.role });
}
function sanitize(type: string, b: any, old: any, u: User) {
  if (type === 'members')
    return {
      id: old?.id || '',
      nickname: str(b.nickname, 100),
      realName: str(b.realName, 100),
      baseWeightKg: num(b.baseWeightKg, 0, 500),
      baseBodyFatPct: num(b.baseBodyFatPct, 0, 100),
      gearNotes: str(b.gearNotes, 2000),
      createdAt: old?.createdAt || now(),
      updatedAt: now(),
    };
  if (type === 'templates')
    return {
      id: old?.id || '',
      name: str(b.name, 200),
      defaultDifficulty: oneOf(b.defaultDifficulty, DIFF, '休闲'),
      defaultDistanceKm: num(b.defaultDistanceKm, 0, 1000),
      defaultDurationMin: num(b.defaultDurationMin, 0, 10000),
      defaultElevationM: num(b.defaultElevationM, 0, 20000),
      dangerPoints: str(b.dangerPoints, 4000),
      waterPoints: str(b.waterPoints, 4000),
      notes: str(b.notes, 4000),
      createdBy: old?.createdBy || u.username,
      createdAt: old?.createdAt || now(),
      updatedAt: now(),
    };
  if (type === 'plans')
    return {
      id: old?.id || '',
      routeName: str(b.routeName, 200),
      difficulty: oneOf(b.difficulty, DIFF, '休闲'),
      planDate: str(b.planDate, 40),
      plannedDistanceKm: num(b.plannedDistanceKm, 0, 1000),
      plannedDurationMin: num(b.plannedDurationMin, 0, 10000),
      plannedElevationM: num(b.plannedElevationM, 0, 20000),
      memberIds: arrStr(b.memberIds),
      budget: cleanBudget(b.budget),
      gearList: str(b.gearList, 4000),
      dangerPoints: str(b.dangerPoints, 4000),
      waterPoints: str(b.waterPoints, 4000),
      createdBy: old?.createdBy || u.username,
      createdAt: old?.createdAt || now(),
      updatedAt: now(),
    };
  return {
    id: old?.id || '',
    planId: str(b.planId, 128) || undefined,
    routeName: str(b.routeName, 200),
    difficulty: oneOf(b.difficulty, DIFF, '休闲'),
    date: str(b.date, 40),
    memberIds: arrStr(b.memberIds),
    plannedDistanceKm: num(b.plannedDistanceKm, 0, 1000),
    plannedDurationMin: num(b.plannedDurationMin, 0, 10000),
    plannedElevationM: num(b.plannedElevationM, 0, 20000),
    actualDistanceKm: num(b.actualDistanceKm, 0, 1000),
    actualDurationMin: num(b.actualDurationMin, 0, 10000),
    actualElevationM: num(b.actualElevationM, 0, 20000),
    budget: cleanBudget(b.budget),
    expenses: cleanExpenses(b.expenses),
    bodyData: cleanBodyData(b.bodyData),
    roadNotes: str(b.roadNotes, 4000),
    riskNotes: str(b.riskNotes, 4000),
    weather: str(b.weather, 1000),
    review: str(b.review, 4000),
    otherNotes: str(b.otherNotes, 4000),
    createdBy: old?.createdBy || u.username,
    createdAt: old?.createdAt || now(),
    updatedAt: now(),
  };
}
async function crud(req: Request, env: Env, u: User, type: string, item?: string, url?: URL) {
  const map: any = {
      members: 'members',
      templates: 'routeTemplates',
      plans: 'plans',
      records: 'records',
    },
    prefix = map[type] + ':';
  if (req.method === 'GET' && !item)
    return ok(page(await listJson<any>(env.CLIMB_KV, prefix), url!));
  if (req.method === 'GET' && item) {
    const o = await getJson(env.CLIMB_KV, prefix + item);
    return o && canRead(u, type as any, o) ? ok(o) : err('不存在或无权限', 404);
  }
  if (req.method === 'DELETE' && item) {
    const old = await getJson<any>(env.CLIMB_KV, prefix + item);
    if (!old) return err('不存在', 404);
    if (!canDelete(u, type as any, old)) return err('无权限', 403);
    await del(env.CLIMB_KV, prefix + item);
    return ok();
  }
  const b = asRecord(await json(req));
  if (req.method === 'POST') {
    if (!canCreate(u, type as any)) return err('无权限', 403);
    const o = sanitize(type, b, null, u);
    o.id = id();
    await putJson(env.CLIMB_KV, prefix + o.id, o);
    return ok(o);
  }
  if (req.method === 'PUT' && item) {
    const old = await getJson<any>(env.CLIMB_KV, prefix + item);
    if (!old) return err('不存在', 404);
    if (!canUpdate(u, type as any, old)) return err('无权限', 403);
    const o = sanitize(type, b, old, u);
    o.id = item;
    await putJson(env.CLIMB_KV, prefix + item, o);
    return ok(o);
  }
  return err('方法不支持', 405);
}
function memberStats(rs: ClimbRecord[]) {
  const distance = rs.reduce((a, r) => a + r.actualDistanceKm, 0),
    elev = rs.reduce((a, r) => a + r.actualElevationM, 0),
    dur = rs.reduce((a, r) => a + r.actualDurationMin, 0);
  return {
    distance,
    elev,
    duration: dur,
    count: rs.length,
    pace: distance ? (dur / distance).toFixed(2) : '0',
    speed: dur ? (distance / (dur / 60)).toFixed(2) : '0',
  };
}
async function images(req: Request, env: Env, u: User, p: string) {
  const parts = p.split('/'),
    rid = parts[3],
    img = parts[5],
    record = await getJson<ClimbRecord>(env.CLIMB_KV, `records:${rid}`);
  if (!record) return err('记录不存在', 404);
  if (req.method === 'GET' && !img)
    return ok(await listJson<RecordImage>(env.CLIMB_KV, `images:${rid}:`));
  if (req.method === 'DELETE' && img) {
    if (!canDelete(u, 'images', record)) return err('无权限', 403);
    const meta = await getJson<RecordImage>(env.CLIMB_KV, `images:${rid}:${img}`);
    if (meta) await env.CLIMB_IMAGES.delete(meta.r2Key);
    await del(env.CLIMB_KV, `images:${rid}:${img}`);
    return ok();
  }
  if (req.method === 'POST') {
    if (!canCreate(u, 'images', record)) return err('无权限', 403);
    const form = await req.formData(),
      files = form.getAll('files').filter((x) => x instanceof File) as File[],
      out = [];
    if (!files.length) return err('缺少文件');
    for (const f of files) {
      if (f.size > MAX_FILE) return err('文件过大', 413);
      const ct = f.type.toLowerCase();
      if (!ALLOWED.has(ct)) return err('不支持的图片类型', 415);
      const iid = id(),
        fname = safeFileName(f.name),
        key = `records/${rid}/${iid}.${ALLOWED.get(ct)}`,
        meta: RecordImage = {
          id: iid,
          recordId: rid,
          r2Key: key,
          category: oneOf(form.get('category'), IMG_CAT, '风景照'),
          note: str(form.get('note'), 1000),
          fileName: fname,
          contentType: ct,
          size: f.size,
          createdAt: now(),
        };
      await env.CLIMB_IMAGES.put(key, f.stream(), { httpMetadata: { contentType: ct } });
      await putJson(env.CLIMB_KV, `images:${rid}:${iid}`, meta);
      out.push(meta);
    }
    return ok(out);
  }
  if (req.method === 'GET' && img === 'download') {
    const metas = await listJson<RecordImage>(env.CLIMB_KV, `images:${rid}:`);
    return ok(
      metas.map((m) => ({ fileName: m.fileName, url: `/api/records/${rid}/images/${m.id}/file` })),
    );
  }
  if (req.method === 'GET' && parts[6] === 'file') {
    const meta = await getJson<RecordImage>(env.CLIMB_KV, `images:${rid}:${img}`);
    if (!meta) return err('图片不存在', 404);
    const obj = await env.CLIMB_IMAGES.get(meta.r2Key);
    return obj
      ? new Response(obj.body, {
          headers: {
            'content-type': meta.contentType,
            'content-disposition': `attachment; filename="${safeFileName(meta.fileName).replace(/"/g, '_')}"`,
            'X-Content-Type-Options': 'nosniff',
            'Cache-Control': 'private, no-store',
          },
        })
      : err('文件不存在', 404);
  }
  return err('图片接口错误', 400);
}
async function exportData(env: Env, p: string, url: URL) {
  const fmt = url.searchParams.get('format') || 'json';
  let rows: any[] = p.includes('/record/')
    ? [await getJson(env.CLIMB_KV, `records:${p.split('/').pop()}`)]
    : await listJson(env.CLIMB_KV, 'records:');
  rows = rows.filter(Boolean);
  let body = '',
    ct = 'text/plain';
  if (fmt === 'csv') body = ex.csv(rows);
  else if (fmt === 'jsonc') body = ex.jsonc(rows);
  else if (fmt === 'jsonl') body = ex.jsonl(rows);
  else if (fmt === 'mysql' || fmt === 'mariadb') body = ex.sql(rows);
  else if (fmt === 'xlsx') {
    body = ex.xlsxHtml(rows);
    ct = 'application/vnd.ms-excel';
  } else {
    body = JSON.stringify(rows, null, 2);
    ct = 'application/json';
  }
  return new Response(body, {
    headers: {
      'content-type': ct + ';charset=utf-8',
      'content-disposition': `attachment; filename="friends-climbing.${safeFileName(fmt)}"`,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
