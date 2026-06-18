export const validUser = (u: string) => /^[A-Za-z0-9]{4,32}$/.test(u);
export const validPass = (p: string) => typeof p === 'string' && p.length >= 12;
export async function json(req: Request) {
  return (await req.json().catch(() => ({}))) as unknown;
}
export const ok = (data: any = undefined, init: ResponseInit = {}) =>
  Response.json({ ok: true, data }, init);
export const err = (message: string, status = 400) =>
  Response.json({ ok: false, error: message }, { status });
export function requireFields(o: any, fs: string[]) {
  for (const f of fs) if (o[f] === undefined || o[f] === '') throw new Error(`${f} 必填`);
}
export function asRecord(v: unknown) {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}
export function str(v: unknown, max = 2000) {
  return String(v ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .slice(0, max);
}
export function num(v: unknown, min = 0, max = 1_000_000) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
}
export function arrStr(v: unknown, max = 200) {
  return Array.isArray(v)
    ? v
        .map((x) => str(x, 128))
        .filter(Boolean)
        .slice(0, max)
    : [];
}
export function oneOf<T extends string>(v: unknown, allowed: readonly T[], fallback: T) {
  return allowed.includes(v as T) ? (v as T) : fallback;
}
export function cleanBudget(v: unknown) {
  const o = asRecord(v),
    keys = [
      'fuelCents',
      'tollCents',
      'parkingCents',
      'lunchCents',
      'supplyCents',
      'snackCents',
      'ticketCents',
      'otherCents',
    ];
  return Object.fromEntries(keys.map((k) => [k, Math.round(num(o[k], 0, 100_000_000))]));
}
export function cleanExpenses(v: unknown) {
  return Array.isArray(v)
    ? v.slice(0, 500).map((x, i) => {
        const o = asRecord(x);
        return {
          id: str(o.id, 128) || String(i),
          category: oneOf(
            o.category,
            ['油费', '过路费', '停车费', '午餐', '补给', '门票', '其他'] as const,
            '其他',
          ),
          amountCents: Math.round(num(o.amountCents, 0, 100_000_000)),
          payerMemberId: str(o.payerMemberId, 128),
          notes: str(o.notes, 1000),
        };
      })
    : [];
}
export function cleanBodyData(v: unknown) {
  return Array.isArray(v)
    ? v.slice(0, 500).map((x) => {
        const o = asRecord(x);
        return {
          memberId: str(o.memberId, 128),
          beforeWeightKg: num(o.beforeWeightKg, 0, 500),
          beforeBodyFatPct: num(o.beforeBodyFatPct, 0, 100),
          afterWeightKg: num(o.afterWeightKg, 0, 500),
          afterBodyFatPct: num(o.afterBodyFatPct, 0, 100),
        };
      })
    : [];
}
export function safeFileName(name: string) {
  const base = str(name, 180)
    .replace(/[\\/<>:"'`|?*#%{}^~\[\]]/g, '_')
    .replace(/^\.+/, '_')
    .trim();
  return base || 'file';
}
export function assertSameOrigin(req: Request, options: { allowMissingOrigin?: boolean } = {}) {
  const m = req.method.toUpperCase();
  if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(m)) return;
  const origin = req.headers.get('Origin');
  if (!origin) {
    if (options.allowMissingOrigin) return;
    throw new Error('CSRF origin check failed');
  }
  const u = new URL(req.url);
  if (origin !== `${u.protocol}//${u.host}`) throw new Error('CSRF origin check failed');
}
