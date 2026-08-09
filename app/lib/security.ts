const JSON_LIMIT_BYTES = 256 * 1024;
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

export class HttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
  }
}

export const SECURITY_HEADERS = {
  "Cache-Control": "no-store, private",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; sandbox",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
} as const;

export function secureJson(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(name, value);
  }
  return new Response(JSON.stringify(data), { ...init, headers });
}

export function errorResponse(error: unknown, fallback = "请求处理失败"): Response {
  if (error instanceof HttpError) {
    return secureJson(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  }
  console.error("Unhandled API error", {
    type: error instanceof Error ? error.name : typeof error,
  });
  return secureJson(
    { error: fallback, code: "INTERNAL_ERROR" },
    { status: 500 },
  );
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  const expected = new URL(request.url).origin;
  const fetchSite = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (request.headers.get("x-summit-request") !== "1") {
    throw new HttpError(403, "REQUEST_MARKER_REQUIRED", "无法验证请求来源");
  }
  if (!origin || origin === "null") {
    throw new HttpError(403, "ORIGIN_REQUIRED", "无法验证请求来源");
  }
  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    throw new HttpError(403, "ORIGIN_INVALID", "请求来源无效");
  }
  if (
    origin !== parsedOrigin.origin ||
    parsedOrigin.origin !== expected ||
    (fetchSite && !["same-origin", "none"].includes(fetchSite))
  ) {
    throw new HttpError(403, "CROSS_ORIGIN_REJECTED", "已拒绝跨站请求");
  }
}

function assertSafeStructure(
  value: unknown,
  depth = 0,
  counter = { value: 0 },
): void {
  counter.value += 1;
  if (depth > 12 || counter.value > 10_000) {
    throw new HttpError(400, "JSON_TOO_COMPLEX", "请求数据结构过于复杂");
  }
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const child of value) assertSafeStructure(child, depth + 1, counter);
    return;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.has(key)) {
      throw new HttpError(400, "UNSAFE_PROPERTY", "请求包含不安全字段");
    }
    assertSafeStructure(child, depth + 1, counter);
  }
}

async function readLimitedText(request: Request, limit: number): Promise<string> {
  const length = Number(request.headers.get("content-length"));
  if (Number.isFinite(length) && length > limit) {
    throw new HttpError(413, "BODY_TOO_LARGE", "请求数据超过大小限制");
  }
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new HttpError(413, "BODY_TOO_LARGE", "请求数据超过大小限制");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export async function readJsonObject(
  request: Request,
  limit = JSON_LIMIT_BYTES,
): Promise<Record<string, unknown>> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    throw new HttpError(415, "CONTENT_TYPE_INVALID", "仅接受 JSON 请求");
  }
  let text: string;
  try {
    text = await readLimitedText(request, limit);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(400, "BODY_ENCODING_INVALID", "请求编码无效");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new HttpError(400, "JSON_INVALID", "JSON 格式无效");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new HttpError(400, "JSON_OBJECT_REQUIRED", "请求必须是 JSON 对象");
  }
  assertSafeStructure(parsed);
  return parsed as Record<string, unknown>;
}

export function safeId(value: unknown, label = "数据 ID"): string {
  if (typeof value !== "string") {
    throw new HttpError(400, "ID_INVALID", `${label}无效`);
  }
  const normalized = value.trim();
  if (value !== normalized || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(normalized)) {
    throw new HttpError(400, "ID_INVALID", `${label}无效`);
  }
  return normalized;
}

export function sanitizeDisplayFilename(value: string): string {
  const canonical = value.normalize("NFKC");
  const basename = canonical.split(/[\\/]/).at(-1)!;
  const normalized = basename
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/^[.\s]+/u, "")
    .replace(/\.{2,}/g, ".")
    .slice(0, 120)
    .replace(/[.\s]+$/u, "");
  return normalized || "photo";
}

export type AllowedImage = {
  contentType: "image/jpeg" | "image/png" | "image/webp";
  extension: "jpg" | "png" | "webp";
};

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.slice(start, start + length));
}

export function detectImageType(bytes: Uint8Array): AllowedImage | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { contentType: "image/jpeg", extension: "jpg" };
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    ascii(bytes, 1, 3) === "PNG" &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return { contentType: "image/png", extension: "png" };
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    return { contentType: "image/webp", extension: "webp" };
  }
  return null;
}

