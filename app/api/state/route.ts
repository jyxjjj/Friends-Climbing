import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { getDb } from "../../../db";
import { members, photos, plans, tripRecords } from "../../../db/schema";
import {
  EMPTY_BUDGET,
  type AppState,
  type BodyMetric,
  type Budget,
  type CurrentUser,
  type Difficulty,
  type ExpenseItem,
  type Member,
  type Plan,
  type TripRecord,
} from "../../lib/models";
import { getRequestUser } from "../../lib/request-user";
import {
  HttpError,
  assertSameOrigin,
  errorResponse,
  readJsonObject,
  secureJson,
} from "../../lib/security";
import {
  asMember,
  asPlan,
  asRecord,
  parseDeleteEnvelope,
  parseMemberInput,
  parseMutationEnvelope,
  parsePlanInput,
  parseRecordInput,
} from "../../lib/validation";

export const dynamic = "force-dynamic";

type Db = Awaited<ReturnType<typeof getDb>>;

async function getBucket() {
  const { env } = await import("cloudflare:workers");
  return (env as unknown as { BUCKET: R2Bucket }).BUCKET;
}

function jsonArray<T>(value: string, fallback: T[]): T[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch {
    return fallback;
  }
}

function jsonObject<T extends object>(value: string, fallback: T): T {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? ({ ...fallback, ...parsed } as T)
      : fallback;
  } catch {
    return fallback;
  }
}

function now() {
  return new Date().toISOString();
}

function difficultyValue(value: unknown): Difficulty {
  return ["休闲", "进阶", "速穿", "重装"].includes(String(value))
    ? (value as Difficulty)
    : "休闲";
}

function parseMember(row: typeof members.$inferSelect): Member {
  return row;
}

