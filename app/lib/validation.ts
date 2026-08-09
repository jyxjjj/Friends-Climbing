import { z } from "zod";
import {
  BUDGET_CATEGORIES,
  type BodyMetric,
  type Budget,
  type ExpenseItem,
  type Member,
  type Plan,
  type TripRecord,
} from "./models";
import { HttpError } from "./security";

const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

const cleanText = (label: string, maximum: number, minimum = 0) =>
  z
    .string({ error: `${label}必须是文本` })
    .trim()
    .min(minimum, `${label}不能为空`)
    .max(maximum, `${label}不能超过 ${maximum} 个字符`)
    .refine((value) => !CONTROL_CHARACTERS.test(value), `${label}包含不允许的控制字符`);

const optionalText = (label: string, maximum: number) =>
  cleanText(label, maximum).default("");

const idSchema = z
  .string({ error: "数据 ID 必须是文本" })
  .trim()
  .regex(ID_PATTERN, "数据 ID 格式无效");

const finiteNumber = (label: string, minimum: number, maximum: number) =>
  z
    .number({ error: `${label}必须是数字` })
    .finite(`${label}必须是有限数字`)
    .min(minimum, `${label}不能小于 ${minimum}`)
    .max(maximum, `${label}不能大于 ${maximum}`);

const integer = (label: string, minimum: number, maximum: number) =>
  finiteNumber(label, minimum, maximum).int(`${label}必须是整数`);

const decimal = (label: string, minimum: number, maximum: number, places: number) =>
  finiteNumber(label, minimum, maximum).refine((value) => {
    const scale = 10 ** places;
    return Math.abs(Math.round(value * scale) - value * scale) < 1e-7;
  }, `${label}最多保留 ${places} 位小数`);

const dateSchema = z
  .string({ error: "日期必须是文本" })
  .regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式必须是 YYYY-MM-DD")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "日期不存在")
  .refine((value) => value >= "2000-01-01" && value <= "2100-12-31", "日期超出允许范围");

const participantSchema = z
  .array(idSchema)
  .min(1, "至少选择一名同行成员")
  .max(100, "同行成员不能超过 100 人")
  .refine((value) => new Set(value).size === value.length, "同行成员不能重复");

const budgetShape = Object.fromEntries(
  BUDGET_CATEGORIES.map((category) => [
    category,
    decimal(category, 0, 10_000_000, 2),
  ]),
) as Record<(typeof BUDGET_CATEGORIES)[number], z.ZodNumber>;

export const budgetSchema = z.object(budgetShape);

export const memberInputSchema = z.object({
  id: idSchema.optional(),
  nickname: cleanText("昵称", 40, 1),
  realName: cleanText("真实姓名", 80, 1),
  baseWeight: decimal("基础体重", 20, 400, 2),
  baseBodyFat: decimal("基础体脂率", 0.1, 75, 2),
  equipmentNotes: optionalText("装备备注", 2_000),
});

export const planInputSchema = z.object({
  id: idSchema.optional(),
  routeName: cleanText("路线名称", 120, 1),
  difficulty: z.enum(["休闲", "进阶", "速穿", "重装"], { error: "路线难度无效" }),
  tripDate: dateSchema,
  plannedDistance: decimal("计划里程", 0.1, 1_000, 2),
  plannedDuration: integer("计划时长", 1, 20_160),
  plannedElevation: integer("预估爬升", 0, 30_000),
  participants: participantSchema,
  budget: budgetSchema,
  equipment: optionalText("装备清单", 8_000),
  risks: optionalText("路线危险点", 8_000),
  waterPoints: optionalText("水源点位", 8_000),
  status: z.enum(["upcoming", "completed", "cancelled"]).optional(),
});

export const expenseInputSchema = z.object({
  id: idSchema,
  category: z.enum(BUDGET_CATEGORIES, { error: "费用类别无效" }),
  amount: decimal("费用金额", 0, 10_000_000, 2),
  payerId: idSchema,
  note: optionalText("费用备注", 500),
});

const nullableWeight = decimal("体重", 20, 400, 2).nullable();
const nullableBodyFat = decimal("体脂率", 0.1, 75, 2).nullable();

export const bodyMetricInputSchema = z.object({
  memberId: idSchema,
  beforeWeight: nullableWeight,
  afterWeight: nullableWeight,
  beforeBodyFat: nullableBodyFat,
  afterBodyFat: nullableBodyFat,
});

