import type {
  Env,
  User,
  Member,
  ClimbPlan,
  ClimbRecord,
  RecordImage,
  RouteTemplate,
} from './types';
import { csp, renderHtml } from './lib/html';
import { hashPassword, verifyPassword, randomId } from './lib/crypto';
import { getJson, putJson, listJson, del } from './lib/kv';
import {
  currentUser,
  issueTokens,
  rotateRefresh,
  revokeCurrentRefresh,
  revokeUserSessions,
  clearCookies,
} from './lib/session';
import {
  validUser,
  validPass,
  json,
  asRecord,
  reqStr,
  optStr,
  optNum,
  oneOf,
  arrStr,
  dateStr,
  budget,
  money,
  safeFileName,
  assertSameOrigin,
} from './lib/validation';
import { ok, err, methodNotAllowed } from './lib/http';
import { AppError, appError, safeError } from './lib/errors';
import { canRead, canCreate, canUpdate, canDelete } from './lib/permissions';
import { dashboard, aa } from './lib/stats';
import * as ex from './lib/export';
const DIFF = ['休闲', '进阶', '速穿', '重装'] as const,
  IMG_CAT = ['出发点照片', '途中关键节点', '风景照', '终点照片'] as const;
const MAX_FILE = 10 * 1024 * 1024,
  MAX_FILES = 10,
  MAX_TOTAL = 50 * 1024 * 1024;
const ALLOWED = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
  ['image/gif', 'gif'],
]);
export default {
  async fetch(req: Request, env: Env) {
    try {
      return await handle(req, env);
    } catch (e) {
      const se = safeError(e);
      return err(se.message, se.status, se.code);
    }
  },
};
function id() {
  return randomId(12);
}

function randomNonce() {
  const bytes = new Uint8Array(18);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}
