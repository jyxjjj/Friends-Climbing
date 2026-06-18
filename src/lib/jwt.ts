import type { Env, JwtClaims } from '../types';
import { b64u, ub64, randomId } from './crypto';
import { appError } from './errors';
const te = new TextEncoder();
function parseJwk(s?: string) {
  if (!s) throw appError(500, 'jwt_secret_missing', '认证服务配置缺失');
  try {
    return JSON.parse(s);
  } catch {
    throw appError(500, 'jwt_secret_invalid', '认证服务配置错误');
  }
}
async function importKey(env: Env, usage: KeyUsage) {
  const jwk = parseJwk(usage === 'sign' ? env.JWT_ED25519_PRIVATE_JWK : env.JWT_ED25519_PUBLIC_JWK);
  for (const name of ['Ed25519', 'NODE-ED25519']) {
    try {
      return await crypto.subtle.importKey('jwk', jwk, { name } as any, false, [usage]);
    } catch {}
  }
  throw appError(500, 'jwt_key_import_failed', '认证服务配置错误');
}
function object(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
function invalid(): never {
  throw appError(401, 'invalid_token', '未登录或登录已过期');
}
function decodePart<T>(s: string): T {
  try {
    const v = JSON.parse(new TextDecoder().decode(ub64(s)));
    if (!object(v)) invalid();
    return v as T;
  } catch (e: any) {
    if (e?.status) throw e;
    invalid();
  }
}
function validateClaims(input: any): JwtClaims {
  if (!object(input)) invalid();
  const c = input as any;
  if (c.typ !== 'access' && c.typ !== 'refresh') invalid();
  for (const k of ['sub', 'username', 'memberId', 'role', 'jti'])
    if (typeof c[k] !== 'string' || !c[k]) invalid();
  if (!['Owner', 'Member'].includes(c.role)) invalid();
  if (!Number.isInteger(c.tokenVersion) || c.tokenVersion < 1) invalid();
  if (!Number.isFinite(c.iat) || !Number.isFinite(c.exp) || c.iat <= 0 || c.exp <= 0) invalid();
  if (c.exp < c.iat || c.iat > Math.floor(Date.now() / 1000) + 300) invalid();
  if (!/^[A-Za-z0-9_-]{12,80}$/.test(c.jti)) invalid();
  return c as unknown as JwtClaims;
}
export async function signJwt(env: Env, claims: Omit<JwtClaims, 'jti' | 'iat'>, ttlSec: number) {
  const now = Math.floor(Date.now() / 1000),
    full: JwtClaims = { ...claims, jti: randomId(18), iat: now, exp: now + ttlSec };
  const kid = env.JWT_KEY_ID || 'default';
  const header = b64u(te.encode(JSON.stringify({ alg: 'EdDSA', typ: 'JWT', kid })));
  const payload = b64u(te.encode(JSON.stringify(full)));
  const data = `${header}.${payload}`;
  const key = await importKey(env, 'sign');
  const sig = await crypto.subtle.sign({ name: key.algorithm.name } as any, key, te.encode(data));
  return { token: `${data}.${b64u(sig)}`, claims: full };
}
export async function verifyJwt(env: Env, token: string): Promise<JwtClaims> {
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) invalid();
  const [h, p, s] = token.split('.');
  const header = decodePart<any>(h);
  if (header.alg !== 'EdDSA' || header.typ !== 'JWT') invalid();
  const key = await importKey(env, 'verify');
  let ok = false;
  try {
    ok = await crypto.subtle.verify(
      { name: key.algorithm.name } as any,
      key,
      ub64(s),
      te.encode(`${h}.${p}`),
    );
  } catch {
    invalid();
  }
  if (!ok) invalid();
  const claims = validateClaims(decodePart<JwtClaims>(p));
  if (claims.exp < Math.floor(Date.now() / 1000))
    throw appError(401, 'token_expired', '未登录或登录已过期');
  return claims;
}
