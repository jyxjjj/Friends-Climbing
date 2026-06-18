export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export const appError = (status: number, code: string, message: string) =>
  new AppError(status, code, message);
export function safeError(e: unknown) {
  if (e instanceof AppError) return e;
  console.error('internal_error', e);
  return new AppError(500, 'internal_error', '服务器暂时不可用，请稍后重试');
}