function parsePlan(row: typeof plans.$inferSelect): Plan {
  return {
    id: row.id,
    routeName: row.routeName,
    difficulty: difficultyValue(row.difficulty),
    tripDate: row.tripDate,
    plannedDistance: row.plannedDistance,
    plannedDuration: row.plannedDuration,
    plannedElevation: row.plannedElevation,
    participants: jsonArray<string>(row.participantsJson, []),
    budget: jsonObject<Budget>(row.budgetJson, { ...EMPTY_BUDGET }),
    equipment: row.equipment,
    risks: row.risks,
    waterPoints: row.waterPoints,
    status: ["upcoming", "completed", "cancelled"].includes(row.status)
      ? (row.status as Plan["status"])
      : "upcoming",
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function parseRecord(row: typeof tripRecords.$inferSelect): TripRecord {
  return {
    id: row.id,
    sourcePlanId: row.sourcePlanId,
    routeName: row.routeName,
    difficulty: difficultyValue(row.difficulty),
    tripDate: row.tripDate,
    actualDistance: row.actualDistance,
    actualDuration: row.actualDuration,
    actualElevation: row.actualElevation,
    participants: jsonArray<string>(row.participantsJson, []),
    expenses: jsonArray<ExpenseItem>(row.expensesJson, []),
    bodyData: jsonArray<BodyMetric>(row.bodyDataJson, []),
    roadCondition: row.roadCondition,
    routeRisk: row.routeRisk,
    experience: row.experience,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function readState(db: Db, currentUser: CurrentUser): Promise<AppState> {
  const memberRows = await db.select().from(members).orderBy(asc(members.createdAt));
  const planRows = await db.select().from(plans).orderBy(desc(plans.tripDate));
  const recordRows = await db.select().from(tripRecords).orderBy(desc(tripRecords.tripDate));
  const photoRows = await db.select().from(photos).orderBy(asc(photos.createdAt));
  return {
    currentUser,
    members: memberRows.map(parseMember),
    plans: planRows.map(parsePlan),
    records: recordRows.map(parseRecord),
    photos: photoRows.map((photo) => ({
      id: photo.id,
      recordId: photo.recordId,
      category: photo.category as AppState["photos"][number]["category"],
      filename: photo.filename,
      contentType: photo.contentType,
      size: photo.size,
      note: photo.note,
      createdBy: photo.createdBy,
      createdAt: photo.createdAt,
      url: `/api/photos/${photo.id}`,
    })),
  };
}

function requireUser(request: Request) {
  const user = getRequestUser(request);
  if (!user) throw new HttpError(401, "AUTH_REQUIRED", "请先登录后再访问团队数据");
  return user;
}

async function assertParticipantsExist(db: Db, participantIds: string[]) {
  const rows = await db
    .select({ id: members.id })
    .from(members)
    .where(and(inArray(members.id, participantIds), eq(members.isArchived, false)));
  if (rows.length !== participantIds.length) {
    throw new HttpError(400, "PARTICIPANT_INVALID", "同行成员不存在或已归档");
  }
}

async function assertIdAvailable(
  db: Db,
  resource: "member" | "plan" | "record",
  id: string,
) {
  const table = resource === "member" ? members : resource === "plan" ? plans : tripRecords;
  const rows = await db.select({ id: table.id }).from(table).where(eq(table.id, id)).limit(1);
  if (rows.length) throw new HttpError(409, "ID_CONFLICT", "数据 ID 已存在");
}

export async function GET(request: Request) {
  try {
    const user = requireUser(request);
    const db = await getDb();
    return secureJson(await readState(db, user));
  } catch (error) {
    return errorResponse(error, "读取数据失败");
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = requireUser(request);
    const payload = parseMutationEnvelope(await readJsonObject(request));
    const { resource, item } = payload;
    const timestamp = now();
    const db = await getDb();

    if (resource === "member") {
      const input = parseMemberInput(item);
      const id = input.id ?? crypto.randomUUID();
      await assertIdAvailable(db, resource, id);
      await db.insert(members).values({
        id,
        ...asMember(input),
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    } else if (resource === "plan") {
      const input = parsePlanInput(item);
      const id = input.id ?? crypto.randomUUID();
      const plan = asPlan(input);
      await assertIdAvailable(db, resource, id);
      await assertParticipantsExist(db, plan.participants);
      await db.insert(plans).values({
        id,
        routeName: plan.routeName,
        difficulty: plan.difficulty,
        tripDate: plan.tripDate,
        plannedDistance: plan.plannedDistance,
        plannedDuration: plan.plannedDuration,
        plannedElevation: plan.plannedElevation,
        participantsJson: JSON.stringify(plan.participants),
        budgetJson: JSON.stringify(plan.budget),
        equipment: plan.equipment,
        risks: plan.risks,
        waterPoints: plan.waterPoints,
        status: "upcoming",
        createdBy: user.email,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
    } else if (resource === "record") {
      const input = parseRecordInput(item);
      const id = input.id ?? crypto.randomUUID();
      const record = asRecord(input);
      await assertIdAvailable(db, resource, id);
      await assertParticipantsExist(db, record.participants);
      if (record.sourcePlanId) {
        const [source] = await db
          .select()
          .from(plans)
          .where(eq(plans.id, record.sourcePlanId))
          .limit(1);
        if (!source) throw new HttpError(404, "PLAN_NOT_FOUND", "来源计划不存在");
        if (source.createdBy !== user.email) {
          throw new HttpError(403, "PLAN_FORBIDDEN", "不能从其他创建人的计划生成记录");
        }
        const linked = await db
          .select({ id: tripRecords.id })
          .from(tripRecords)
          .where(eq(tripRecords.sourcePlanId, record.sourcePlanId))
          .limit(1);
        if (linked.length) {
          throw new HttpError(409, "PLAN_ALREADY_USED", "该计划已经生成完成记录");
        }
      }
      await db.insert(tripRecords).values({
        id,
        sourcePlanId: record.sourcePlanId,
        routeName: record.routeName,
        difficulty: record.difficulty,
        tripDate: record.tripDate,
        actualDistance: record.actualDistance,
        actualDuration: record.actualDuration,
        actualElevation: record.actualElevation,
        participantsJson: JSON.stringify(record.participants),
        expensesJson: JSON.stringify(record.expenses),
        bodyDataJson: JSON.stringify(record.bodyData),
        roadCondition: record.roadCondition,
        routeRisk: record.routeRisk,
        experience: record.experience,
        createdBy: user.email,
        createdAt: timestamp,
        updatedAt: timestamp,
      });
      if (record.sourcePlanId) {
        await db
          .update(plans)
          .set({ status: "completed", updatedAt: timestamp })
          .where(and(eq(plans.id, record.sourcePlanId), eq(plans.createdBy, user.email)));
      }
    }

    return secureJson(await readState(db, user), { status: 201 });
  } catch (error) {
    return errorResponse(error, "保存失败");
  }
}

export async function PUT(request: Request) {
  try {
    assertSameOrigin(request);
    const user = requireUser(request);
    const { resource, item } = parseMutationEnvelope(await readJsonObject(request));
    const timestamp = now();
    const db = await getDb();

    if (resource === "member") {
      const input = parseMemberInput(item, true);
      const id = input.id!;
      const [existing] = await db.select({ id: members.id }).from(members).where(eq(members.id, id)).limit(1);
      if (!existing) throw new HttpError(404, "MEMBER_NOT_FOUND", "成员不存在");
      await db
        .update(members)
        .set({ ...asMember(input), updatedAt: timestamp })
        .where(eq(members.id, id));
    } else if (resource === "plan") {
      const input = parsePlanInput(item, true);
      const id = input.id!;
      const [existing] = await db.select().from(plans).where(eq(plans.id, id)).limit(1);
      if (!existing) throw new HttpError(404, "PLAN_NOT_FOUND", "计划不存在");
      if (existing.createdBy !== user.email) {
        throw new HttpError(403, "PLAN_FORBIDDEN", "只有计划创建人可以编辑");
      }
      const plan = asPlan(input);
      await assertParticipantsExist(db, plan.participants);
      await db
        .update(plans)
        .set({
          routeName: plan.routeName,
          difficulty: plan.difficulty,
          tripDate: plan.tripDate,
          plannedDistance: plan.plannedDistance,
          plannedDuration: plan.plannedDuration,
          plannedElevation: plan.plannedElevation,
          participantsJson: JSON.stringify(plan.participants),
          budgetJson: JSON.stringify(plan.budget),
          equipment: plan.equipment,
          risks: plan.risks,
          waterPoints: plan.waterPoints,
          status: input.status ?? existing.status,
          updatedAt: timestamp,
        })
        .where(and(eq(plans.id, id), eq(plans.createdBy, user.email)));
    } else if (resource === "record") {
      const input = parseRecordInput(item, true);
      const id = input.id!;
      const [existing] = await db.select().from(tripRecords).where(eq(tripRecords.id, id)).limit(1);
      if (!existing) throw new HttpError(404, "RECORD_NOT_FOUND", "记录不存在");
      if (existing.createdBy !== user.email) {
        throw new HttpError(403, "RECORD_FORBIDDEN", "只有记录创建人可以编辑");
      }
      const record = asRecord(input);
      await assertParticipantsExist(db, record.participants);
      if (record.sourcePlanId) {
        const [source] = await db.select().from(plans).where(eq(plans.id, record.sourcePlanId)).limit(1);
        if (!source) throw new HttpError(404, "PLAN_NOT_FOUND", "来源计划不存在");
        if (source.createdBy !== user.email) {
          throw new HttpError(403, "PLAN_FORBIDDEN", "不能关联其他创建人的计划");
        }
        const linked = await db
          .select({ id: tripRecords.id })
          .from(tripRecords)
          .where(and(eq(tripRecords.sourcePlanId, record.sourcePlanId), ne(tripRecords.id, id)))
          .limit(1);
        if (linked.length) throw new HttpError(409, "PLAN_ALREADY_USED", "该计划已经生成完成记录");
      }
      await db
        .update(tripRecords)
        .set({
          sourcePlanId: record.sourcePlanId,
          routeName: record.routeName,
          difficulty: record.difficulty,
          tripDate: record.tripDate,
          actualDistance: record.actualDistance,
          actualDuration: record.actualDuration,
          actualElevation: record.actualElevation,
          participantsJson: JSON.stringify(record.participants),
          expensesJson: JSON.stringify(record.expenses),
          bodyDataJson: JSON.stringify(record.bodyData),
          roadCondition: record.roadCondition,
          routeRisk: record.routeRisk,
          experience: record.experience,
          updatedAt: timestamp,
        })
        .where(and(eq(tripRecords.id, id), eq(tripRecords.createdBy, user.email)));
    }

    return secureJson(await readState(db, user));
  } catch (error) {
    return errorResponse(error, "更新失败");
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    const user = requireUser(request);
    const payload = parseDeleteEnvelope(await readJsonObject(request));
    const { id } = payload;
    const db = await getDb();

    if (payload.resource === "member") {
      const [existing] = await db.select({ id: members.id }).from(members).where(eq(members.id, id)).limit(1);
      if (!existing) throw new HttpError(404, "MEMBER_NOT_FOUND", "成员不存在");
      await db.update(members).set({ isArchived: true, updatedAt: now() }).where(eq(members.id, id));
    } else if (payload.resource === "plan") {
      const [existing] = await db.select().from(plans).where(eq(plans.id, id)).limit(1);
      if (!existing) throw new HttpError(404, "PLAN_NOT_FOUND", "计划不存在");
      if (existing.createdBy !== user.email) {
        throw new HttpError(403, "PLAN_FORBIDDEN", "只有计划创建人可以删除");
      }
      const linked = await db.select({ id: tripRecords.id }).from(tripRecords).where(eq(tripRecords.sourcePlanId, id)).limit(1);
      if (linked.length) {
        throw new HttpError(409, "PLAN_IN_USE", "该计划已生成完成记录，为保护历史数据不能删除");
      }
      await db.delete(plans).where(and(eq(plans.id, id), eq(plans.createdBy, user.email)));
    } else if (payload.resource === "record") {
      const [existing] = await db.select().from(tripRecords).where(eq(tripRecords.id, id)).limit(1);
      if (!existing) throw new HttpError(404, "RECORD_NOT_FOUND", "记录不存在");
      if (existing.createdBy !== user.email) {
        throw new HttpError(403, "RECORD_FORBIDDEN", "只有记录创建人可以删除");
      }
      const linkedPhotos = await db.select().from(photos).where(eq(photos.recordId, id));
      const bucket = await getBucket();
      if (linkedPhotos.length) {
        await bucket.delete(linkedPhotos.map((photo) => photo.objectKey));
      }
      await db.delete(photos).where(eq(photos.recordId, id));
      await db.delete(tripRecords).where(and(eq(tripRecords.id, id), eq(tripRecords.createdBy, user.email)));
    }

    return secureJson(await readState(db, user));
  } catch (error) {
    return errorResponse(error, "删除失败");
  }
}