const now = () => new Date().toISOString();
async function handle(req: Request, env: Env) {
  const url = new URL(req.url),
    p = url.pathname;
  if (!p.startsWith('/api')) {
    const nonce = randomNonce();
    return new Response(renderHtml(nonce), {
      headers: {
        'content-type': 'text/html;charset=utf-8',
        'Content-Security-Policy': csp(nonce),
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'same-origin',
      },
    });
  }
  if (p === '/api/init-owner') {
    if (req.method !== 'POST') return methodNotAllowed(['POST']);
    assertSameOrigin(req, { allowMissingOrigin: true });
    return initOwner(req, env);
  }
  if (p === '/api/login') {
    if (req.method !== 'POST') return methodNotAllowed(['POST']);
    assertSameOrigin(req, { allowMissingOrigin: true });
    return login(req, env);
  }
  if (p === '/api/refresh') {
    if (req.method !== 'POST') return methodNotAllowed(['POST']);
    assertSameOrigin(req);
    const t = await rotateRefresh(req, env);
    return ok(
      { refreshed: true },
      {
        headers: [
          ['Set-Cookie', t.cookies[0]],
          ['Set-Cookie', t.cookies[1]],
        ] as any,
      },
    );
  }
  if (p === '/api/logout') {
    if (req.method !== 'POST') return methodNotAllowed(['POST']);
    assertSameOrigin(req);
    await revokeCurrentRefresh(req, env);
    return ok(null, {
      headers: [
        ['Set-Cookie', clearCookies()[0]],
        ['Set-Cookie', clearCookies()[1]],
      ] as any,
    });
  }
  const u = await currentUser(req, env);
  if (!u) return err('未登录或登录已过期', 401, 'unauthorized');
  assertSameOrigin(req);
  if (p === '/api/me')
    return req.method === 'GET'
      ? ok({ username: u.username, role: u.role, memberId: u.memberId })
      : methodNotAllowed(['GET']);
  const m = p.match(/^\/api\/(members|users|templates|plans|records)(?:\/([^/]+))?$/);
  if (m) return crud(req, env, u, m[1], m[2], url);
  if (p === '/api/dashboard') {
    if (req.method !== 'GET') return methodNotAllowed(['GET']);
    if (!canRead(u, 'dashboard')) return err('无权限', 403);
    return ok(
      dashboard(
        await listJson<ClimbRecord>(env.CLIMB_KV, 'records:'),
        await listJson<Member>(env.CLIMB_KV, 'members:'),
      ),
    );
  }
  if (p.match(/^\/api\/members\/[^/]+\/detail$/)) {
    if (req.method !== 'GET') return methodNotAllowed(['GET']);
    const mid = p.split('/')[3];
    const member = await getJson<Member>(env.CLIMB_KV, `members:${mid}`);
    if (!member) return err('成员不存在', 404, 'member_not_found');
    if (!canRead(u, 'members', member)) return err('无权限', 403);
    const records = (await listJson<ClimbRecord>(env.CLIMB_KV, 'records:')).filter((r) =>
      r.memberIds.includes(mid),
    );
    return ok({ member, records, stats: memberStats(records) });
  }
  if (p.match(/^\/api\/members\/[^/]+\/stats$/)) {
    if (req.method !== 'GET') return methodNotAllowed(['GET']);
    const mid = p.split('/')[3];
    const records = (await listJson<ClimbRecord>(env.CLIMB_KV, 'records:')).filter((r) =>
      r.memberIds.includes(mid),
    );
    return ok(memberStats(records));
  }
  if (p.match(/^\/api\/records\/from-plan\/[^/]+$/))
    return fromPlan(req, env, u, p.split('/').pop()!);
  if (p.match(/^\/api\/records\/[^/]+\/aa$/)) {
    if (req.method !== 'GET') return methodNotAllowed(['GET']);
    const r = await getJson<ClimbRecord>(env.CLIMB_KV, `records:${p.split('/')[3]}`);
    if (!r) return err('记录不存在', 404);
    const owner = (await listJson<User>(env.CLIMB_KV, 'users:')).find((x) => x.role === 'Owner');
    return ok(aa(r, owner?.memberId));
  }
  if (p.match(/^\/api\/records\/[^/]+\/images(?:\/[^/]+(?:\/file)?)?$/))
    return images(req, env, u, p);
  if (p.startsWith('/api/export/')) {
    if (req.method !== 'GET') return methodNotAllowed(['GET']);
    if (!canRead(u, 'export')) return err('无权限', 403);
    return exportData(env, p, url);
  }
  return err('Not Found', 404, 'not_found');
}
async function login(req: Request, env: Env) {
  const b = asRecord(await json(req, 4096));
  await rateLimit(req, env, b);
  const username = typeof b.username === 'string' ? b.username : '',
    password = typeof b.password === 'string' ? b.password : '';
  const dummy = await hashPassword('dummy-password-0000');
  const u = validUser(username) ? await getJson<User>(env.CLIMB_KV, `users:${username}`) : null;
  const okPass = await verifyPassword(password, u?.passwordHash || dummy);
  if (!u || u.disabled || !okPass) return err('账号或密码错误', 401, 'invalid_credentials');
  const t = await issueTokens(env, u);
  return ok(
    { username: u.username, role: u.role, memberId: u.memberId },
    {
      headers: [
        ['Set-Cookie', t.cookies[0]],
        ['Set-Cookie', t.cookies[1]],
      ] as any,
    },
  );
}
async function rateLimit(req: Request, env: Env, b: Record<string, unknown>) {
  const ip = req.headers.get('CF-Connecting-IP') || 'unknown',
    user = typeof b.username === 'string' ? b.username.slice(0, 32) : 'invalid';
  for (const k of [`loginRate:ip:${ip}`, `loginRate:user:${user}`]) {
    const v = (await getJson<{ n: number }>(env.CLIMB_KV, k)) || { n: 0 };
    if (v.n >= 20) throw appError(429, 'rate_limited', '登录尝试过多，请稍后再试');
    await putJson(env.CLIMB_KV, k, { n: v.n + 1 }, { expirationTtl: 300 });
  }
}
async function initOwner(req: Request, env: Env) {
  const b = asRecord(await json(req, 4096));
  if (!validUser(String(b.username)) || !validPass(String(b.password)))
    throw appError(422, 'invalid_credentials_policy', '账号或密码不符合规则');
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
  const t = now(),
    memberId = id();
  const u: User = {
    username: String(b.username),
    role: 'Owner',
    memberId,
    tokenVersion: 1,
    disabled: false,
    passwordHash: await hashPassword(String(b.password)),
    version: 1,
    createdAt: t,
    updatedAt: t,
  };
  const m: Member = {
    id: memberId,
    username: u.username,
    nickname: u.username,
    realName: '',
    gearNotes: '',
    version: 1,
    createdAt: t,
    updatedAt: t,
  };
  await putJson(env.CLIMB_KV, `members:${m.id}`, m);
  await putJson(env.CLIMB_KV, `users:${u.username}`, u);
  await del(env.CLIMB_KV, 'init-owner-lock');
  return ok({ username: u.username, role: u.role, memberId });
}

