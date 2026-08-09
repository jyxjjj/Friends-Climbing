import { index, integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const members = sqliteTable(
  "members",
  {
    id: text("id").primaryKey(),
    nickname: text("nickname").notNull(),
    realName: text("real_name").notNull(),
    baseWeight: real("base_weight").notNull(),
    baseBodyFat: real("base_body_fat").notNull(),
    equipmentNotes: text("equipment_notes").notNull().default(""),
    isArchived: integer("is_archived", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("members_nickname_idx").on(table.nickname)],
);

export const plans = sqliteTable(
  "plans",
  {
    id: text("id").primaryKey(),
    routeName: text("route_name").notNull(),
    difficulty: text("difficulty").notNull(),
    tripDate: text("trip_date").notNull(),
    plannedDistance: real("planned_distance").notNull(),
    plannedDuration: integer("planned_duration").notNull(),
    plannedElevation: integer("planned_elevation").notNull(),
    participantsJson: text("participants_json").notNull(),
    budgetJson: text("budget_json").notNull(),
    equipment: text("equipment").notNull().default(""),
    risks: text("risks").notNull().default(""),
    waterPoints: text("water_points").notNull().default(""),
    status: text("status").notNull().default("upcoming"),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("plans_trip_date_idx").on(table.tripDate),
    index("plans_creator_idx").on(table.createdBy),
  ],
);

export const tripRecords = sqliteTable(
  "trip_records",
  {
    id: text("id").primaryKey(),
    sourcePlanId: text("source_plan_id"),
    routeName: text("route_name").notNull(),
    difficulty: text("difficulty").notNull(),
    tripDate: text("trip_date").notNull(),
    actualDistance: real("actual_distance").notNull(),
    actualDuration: integer("actual_duration").notNull(),
    actualElevation: integer("actual_elevation").notNull(),
    participantsJson: text("participants_json").notNull(),
    expensesJson: text("expenses_json").notNull(),
    bodyDataJson: text("body_data_json").notNull(),
    roadCondition: text("road_condition").notNull().default(""),
    routeRisk: text("route_risk").notNull().default(""),
    experience: text("experience").notNull().default(""),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    index("records_trip_date_idx").on(table.tripDate),
    index("records_creator_idx").on(table.createdBy),
    index("records_plan_idx").on(table.sourcePlanId),
  ],
);

export const photos = sqliteTable(
  "photos",
  {
    id: text("id").primaryKey(),
    recordId: text("record_id").notNull(),
    category: text("category").notNull(),
    objectKey: text("object_key").notNull(),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    note: text("note").notNull().default(""),
    createdBy: text("created_by").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [index("photos_record_idx").on(table.recordId)],
);
