import { count, eq, inArray } from "drizzle-orm";
import { getDb } from "../../../db";
import { photos, tripRecords } from "../../../db/schema";
import { getRequestUser } from "../../lib/request-user";
import {
  HttpError,
  assertSameOrigin,
  errorResponse,
  safeId,
  sanitizeDisplayFilename,
  secureJson,
  validateImageBytes,
} from "../../lib/security";
import { parsePhotoCategory, parsePhotoNote } from "../../lib/validation";

export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 15 * 1024 * 1024;
const MAX_REQUEST_SIZE = 120 * 1024 * 1024;
const MAX_FILES_PER_REQUEST = 40;
const MAX_FILES_PER_RECORD = 500;

async function getBucket() {
  const { env } = await import("cloudflare:workers");
  return (env as unknown as { BUCKET: R2Bucket }).BUCKET;
}

function requireUser(request: Request) {
  const user = getRequestUser(request);
  if (!user) throw new HttpError(401, "AUTH_REQUIRED", "请先登录");
  return user;
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = requireUser(request);
    const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
    if (!contentType.startsWith("multipart/form-data;")) {
      throw new HttpError(415, "CONTENT_TYPE_INVALID", "仅接受图片表单上传");
    }
    const contentLength = Number(request.headers.get("content-length"));
    if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_SIZE) {
      throw new HttpError(413, "UPLOAD_TOO_LARGE", "单次上传总大小不能超过 120MB");
    }

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      throw new HttpError(400, "MULTIPART_INVALID", "上传表单格式无效");
    }
    const recordId = safeId(form.get("recordId"), "完成记录 ID");
    const category = parsePhotoCategory(form.get("category"));
    const files = form
      .getAll("files")
      .filter((value): value is File => value instanceof File);
    if (!files.length) throw new HttpError(400, "FILES_REQUIRED", "请选择图片");
    if (files.length > MAX_FILES_PER_REQUEST) {
      throw new HttpError(400, "TOO_MANY_FILES", "单次最多上传 40 张图片");
    }

    const db = await getDb();
    const bucket = await getBucket();
    const [record] = await db
      .select()
      .from(tripRecords)
      .where(eq(tripRecords.id, recordId))
      .limit(1);
    if (!record) throw new HttpError(404, "RECORD_NOT_FOUND", "完成记录不存在");
    if (record.createdBy !== user.email) {
      throw new HttpError(403, "RECORD_FORBIDDEN", "只有记录创建人可以上传图片");
    }
    const [existingCount] = await db
      .select({ value: count() })
      .from(photos)
      .where(eq(photos.recordId, recordId));
    if ((existingCount?.value ?? 0) + files.length > MAX_FILES_PER_RECORD) {
      throw new HttpError(400, "RECORD_PHOTO_LIMIT", "单条记录最多保存 500 张图片");
    }

    const prepared = [];
    let totalBytes = 0;
    for (const [index, file] of files.entries()) {
      if (file.size <= 0) {
        throw new HttpError(400, "EMPTY_FILE", `第 ${index + 1} 张图片为空文件`);
      }
      if (file.size > MAX_FILE_SIZE) {
        throw new HttpError(413, "FILE_TOO_LARGE", `第 ${index + 1} 张图片超过 15MB`);
      }
      totalBytes += file.size;
      if (totalBytes > MAX_REQUEST_SIZE) {
        throw new HttpError(413, "UPLOAD_TOO_LARGE", "单次上传总大小不能超过 120MB");
      }
      const bytes = new Uint8Array(await file.arrayBuffer());
      const detected = validateImageBytes(bytes, file.type);
      prepared.push({
        id: crypto.randomUUID(),
        bytes,
        detected,
        filename: sanitizeDisplayFilename(file.name),
        note: parsePhotoNote(form.get(`note-${index}`)),
      });
    }

    const created = [];
    const storedKeys: string[] = [];
    const storedIds: string[] = [];
    try {
      for (const item of prepared) {
        const objectKey = `${recordId}/${category}/${item.id}.${item.detected.extension}`;
        await bucket.put(objectKey, item.bytes, {
          httpMetadata: { contentType: item.detected.contentType },
          customMetadata: { owner: user.email, recordId, category },
        });
        storedKeys.push(objectKey);
        const createdAt = new Date().toISOString();
        await db.insert(photos).values({
          id: item.id,
          recordId,
          category,
          objectKey,
          filename: item.filename,
          contentType: item.detected.contentType,
          size: item.bytes.byteLength,
          note: item.note,
          createdBy: user.email,
          createdAt,
        });
        storedIds.push(item.id);
        created.push({
          id: item.id,
          recordId,
          category,
          filename: item.filename,
          contentType: item.detected.contentType,
          size: item.bytes.byteLength,
          note: item.note,
          createdBy: user.email,
          createdAt,
          url: `/api/photos/${item.id}`,
        });
      }
    } catch (error) {
      if (storedIds.length) {
        await db.delete(photos).where(inArray(photos.id, storedIds)).catch(() => undefined);
      }
      if (storedKeys.length) {
        await bucket.delete(storedKeys).catch(() => undefined);
      }
      throw error;
    }

    return secureJson({ photos: created }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "图片上传失败");
  }
}