async function userView(env: Env, u: User) {
  const { passwordHash, ...safe } = u as any;
  const member = await getJson<Member>(env.CLIMB_KV, `members:${u.memberId}`);
  return { ...safe, member: member || null };
}
async function userViews(env: Env, users: User[]) {
  return Promise.all(users.map((x) => userView(env, x)));
}
async function assertNotLastOwnerDisabledOrDemoted(
  env: Env,
  old: User | null,
  nextRole: string,
  nextDisabled: boolean,
) {
  if (!old || old.role !== 'Owner') return;
  if (nextRole === 'Owner' && !nextDisabled) return;
  const users = await listJson<User>(env.CLIMB_KV, 'users:');
  const activeOwners = users.filter(
    (x) => x.username !== old.username && x.role === 'Owner' && !x.disabled,
  ).length;
  if (activeOwners < 1) throw appError(409, 'last_owner_protected', '不能禁用或降级最后一个 Owner');
}

async function crud(req: Request, env: Env, u: User, type: string, item?: string, url?: URL) {
  const prefixes: any = {
      users: 'users',
      members: 'members',
      templates: 'routeTemplates',
      plans: 'plans',
      records: 'records',
    },
    prefix = prefixes[type] + ':';
  if (req.method === 'GET' && !item) {
    const readable = (await listJson<any>(env.CLIMB_KV, prefix)).filter((x) =>
      canRead(u, type as any, x),
    );
    const shaped = type === 'users' ? await userViews(env, readable) : readable;
    return ok(paginate(shaped, url!));
  }
  if (req.method === 'GET' && item) {
    const o = await getJson<any>(env.CLIMB_KV, prefix + item);
    if (!o) return err('不存在', 404);
    if (!canRead(u, type as any, o)) return err('无权限', 403);
    return ok(type === 'users' ? await userView(env, o) : o);
  }
  if (req.method === 'DELETE' && item) {
    const old = await getJson<any>(env.CLIMB_KV, prefix + item);
    if (!old) return err('不存在', 404);
    if (!canDelete(u, type as any, old)) return err('无权限', 403);
    const v = Number(new URL(req.url).searchParams.get('version'));
    if (old.version && v !== old.version)
      return err('版本冲突，请刷新后重试', 409, 'version_conflict');
    if (type === 'records') await deleteRecord(env, item);
    else if (type === 'users' || type === 'members')
      return err('请使用禁用代替删除', 409, 'hard_delete_blocked');
    else await del(env.CLIMB_KV, prefix + item);
    return ok();
  }
  if (!['POST', 'PUT'].includes(req.method))
    return methodNotAllowed(item ? ['GET', 'PUT', 'DELETE'] : ['GET', 'POST']);
  const b = asRecord(await json(req));
  if (req.method === 'POST') {
    if (!canCreate(u, type as any)) return err('无权限', 403);
    if (type === 'users') {
      const username = reqStr(b, 'username', 32);
      if (await getJson(env.CLIMB_KV, `users:${username}`))
        return err('用户已存在', 409, 'duplicate_user');
      const o = await sanitize(env, type, b, null, u);
      const memberKey = `members:${o.memberId}`;
      try {
        await putJson(env.CLIMB_KV, memberKey, o.__member);
        delete o.__member;
        await putJson(env.CLIMB_KV, `users:${o.username}`, o);
      } catch (e) {
        await del(env.CLIMB_KV, memberKey);
        throw e;
      }
      return ok(await userView(env, o));
    }
    const o = await sanitize(env, type, b, null, u);
    o.id ||= id();
    await putJson(env.CLIMB_KV, prefix + o.id, o);
    return ok(o);
  }
  const old = await getJson<any>(env.CLIMB_KV, prefix + item);
  if (!old) return err('不存在', 404);
  if (!canUpdate(u, type as any, old)) return err('无权限', 403);
  if (old.version && Number(b.version) !== old.version)
    return err('版本冲突，请刷新后重试', 409, 'version_conflict');
  const o = await sanitize(env, type, b, old, u);
  if (type !== 'users') o.id = item;
  if (type === 'users' && o.__member) {
    const oldMember = await getJson<Member>(env.CLIMB_KV, `members:${o.memberId}`);
    try {
      await putJson(env.CLIMB_KV, `members:${o.memberId}`, o.__member);
      delete o.__member;
      await putJson(env.CLIMB_KV, prefix + item, o);
    } catch (e) {
      if (oldMember) await putJson(env.CLIMB_KV, `members:${o.memberId}`, oldMember);
      throw e;
    }
  } else {
    await putJson(env.CLIMB_KV, prefix + item, o);
  }
  if (
    type === 'users' &&
    (o.disabled !== old.disabled || o.role !== old.role || o.passwordHash !== old.passwordHash)
  )
    await revokeUserSessions(env, o.username);
  return ok(type === 'users' ? await userView(env, o) : o);
}
function paginate<
  T extends { updatedAt?: string; createdAt?: string; id?: string; username?: string },
