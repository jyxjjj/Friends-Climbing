import type { Env, RefreshSession, User } from '../types';
import { getJson, putJson, listJson } from './kv';
import { randomId } from './crypto';
import { signJwt, verifyJwt } from './jwt';
import { appError } from './errors';
export const ACCESS_COOKIE = '__Host-access_token',
  REFRESH_COOKIE = '__Host-refresh_token';
const ACCESS_TTL = 15 * 60,
  REFRESH_TTL = 30 * 24 * 3600;
function getCookie(req: Request, name: string) {
  return (req.headers.get('Cookie') || '')
    .split(/; */)
    .map((x) => x.split('='))
    .find(([k]) => k === name)?.[1];
}
function setCookie(name: string, value: string, maxAge: number) {
  return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}
export function clearCookies() {
  return [
    `${ACCESS_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
    `${REFRESH_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`,
  ];
}
export async function issueTokens(env: Env, u: User) {
  const access = await signJwt(
    env,
    {
      typ: 'access',
      sub: u.username,
      username: u.username,
      memberId: u.memberId,
      role: u.role,
      tokenVersion: u.tokenVersion,
      exp: 0,
    },
    ACCESS_TTL,
  );
  const refresh = await signJwt(
    env,
    {
      typ: 'refresh',
      sub: u.username,
      username: u.username,
      memberId: u.memberId,
      role: u.role,
      tokenVersion: u.tokenVersion,
      exp: 0,
    },
    REFRESH_TTL,
  );
  const now = Date.now();
  const s: RefreshSession = {
    jti: refresh.claims.jti,
    username: u.username,
    memberId: u.memberId,
    role: u.role,
    tokenVersion: u.tokenVersion,
    createdAt: now,
    expiresAt: now + REFRESH_TTL * 1000,
  };
  await putJson(env.CLIMB_KV, `refreshSessions:${s.jti}`, s, { expirationTtl: REFRESH_TTL });
  return {
    access: access.token,
    refresh: refresh.token,
    cookies: [
      setCookie(ACCESS_COOKIE, access.token, ACCESS_TTL),
      setCookie(REFRESH_COOKIE, refresh.token, REFRESH_TTL),
    ],
  };
}
export async function currentUser(req: Request, env: Env): Promise<User | null> {
  const token = getCookie(req, ACCESS_COOKIE);
  if (!token) return null;
  const claims = await verifyJwt(env, token);
  if (claims.typ !== 'access') return null;
  const u = await getJson<User>(env.CLIMB_KV, `users:${claims.username}`);
  if (
    !u ||
    u.disabled ||
    u.tokenVersion !== claims.tokenVersion ||
    u.memberId !== claims.memberId ||
    u.role !== claims.role
  )
    return null;
  return u;
}
export async function rotateRefresh(req: Request, env: Env) {
  const token = getCookie(req, REFRESH_COOKIE);
  if (!token) throw appError(401, 'invalid_refresh', '登录已过期，请重新登录');
  const c = await verifyJwt(env, token);
  if (c.typ !== 'refresh') throw appError(401, 'invalid_refresh', '登录已过期，请重新登录');
  const s = await getJson<RefreshSession>(env.CLIMB_KV, `refreshSessions:${c.jti}`);
  const u = await getJson<User>(env.CLIMB_KV, `users:${c.username}`);
  if (!s || s.revokedAt || s.rotatedAt || !u || u.disabled || u.tokenVersion !== c.tokenVersion) {
    await revokeUserSessions(env, c.username);
    throw appError(401, 'invalid_refresh', '登录已过期，请重新登录');
  }
  s.rotatedAt = s.revokedAt = Date.now();
  await putJson(env.CLIMB_KV, `refreshSessions:${s.jti}`, s, { expirationTtl: REFRESH_TTL });
  return issueTokens(env, u);
}
export async function revokeCurrentRefresh(req: Request, env: Env) {
  const token = getCookie(req, REFRESH_COOKIE);
  if (!token) return;
  try {
    const c = await verifyJwt(env, token);
    const s = await getJson<RefreshSession>(env.CLIMB_KV, `refreshSessions:${c.jti}`);
    if (s) {
      s.revokedAt = Date.now();
      await putJson(env.CLIMB_KV, `refreshSessions:${s.jti}`, s, { expirationTtl: REFRESH_TTL });
    }
  } catch (e) {
    console.error('logout_refresh_revoke_failed', e);
  }
}
export async function revokeUserSessions(env: Env, username: string) {
  for (const s of await listJson<RefreshSession>(env.CLIMB_KV, 'refreshSessions:'))
    if (s.username === username && !s.revokedAt) {
      s.revokedAt = Date.now();
      await putJson(env.CLIMB_KV, `refreshSessions:${s.jti}`, s, { expirationTtl: REFRESH_TTL });
    }
}
export { getCookie, setCookie };