const DECLARED_IMAGE_TYPES = new Set([
  "",
  "application/octet-stream",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

const MAX_IMAGE_EDGE = 20_000;
const MAX_IMAGE_PIXELS = 40_000_000;

function checkedDimensions(width: number, height: number): void {
  if (
    width <= 0 ||
    height <= 0 ||
    width > MAX_IMAGE_EDGE ||
    height > MAX_IMAGE_EDGE ||
    width * height > MAX_IMAGE_PIXELS
  ) {
    throw new HttpError(400, "IMAGE_DIMENSIONS_INVALID", "图片尺寸无效或过大");
  }
}

function pngDimensions(bytes: Uint8Array): [number, number] {
  if (bytes.length < 24 || ascii(bytes, 12, 4) !== "IHDR") {
    throw new HttpError(400, "IMAGE_TRUNCATED", "PNG 图片结构不完整");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return [view.getUint32(16), view.getUint32(20)];
}

const JPEG_SOF_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function jpegDimensions(bytes: Uint8Array): [number, number] {
  if (bytes.length < 12 || bytes.at(-2) !== 0xff || bytes.at(-1) !== 0xd9) {
    throw new HttpError(400, "IMAGE_TRUNCATED", "JPEG 图片结构不完整");
  }
  let offset = 2;
  while (offset + 3 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
    if (offset + 2 > bytes.length) break;
    const segmentLength = (bytes[offset] << 8) | bytes[offset + 1];
    if (segmentLength < 2 || offset + segmentLength > bytes.length) break;
    if (JPEG_SOF_MARKERS.has(marker) && segmentLength >= 7) {
      const height = (bytes[offset + 3] << 8) | bytes[offset + 4];
      const width = (bytes[offset + 5] << 8) | bytes[offset + 6];
      return [width, height];
    }
    offset += segmentLength;
  }
  throw new HttpError(400, "IMAGE_DIMENSIONS_MISSING", "JPEG 图片缺少尺寸信息");
}

function readUint24LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function webpDimensions(bytes: Uint8Array): [number, number] {
  if (bytes.length < 30) {
    throw new HttpError(400, "IMAGE_TRUNCATED", "WebP 图片结构不完整");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const declaredLength = view.getUint32(4, true) + 8;
  if (declaredLength !== bytes.length) {
    throw new HttpError(400, "IMAGE_LENGTH_MISMATCH", "WebP 文件长度无效");
  }
  const chunk = ascii(bytes, 12, 4);
  if (chunk === "VP8X") {
    return [readUint24LE(bytes, 24) + 1, readUint24LE(bytes, 27) + 1];
  }
  if (chunk === "VP8L" && bytes[20] === 0x2f) {
    const width = 1 + (((bytes[22] & 0x3f) << 8) | bytes[21]);
    const height = 1 + (((bytes[24] & 0x0f) << 10) | (bytes[23] << 2) | (bytes[22] >> 6));
    return [width, height];
  }
  if (
    chunk === "VP8 " &&
    bytes[23] === 0x9d &&
    bytes[24] === 0x01 &&
    bytes[25] === 0x2a
  ) {
    const width = (bytes[26] | (bytes[27] << 8)) & 0x3fff;
    const height = (bytes[28] | (bytes[29] << 8)) & 0x3fff;
    return [width, height];
  }
  throw new HttpError(400, "IMAGE_DIMENSIONS_MISSING", "WebP 图片缺少尺寸信息");
}

export function validateImageDimensions(bytes: Uint8Array, image: AllowedImage): void {
  const [width, height] = image.contentType === "image/png"
    ? pngDimensions(bytes)
    : image.contentType === "image/jpeg"
      ? jpegDimensions(bytes)
      : webpDimensions(bytes);
  checkedDimensions(width, height);
}

export function validateImageBytes(
  bytes: Uint8Array,
  declaredType: string,
): AllowedImage {
  const normalized = declaredType.toLowerCase().trim();
  if (!DECLARED_IMAGE_TYPES.has(normalized)) {
    throw new HttpError(400, "IMAGE_TYPE_REJECTED", "图片格式不受支持");
  }
  const detected = detectImageType(bytes);
  if (!detected) {
    throw new HttpError(400, "IMAGE_SIGNATURE_INVALID", "文件内容不是受支持的图片");
  }
  validateImageDimensions(bytes, detected);
  const aliases = detected.contentType === "image/jpeg"
    ? new Set(["", "application/octet-stream", "image/jpeg", "image/jpg"])
    : new Set(["", "application/octet-stream", detected.contentType]);
  if (!aliases.has(normalized)) {
    throw new HttpError(400, "IMAGE_TYPE_MISMATCH", "图片声明格式与文件内容不一致");
  }
  return detected;
}
