export type ListPage<T> = { items: T[]; nextCursor: string | null; hasMore: boolean };
export function normalizeListResponse<T>(data: unknown): ListPage<T> {
  if (Array.isArray(data)) return { items: data as T[], nextCursor: null, hasMore: false };
  if (data && typeof data === 'object') {
    const o = data as { items?: unknown; nextCursor?: unknown; hasMore?: unknown };
    return {
      items: Array.isArray(o.items) ? (o.items as T[]) : [],
      nextCursor: typeof o.nextCursor === 'string' ? o.nextCursor : null,
      hasMore: o.hasMore === true,
    };
  }
  return { items: [], nextCursor: null, hasMore: false };
}