export const recordInputSchema = z
  .object({
    id: idSchema.optional(),
    sourcePlanId: idSchema.nullable().optional().default(null),
    routeName: cleanText("路线名称", 120, 1),
    difficulty: z.enum(["休闲", "进阶", "速穿", "重装"], { error: "路线难度无效" }),
    tripDate: dateSchema,
    actualDistance: decimal("实际里程", 0.1, 1_000, 2),
    actualDuration: integer("实际耗时", 1, 20_160),
    actualElevation: integer("实际爬升", 0, 30_000),
    participants: participantSchema,
    expenses: z.array(expenseInputSchema).max(500, "单条记录最多 500 笔费用"),
    bodyData: z.array(bodyMetricInputSchema).max(100, "身体数据不能超过 100 组"),
    roadCondition: optionalText("路况", 8_000),
    routeRisk: optionalText("路线风险", 8_000),
    experience: optionalText("体验评价", 8_000),
  })
  .superRefine((record, context) => {
    const participantIds = new Set(record.participants);
    const expenseIds = new Set<string>();
    for (const [index, expense] of record.expenses.entries()) {
      if (expenseIds.has(expense.id)) {
        context.addIssue({
          code: "custom",
          path: ["expenses", index, "id"],
          message: "费用 ID 不能重复",
        });
      }
      expenseIds.add(expense.id);
      if (!participantIds.has(expense.payerId)) {
        context.addIssue({
          code: "custom",
          path: ["expenses", index, "payerId"],
          message: "垫付成员必须是同行成员",
        });
      }
    }
    const metricIds = new Set<string>();
    for (const [index, metric] of record.bodyData.entries()) {
      if (metricIds.has(metric.memberId)) {
        context.addIssue({
          code: "custom",
          path: ["bodyData", index, "memberId"],
          message: "同一成员的身体数据不能重复",
        });
      }
      metricIds.add(metric.memberId);
      if (!participantIds.has(metric.memberId)) {
        context.addIssue({
          code: "custom",
          path: ["bodyData", index, "memberId"],
          message: "身体数据成员必须是同行成员",
        });
      }
    }
  });

export const photoCategorySchema = z.enum(["start", "node", "scenery", "finish"], {
  error: "图片分类无效",
});

export const photoNoteSchema = optionalText("图片备注", 500);

export type MemberInput = z.infer<typeof memberInputSchema>;
export type PlanInput = z.infer<typeof planInputSchema>;
export type RecordInput = z.infer<typeof recordInputSchema>;

function validationError(error: z.ZodError): HttpError {
  const issue = error.issues[0];
  const field = issue?.path.join(".");
  const message = field ? `${field}：${issue.message}` : issue?.message ?? "提交数据无效";
  return new HttpError(400, "VALIDATION_FAILED", message);
}

function parseWithId<T extends { id?: string }>(
  schema: z.ZodType<T>,
  input: unknown,
  requireId: boolean,
): T {
  const result = schema.safeParse(input);
  if (!result.success) throw validationError(result.error);
  if (requireId && !result.data.id) {
    throw new HttpError(400, "ID_REQUIRED", "缺少数据 ID");
  }
  return result.data;
}

export function parseMemberInput(input: unknown, requireId = false): MemberInput {
  return parseWithId(memberInputSchema, input, requireId);
}

export function parsePlanInput(input: unknown, requireId = false): PlanInput {
  return parseWithId(planInputSchema, input, requireId);
}

export function parseRecordInput(input: unknown, requireId = false): RecordInput {
  return parseWithId(recordInputSchema, input, requireId);
}

export function parsePhotoCategory(input: unknown): z.infer<typeof photoCategorySchema> {
  const result = photoCategorySchema.safeParse(input);
  if (!result.success) throw validationError(result.error);
  return result.data;
}

export function parsePhotoNote(input: unknown): string {
  const result = photoNoteSchema.safeParse(typeof input === "string" ? input : "");
  if (!result.success) throw validationError(result.error);
  return result.data;
}

export function parseMutationEnvelope(input: unknown): {
  resource: "member" | "plan" | "record";
  item: Record<string, unknown>;
} {
  const result = z
    .object({
      resource: z.enum(["member", "plan", "record"]),
      item: z.record(z.string(), z.unknown()),
    })
    .safeParse(input);
  if (!result.success) throw validationError(result.error);
  return result.data;
}

export function parseDeleteEnvelope(input: unknown): {
  resource: "member" | "plan" | "record";
  id: string;
} {
  const result = z
    .object({
      resource: z.enum(["member", "plan", "record"]),
      id: idSchema,
    })
    .safeParse(input);
  if (!result.success) throw validationError(result.error);
  return result.data;
}

export function asMember(input: MemberInput): Pick<
  Member,
  "nickname" | "realName" | "baseWeight" | "baseBodyFat" | "equipmentNotes"
> {
  return input;
}

export function asPlan(input: PlanInput): Omit<
  Plan,
  "id" | "createdBy" | "createdAt" | "updatedAt"
> {
  return {
    routeName: input.routeName,
    difficulty: input.difficulty,
    tripDate: input.tripDate,
    plannedDistance: input.plannedDistance,
    plannedDuration: input.plannedDuration,
    plannedElevation: input.plannedElevation,
    participants: input.participants,
    budget: input.budget as Budget,
    equipment: input.equipment,
    risks: input.risks,
    waterPoints: input.waterPoints,
    status: input.status ?? "upcoming",
  };
}

export function asRecord(input: RecordInput): Omit<
  TripRecord,
  "id" | "createdBy" | "createdAt" | "updatedAt"
> {
  return {
    sourcePlanId: input.sourcePlanId ?? null,
    routeName: input.routeName,
    difficulty: input.difficulty,
    tripDate: input.tripDate,
    actualDistance: input.actualDistance,
    actualDuration: input.actualDuration,
    actualElevation: input.actualElevation,
    participants: input.participants,
    expenses: input.expenses as ExpenseItem[],
    bodyData: input.bodyData as BodyMetric[],
    roadCondition: input.roadCondition,
    routeRisk: input.routeRisk,
    experience: input.experience,
  };
}
