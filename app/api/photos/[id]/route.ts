import { eq } from "drizzle-orm";
import { getDb } from "../../../../db";
import { photos, tripRecords } from "../../../../db/schema";
import { getRequestUser } from "../../../lib/request-user";
import {
  HttpError,
  assertSameOrigin,
  errorResponse,
  readJsonObject,
  safeId,
  sanitizeDisplayFilename,
  secureJson,
} from "../../../lib/security";
import { parsePhotoNote } from "../../../lib/validation";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

async function getBucket() {
  const { env } = await import("cloudflare:workers");
  return (env as unknown as { BUCKET: R2Bucket }).BUCKET;
}

function requireUser(request: Request) {
  const user = getRequestUser(request);
  if (!user) throw new HttpError(401, "AUTH_REQUIRED", "请先登录");
  return user;
}

export async function GET(request: Request, context: Context) {
  try {
    requireUser(request);
    const id = safeId((await context.params).id, "图片 ID");
    const db = await getDb();
    const [photo] = await db.select().from(photos).where(eq(photos.id, id)).limit(1);
    if (!photo) throw new HttpError(404, "PHOTO_NOT_FOUND", "图片不存在");
    const object = await (await getBucket()).get(photo.objectKey);
    if (!object) throw new HttpError(404, "PHOTO_FILE_NOT_FOUND", "图片文件不存在");
    const headers = new Headers({
      "Cache-Control": "no-store, private",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(sanitizeDisplayFilename(photo.filename))}`,
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; sandbox",
      "Content-Type": photo.contentType,
      "Cross-Origin-Resource-Policy": "same-origin",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    });
    return new Response(object.body, { headers });
  } catch (error) {
    return errorResponse(error, "图片读取失败");
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = requireUser(request);
    const id = safeId((await context.params).id, "图片 ID");
    const payload = await readJsonObject(request, 4 * 1024);
    const note = parsePhotoNote(payload.note);
    const db = await getDb();
    const [photo] = await db.select().from(photos).where(eq(photos.id, id)).limit(1);
    if (!photo) throw new HttpError(404, "PHOTO_NOT_FOUND", "图片不存在");
    const [record] = await db
      .select()
      .from(tripRecords)
      .where(eq(tripRecords.id, photo.recordId))
      .limit(1);
    if (!record || record.createdBy !== user.email) {
      throw new HttpError(403, "PHOTO_FORBIDDEN", "只有记录创建人可以修改图片");
    }
    await db.update(photos).set({ note }).where(eq(photos.id, id));
    return secureJson({ ok: true });
  } catch (error) {
    return errorResponse(error, "图片备注更新失败");
  }
}

export async function DELETE(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const user = requireUser(request);
    const id = safeId((await context.params).id, "图片 ID");
    const db = await getDb();
    const [photo] = await db.select().from(photos).where(eq(photos.id, id)).limit(1);
    if (!photo) throw new HttpError(404, "PHOTO_NOT_FOUND", "图片不存在");
    const [record] = await db
      .select()
      .from(tripRecords)
      .where(eq(tripRecords.id, photo.recordId))
      .limit(1);
    if (!record || record.createdBy !== user.email) {
      throw new HttpError(403, "PHOTO_FORBIDDEN", "只有记录创建人可以删除图片");
    }
    await (await getBucket()).delete(photo.objectKey);
    await db.delete(photos).where(eq(photos.id, id));
    return secureJson({ ok: true });
  } catch (error) {
    return errorResponse(error, "图片删除失败");
  }
}
