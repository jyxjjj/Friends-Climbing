export const privateHeaders = { 'Cache-Control': 'private, no-store', Vary: 'Cookie' };
export const ok = (data: any = undefined, init: ResponseInit = {}) => {
  const h = new Headers(init.headers);
  h.set('Cache-Control', h.get('Cache-Control') || 'private, no-store');
  h.set('Vary', h.get('Vary') || 'Cookie');
  return Response.json({ ok: true, data }, { ...init, headers: h });
};
export const err = (message: string, status = 400, code = 'bad_request') =>
  Response.json(
    { ok: false, error: message, code },
    { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } },
  );
export function methodNotAllowed(allow: string[]) {
  return Response.json(
    { ok: false, error: '方法不支持', code: 'method_not_allowed' },
    { status: 405, headers: { Allow: allow.join(', '), ...privateHeaders } },
  );
}