>(a: T[], url: URL) {
  const size = Math.min(100, Math.max(1, Number(url.searchParams.get('pageSize') || 50))),
    cursor = url.searchParams.get('cursor') || '';
  const sorted = a.sort((x, y) =>
    `${y.updatedAt || y.createdAt || ''}${y.id || y.username}`.localeCompare(
      `${x.updatedAt || x.createdAt || ''}${x.id || x.username}`,
    ),
  );
  const start = cursor ? sorted.findIndex((x) => (x.id || x.username) === cursor) + 1 : 0;
  const items = sorted.slice(start, start + size);
  return {
    items,
    nextCursor:
      items.length === size
        ? items[items.length - 1]?.id || items[items.length - 1]?.username
        : null,
    hasMore: start + size < sorted.length,
  };
}
async function sanitize(env: Env, type: string, b: any, old: any, u: User): Promise<any> {
  const t = now(),
    common = { version: old ? old.version + 1 : 1, createdAt: old?.createdAt || t, updatedAt: t };
  if (type === 'users') {
    if (u.role !== 'Owner') throw appError(403, 'forbidden', '无权限');
    const username = old?.username || reqStr(b, 'username', 32);
    if (!validUser(username)) throw appError(422, 'invalid_username', '用户名不符合规则');
    let memberId = old?.memberId || id();
    const role = oneOf(b.role || 'Member', ['Owner', 'Member'] as const);
    await assertNotLastOwnerDisabledOrDemoted(env, old, role, Boolean(b.disabled));
    const passwordHash =
      typeof b.password === 'string' && b.password.length
        ? await hashPassword(String(b.password))
        : old?.passwordHash;
    if (!passwordHash || (b.password && !validPass(String(b.password))))
      throw appError(422, 'invalid_password', '密码不符合规则');
    const user: User = {
      username,
      role,
      passwordHash,
      memberId,
      tokenVersion:
        (old?.tokenVersion || 1) +
        (old &&
        ((typeof b.password === 'string' && b.password.length) ||
          b.role !== old.role ||
          b.disabled !== old.disabled)
          ? 1
          : 0),
      disabled: Boolean(b.disabled),
      passwordChangedAt:
        typeof b.password === 'string' && b.password.length ? t : old?.passwordChangedAt,
      ...common,
    };
    const oldMember = old ? await getJson<Member>(env.CLIMB_KV, `members:${memberId}`) : null;
    const m: Member = {
      id: memberId,
      username,
      nickname: String(b.nickname ?? oldMember?.nickname ?? username),
      realName: String(b.realName ?? oldMember?.realName ?? ''),
      baseWeightKg: optNum(b.baseWeightKg, 0, 500) ?? oldMember?.baseWeightKg,
      baseBodyFatPct: optNum(b.baseBodyFatPct, 0, 100) ?? oldMember?.baseBodyFatPct,
      gearNotes: String(b.gearNotes ?? oldMember?.gearNotes ?? ''),
      disabled: user.disabled,
      version: oldMember ? oldMember.version + 1 : 1,
      createdAt: oldMember?.createdAt || t,
      updatedAt: t,
    };
    return { ...user, __member: m };
  }
  if (type === 'members') throw appError(422, 'use_users', '成员必须通过用户管理创建或修改');
  if (type === 'templates')
    return {
      id: old?.id || '',
      name: reqStr(b, 'name', 200),
      defaultDifficulty: oneOf(b.defaultDifficulty, DIFF),
      defaultDistanceKm: optNum(b.defaultDistanceKm, 0, 1000),
      defaultDurationMin: optNum(b.defaultDurationMin, 0, 10000),
      defaultElevationM: optNum(b.defaultElevationM, 0, 20000),
      dangerPoints: optStr(b.dangerPoints, 4000) || '',
      waterPoints: optStr(b.waterPoints, 4000) || '',
      notes: optStr(b.notes, 4000) || '',
      createdBy: old?.createdBy || u.username,
      ...common,
    } satisfies RouteTemplate;
  const memberIds = arrStr(b.memberIds);
  await assertMembers(env, memberIds);
  if (type === 'plans')
    return {
      id: old?.id || '',
      routeName: reqStr(b, 'routeName', 200),
      difficulty: oneOf(b.difficulty, DIFF),
      planDate: dateStr(b.planDate),
      plannedDistanceKm: optNum(b.plannedDistanceKm, 0, 1000),
      plannedDurationMin: optNum(b.plannedDurationMin, 0, 10000),
      plannedElevationM: optNum(b.plannedElevationM, 0, 20000),
      memberIds,
      budget: budget(b.budget),
      gearList: optStr(b.gearList, 4000) || '',
      dangerPoints: optStr(b.dangerPoints, 4000) || '',
      waterPoints: optStr(b.waterPoints, 4000) || '',
      createdBy: old?.createdBy || u.username,
      ...common,
    } satisfies ClimbPlan;
  if (b.planId && !(await getJson(env.CLIMB_KV, `plans:${b.planId}`)))
    throw appError(422, 'invalid_plan', '计划不存在');
  const expenses = Array.isArray(b.expenses)
    ? b.expenses.map((x: any, i: number) => {
        const o = asRecord(x);
        const payer = reqStr(o, 'payerMemberId', 128);
        if (!memberIds.includes(payer))
          throw appError(422, 'payer_not_participant', '付款人必须是参与成员');
        return {
          id: typeof o.id === 'string' ? o.id : String(i),
          category: oneOf(o.category, [
            '油费',
            '过路费',
            '停车费',
            '午餐',
            '补给',
            '门票',
            '其他',
          ] as const),
          amountCents: money(o.amountCents),
          payerMemberId: payer,
          notes: typeof o.notes === 'string' ? o.notes : undefined,
        };
      })
    : [];
  const bodyData = Array.isArray(b.bodyData)
    ? b.bodyData.map((x: any) => {
        const o = asRecord(x);
        const mid = reqStr(o, 'memberId', 128);
        if (!memberIds.includes(mid))
          throw appError(422, 'body_member_not_participant', '身体数据成员必须是参与成员');
        return {
          memberId: mid,
          beforeWeightKg: optNum(o.beforeWeightKg, 0, 500),
          beforeBodyFatPct: optNum(o.beforeBodyFatPct, 0, 100),
          afterWeightKg: optNum(o.afterWeightKg, 0, 500),
          afterBodyFatPct: optNum(o.afterBodyFatPct, 0, 100),
        };
      })
    : [];
  return {
    id: old?.id || '',
    planId: typeof b.planId === 'string' && b.planId ? b.planId : undefined,
    routeName: reqStr(b, 'routeName', 200),
    difficulty: oneOf(b.difficulty, DIFF),
    date: dateStr(b.date),
    memberIds,
    plannedDistanceKm: optNum(b.plannedDistanceKm, 0, 1000),
    plannedDurationMin: optNum(b.plannedDurationMin, 0, 10000),
    plannedElevationM: optNum(b.plannedElevationM, 0, 20000),
    actualDistanceKm: optNum(b.actualDistanceKm, 0, 1000),
    actualDurationMin: optNum(b.actualDurationMin, 0, 10000),
    actualElevationM: optNum(b.actualElevationM, 0, 20000),
    budget: budget(b.budget),
    expenses,
    bodyData,
    roadNotes: optStr(b.roadNotes, 4000) || '',
    riskNotes: optStr(b.riskNotes, 4000) || '',
    weather: optStr(b.weather, 1000) || '',
    review: optStr(b.review, 4000) || '',
    otherNotes: optStr(b.otherNotes, 4000) || '',
    createdBy: old?.createdBy || u.username,
    ...common,
  } satisfies ClimbRecord;
}
async function assertMembers(env: Env, ids: string[]) {
  for (const mid of ids) {
    const m = await getJson<Member>(env.CLIMB_KV, `members:${mid}`);
    if (!m || m.disabled) throw appError(422, 'member_not_found', '成员不存在或已禁用');
  }
}
async function fromPlan(req: Request, env: Env, u: User, pid: string) {
  if (req.method !== 'POST') return methodNotAllowed(['POST']);
  const pl = await getJson<ClimbPlan>(env.CLIMB_KV, `plans:${pid}`);
  if (!pl) return err('计划不存在', 404);
  if (!canCreate(u, 'records', pl)) return err('无权限', 403);
  const t = now();
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
    version: 1,
    createdAt: t,
    updatedAt: t,
  };
  await putJson(env.CLIMB_KV, `records:${r.id}`, r);
  return ok(r);
}
function memberStats(rs: ClimbRecord[]) {
  const distance = rs.reduce((a, r) => a + (r.actualDistanceKm || 0), 0),
    elev = rs.reduce((a, r) => a + (r.actualElevationM || 0), 0),
    dur = rs.reduce((a, r) => a + (r.actualDurationMin || 0), 0);
  return {
    distance,
    elev,
    duration: dur,
    count: rs.length,
    pace: distance ? (dur / distance).toFixed(2) : '0',
    speed: dur ? (distance / (dur / 60)).toFixed(2) : '0',
  };
}
async function deleteRecord(env: Env, rid: string) {
  for (const meta of await listJson<RecordImage>(env.CLIMB_KV, `images:${rid}:`)) {
    await env.CLIMB_IMAGES.delete(meta.r2Key);
    await del(env.CLIMB_KV, `images:${rid}:${meta.id}`);
  }
  await del(env.CLIMB_KV, `records:${rid}`);
}
async function images(req: Request, env: Env, u: User, p: string) {
  const parts = p.split('/'),
    rid = parts[3],
    img = parts[5],
    record = await getJson<ClimbRecord>(env.CLIMB_KV, `records:${rid}`);
  if (!record) return err('记录不存在', 404);
  if (req.method === 'GET' && !img)
    return ok(await listJson<RecordImage>(env.CLIMB_KV, `images:${rid}:`));
  if (req.method === 'GET' && img === 'download')
    return ok(
      (await listJson<RecordImage>(env.CLIMB_KV, `images:${rid}:`)).map((m) => ({
        fileName: m.fileName,
        url: `/api/records/${rid}/images/${m.id}/file`,
      })),
    );
  if (req.method === 'GET' && parts[6] === 'file') {
    const meta = await getJson<RecordImage>(env.CLIMB_KV, `images:${rid}:${img}`);
    if (!meta) return err('图片不存在', 404);
    const obj = await env.CLIMB_IMAGES.get(meta.r2Key);
    if (!obj) return err('文件不存在', 404);
    const fn = safeFileName(meta.fileName).replace(/"/g, '_');
    return new Response(obj.body, {
      headers: {
        'content-type': meta.contentType,
        'content-disposition': `attachment; filename="${fn}"; filename*=UTF-8''${encodeURIComponent(fn)}`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
        Vary: 'Cookie',
      },
    });
  }
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
      files = form.getAll('files').filter((x) => x instanceof File) as File[];
    if (!files.length) return err('缺少文件', 422);
    if (files.length > MAX_FILES) return err('文件数量过多', 413);
    if (files.reduce((a, f) => a + f.size, 0) > MAX_TOTAL) return err('文件总大小过大', 413);
    const metas: RecordImage[] = [];
    for (const f of files) {
      if (f.size > MAX_FILE) return err('文件过大', 413);
      const ct = f.type.toLowerCase();
      if (!ALLOWED.has(ct) || !(await magic(f, ct))) return err('不支持的图片类型', 415);
    }
    const written: string[] = [];
    try {
      for (const f of files) {
        const ct = f.type.toLowerCase(),
          iid = id(),
          key = `records/${rid}/${iid}.${ALLOWED.get(ct)}`;
        const meta: RecordImage = {
          id: iid,
          recordId: rid,
          r2Key: key,
          category: oneOf(form.get('category') || '风景照', IMG_CAT),
          note: typeof form.get('note') === 'string' ? String(form.get('note')).slice(0, 1000) : '',
          fileName: safeFileName(f.name),
          contentType: ct,
          size: f.size,
          createdAt: now(),
        };
        await env.CLIMB_IMAGES.put(key, f.stream(), { httpMetadata: { contentType: ct } });
        written.push(key);
        await putJson(env.CLIMB_KV, `images:${rid}:${iid}`, meta);
        metas.push(meta);
      }
    } catch (e) {
      await Promise.all(written.map((k) => env.CLIMB_IMAGES.delete(k)));
      throw e;
    }
    return ok(metas);
  }
  return methodNotAllowed(['GET', 'POST', 'DELETE']);
}
async function magic(f: File, ct: string) {
  const b = new Uint8Array(await f.slice(0, 12).arrayBuffer());
  if (ct === 'image/jpeg') return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (ct === 'image/png') return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  if (ct === 'image/gif') return b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46;
  if (ct === 'image/webp')
    return (
      b[0] === 0x52 &&
      b[1] === 0x49 &&
      b[2] === 0x46 &&
      b[3] === 0x46 &&
      b[8] === 0x57 &&
      b[9] === 0x45 &&
      b[10] === 0x42 &&
      b[11] === 0x50
    );
  return false;
}
async function exportData(env: Env, p: string, url: URL) {
  const fmt = url.searchParams.get('format') || 'json';
  if (!['csv', 'json', 'jsonc', 'jsonl', 'mysql', 'mariadb', 'xlsx'].includes(fmt))
    return err('未知导出格式', 400, 'unknown_export_format');
  let rows: any[] = p.includes('/record/')
    ? [await getJson(env.CLIMB_KV, `records:${p.split('/').pop()}`)]
    : await listJson(env.CLIMB_KV, 'records:');
  if (p.includes('/record/') && !rows[0]) return err('记录不存在', 404);
  rows = rows.filter(Boolean);
  const body =
    fmt === 'csv'
      ? ex.csv(rows)
      : fmt === 'jsonc'
        ? ex.jsonc(rows)
        : fmt === 'jsonl'
          ? ex.jsonl(rows)
          : fmt === 'mysql' || fmt === 'mariadb'
            ? ex.sql(rows)
            : fmt === 'xlsx'
              ? ex.xlsx(rows)
              : JSON.stringify(rows, null, 2);
  const ct =
    fmt === 'xlsx'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : fmt === 'csv'
        ? 'text/csv'
        : 'application/json';
  return new Response(body as any, {
    headers: {
      'content-type': `${ct};charset=utf-8`,
      'content-disposition': `attachment; filename="friends-climbing.${safeFileName(fmt)}"`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
      Vary: 'Cookie',
    },
  });
}
