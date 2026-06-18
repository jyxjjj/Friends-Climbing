import { appError } from './errors';
export const validUser = (u: string) => /^[A-Za-z0-9]{4,32}$/.test(u);
export const validPass = (p: string) =>
  typeof p === 'string' &&
  new TextEncoder().encode(p).length >= 12 &&
  new TextEncoder().encode(p).length <= 512;
export async function json(req: Request, max = 65536) {
  const len = Number(req.headers.get('content-length') || 0);
  if (len > max) throw appError(413, 'body_too_large', '请求体过大');
  try {
    return await req.json();
  } catch {
    throw appError(400, 'malformed_json', 'JSON 格式错误');
  }
}
export function asRecord(v: unknown) {
  if (!v || typeof v !== 'object' || Array.isArray(v))
    throw appError(422, 'invalid_object', '请求字段格式错误');
  return v as Record<string, unknown>;
}
export function reqStr(o: any, k: string, max = 2000) {
  if (typeof o[k] !== 'string' || !o[k].trim())
    throw appError(422, 'invalid_field', `${k} 字段无效`);
  return cleanStr(o[k], max);
}
export function optStr(v: unknown, max = 2000) {
  return v === undefined ? undefined : cleanStr(v, max);
}
export function cleanStr(v: unknown, max = 2000) {
  if (typeof v !== 'string') throw appError(422, 'invalid_field', '字段类型无效');
  return v
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, max);
}
export function optNum(v: unknown, min = 0, max = 1_000_000) {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max)
    throw appError(422, 'invalid_number', '数字字段范围无效');
  return v;
}
export function money(v: unknown) {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 100_000_000)
    throw appError(422, 'invalid_amount', '金额字段无效');
  return v;
}
export function arrStr(v: unknown) {
  if (!Array.isArray(v) || !v.length) throw appError(422, 'invalid_members', '成员列表不能为空');
  const a = v.map((x) => {
    if (typeof x !== 'string' || !x) throw appError(422, 'invalid_members', '成员字段无效');
    return x;
  });
  if (new Set(a).size !== a.length) throw appError(422, 'duplicate_members', '成员不能重复');
  return a;
}
export function oneOf<T extends string>(v: unknown, allowed: readonly T[]) {
  if (!allowed.includes(v as T)) throw appError(422, 'invalid_enum', '枚举字段无效');
  return v as T;
}
export function dateStr(v: unknown) {
  if (
    typeof v !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
    Number.isNaN(Date.parse(`${v}T00:00:00Z`))
  )
    throw appError(422, 'invalid_date', '日期格式必须为 YYYY-MM-DD');
  return v;
}
export function budget(v: unknown) {
  if (v === undefined) return undefined;
  const o = asRecord(v),
    out: any = {};
  for (const k of [
    'fuelCents',
    'tollCents',
    'parkingCents',
    'lunchCents',
    'supplyCents',
    'snackCents',
    'ticketCents',
    'otherCents',
  ])
    if (o[k] !== undefined) out[k] = money(o[k]);
  return out;
}
export function safeFileName(name: string) {
  const base = String(name || '')
    .replace(/[\u0000-\u001f\u007f\\/<>:"'`|?*#%{}^~\[\]]/g, '_')
    .replace(/^\.+/, '_')
    .trim()
    .slice(0, 180);
  return base || 'file';
}
export function assertSameOrigin(req: Request, options: { allowMissingOrigin?: boolean } = {}) {
  if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method.toUpperCase())) return;
  const origin = req.headers.get('Origin');
  if (!origin && options.allowMissingOrigin) return;
  const u = new URL(req.url);
  if (origin !== `${u.protocol}//${u.host}`) throw appError(403, 'csrf_failed', '请求来源校验失败');
}
export { ok, err } from './http';
