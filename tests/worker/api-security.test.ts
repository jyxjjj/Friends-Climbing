import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import {
  DELETE as deleteState,
  GET as getState,
  POST as postState,
  PUT as putState,
} from "../../app/api/state/route";
import { POST as uploadPhotos } from "../../app/api/photos/route";
import {
  DELETE as deletePhoto,
  GET as getPhoto,
  PATCH as patchPhoto,
} from "../../app/api/photos/[id]/route";
import { EMPTY_BUDGET } from "../../app/lib/models";

const ORIGIN = "https://app.example.test";
const CREATOR = "creator@example.com";
const OTHER = "other@example.com";
const NOW = "2026-08-09T00:00:00.000Z";

async function seedMembers() {
  const statements = ["m-one", "m-two", "m-three"].map((id, index) =>
    env.DB.prepare(
      "INSERT INTO members (id,nickname,real_name,base_weight,base_body_fat,equipment_notes,is_archived,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
    ).bind(id, `成员${index + 1}`, `真实${index + 1}`, 60 + index, 18 + index, "", 0, NOW, NOW),
  );
  await env.DB.batch(statements);
}

async function seedPlan(owner = CREATOR, id = "p-one") {
  await env.DB.prepare(
    "INSERT INTO plans (id,route_name,difficulty,trip_date,planned_distance,planned_duration,planned_elevation,participants_json,budget_json,equipment,risks,water_points,status,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  ).bind(
    id,
    "示例山脊 A",
    "进阶",
    "2020-08-16",
    18.5,
    420,
    1240,
    JSON.stringify(["m-one", "m-two"]),
    JSON.stringify(EMPTY_BUDGET),
    "",
    "",
    "",
    "upcoming",
    owner,
    NOW,
    NOW,
  ).run();
}

async function seedRecord(owner = CREATOR, id = "r-one", sourcePlanId: string | null = null) {
  await env.DB.prepare(
    "INSERT INTO trip_records (id,source_plan_id,route_name,difficulty,trip_date,actual_distance,actual_duration,actual_elevation,participants_json,expenses_json,body_data_json,road_condition,route_risk,experience,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
  ).bind(
    id,
    sourcePlanId,
    "示例山脊 B",
    "速穿",
    "2026-08-02",
    14.8,
    318,
    1126,
    JSON.stringify(["m-one", "m-two"]),
    JSON.stringify([]),
    JSON.stringify([]),
    "",
    "",
    "",
    owner,
    NOW,
    NOW,
  ).run();
}

function requestHeaders(
  user: string | null = CREATOR,
  options: {
    origin?: string | null;
    marker?: string | null;
    contentType?: string | null;
    fetchSite?: string | null;
  } = {},
) {
  const headers = new Headers();
  const origin = options.origin === undefined ? ORIGIN : options.origin;
  const marker = options.marker === undefined ? "1" : options.marker;
  const contentType = options.contentType === undefined ? "application/json" : options.contentType;
  const fetchSite = options.fetchSite === undefined ? "same-origin" : options.fetchSite;
  if (user) headers.set("oai-authenticated-user-email", user);
  if (origin) headers.set("origin", origin);
  if (marker) headers.set("x-summit-request", marker);
  if (contentType) headers.set("content-type", contentType);
  if (fetchSite) headers.set("sec-fetch-site", fetchSite);
  return headers;
}

function stateRequest(
  method: "GET" | "POST" | "PUT" | "DELETE",
  body?: unknown,
  user: string | null = CREATOR,
  options: Parameters<typeof requestHeaders>[1] = {},
) {
  return new Request(`${ORIGIN}/api/state`, {
    method,
    headers: requestHeaders(user, options),
    body: method === "GET" ? undefined : JSON.stringify(body),
  });
}

function planItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "p-created",
    routeName: "示例山脊 A 环线",
    difficulty: "进阶",
    tripDate: "2020-08-16",
    plannedDistance: 18.5,
    plannedDuration: 420,
    plannedElevation: 1240,
    participants: ["m-one", "m-two"],
    budget: { ...EMPTY_BUDGET },
    equipment: "",
    risks: "",
    waterPoints: "",
    ...overrides,
  };
}

function recordItem(overrides: Record<string, unknown> = {}) {
  return {
    id: "r-created",
    sourcePlanId: null,
    routeName: "示例山脊 B",
    difficulty: "速穿",
    tripDate: "2026-08-02",
    actualDistance: 14.8,
    actualDuration: 318,
    actualElevation: 1126,
    participants: ["m-one", "m-two"],
    expenses: [],
    bodyData: [],
    roadCondition: "",
    routeRisk: "",
    experience: "",
    ...overrides,
  };
}

async function tableCount(table: "members" | "plans" | "trip_records" | "photos") {
  const result = await env.DB.prepare(`SELECT COUNT(*) AS count FROM ${table}`).first<{ count: number }>();
  return result?.count ?? 0;
}

beforeEach(async () => {
  await seedMembers();
});

describe("state API authentication, CSRF and validation", () => {
  it("returns authenticated team state with private headers", async () => {
    const response = await getState(stateRequest("GET"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    const body = await response.json() as { currentUser: { email: string }; members: unknown[] };
    expect(body.currentUser.email).toBe(CREATOR);
    expect(body.members).toHaveLength(3);
  });

  it("returns an empty authenticated state without auto-seeding or writing data", async () => {
    await env.DB.prepare("DELETE FROM members").run();

    const response = await getState(stateRequest("GET"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      currentUser: { email: CREATOR },
      members: [],
      plans: [],
      records: [],
      photos: [],
    });
    await expect(Promise.all([
      tableCount("members"),
      tableCount("plans"),
      tableCount("trip_records"),
      tableCount("photos"),
    ])).resolves.toEqual([0, 0, 0, 0]);
  });

  it("rejects an anonymous read without seeding or mutating data", async () => {
    const before = await tableCount("members");
    const response = await getState(stateRequest("GET", undefined, null));
    expect(response.status).toBe(401);
    expect(await tableCount("members")).toBe(before);
  });

  const csrfCases = [
    { name: "missing origin", options: { origin: null }, status: 403 },
    { name: "null origin", options: { origin: "null" }, status: 403 },
    { name: "cross-site origin", options: { origin: "https://attacker.invalid" }, status: 403 },
    { name: "suffix origin", options: { origin: `${ORIGIN}.attacker.invalid` }, status: 403 },
    { name: "wrong port", options: { origin: `${ORIGIN}:444` }, status: 403 },
    { name: "missing marker", options: { marker: null }, status: 403 },
    { name: "wrong marker", options: { marker: "0" }, status: 403 },
    { name: "cross-site fetch metadata", options: { fetchSite: "cross-site" }, status: 403 },
    { name: "plain text", options: { contentType: "text/plain" }, status: 415 },
    { name: "form encoded", options: { contentType: "application/x-www-form-urlencoded" }, status: 415 },
  ] as const;
  it.each(csrfCases)("$name is rejected with zero database side effects", async ({ options, status }) => {
    const before = await tableCount("plans");
    const response = await postState(
      stateRequest("POST", { resource: "plan", item: planItem() }, CREATOR, options),
    );
    expect(response.status).toBe(status);
    expect(await tableCount("plans")).toBe(before);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("creates a validated plan and ignores ownership mass assignment", async () => {
    const response = await postState(
      stateRequest("POST", {
        resource: "plan",
        item: planItem({ createdBy: OTHER, status: "completed", objectKey: "secret" }),
      }),
    );
    expect(response.status).toBe(201);
    const row = await env.DB.prepare("SELECT created_by,status FROM plans WHERE id=?")
      .bind("p-created")
      .first<{ created_by: string; status: string }>();
    expect(row).toEqual({ created_by: CREATOR, status: "upcoming" });
  });

  it.each([
    ["missing route", { routeName: "" }],
    ["invalid difficulty", { difficulty: "危险" }],
    ["invalid date", { tripDate: "2026-02-30" }],
    ["negative distance", { plannedDistance: -1 }],
    ["fractional duration", { plannedDuration: 1.5 }],
    ["over elevation", { plannedElevation: 30001 }],
    ["empty participants", { participants: [] }],
    ["duplicate participants", { participants: ["m-one", "m-one"] }],
    ["missing participant", { participants: ["m-one", "m-missing"] }],
    ["negative budget", { budget: { ...EMPTY_BUDGET, 油费: -1 } }],
    ["fractional cent", { budget: { ...EMPTY_BUDGET, 油费: 1.001 } }],
    ["control text", { risks: "x\0y" }],
  ])("rejects plan mutation: %s", async (_name, patch) => {
    const response = await postState(
      stateRequest("POST", { resource: "plan", item: planItem(patch) }),
    );
    expect(response.status).toBe(400);
    expect(await tableCount("plans")).toBe(0);
  });

  it("returns a stable conflict instead of leaking a D1 error", async () => {
    await seedPlan(CREATOR, "p-created");
    const response = await postState(
      stateRequest("POST", { resource: "plan", item: planItem() }),
    );
    expect(response.status).toBe(409);
    expect(await response.text()).not.toMatch(/SQL|UNIQUE|stack/i);
  });

  it("generates a record only from a creator-owned plan and marks it completed", async () => {
    await seedPlan();
    const response = await postState(
      stateRequest("POST", {
        resource: "record",
        item: recordItem({ sourcePlanId: "p-one" }),
      }),
    );
    expect(response.status).toBe(201);
    expect(await tableCount("trip_records")).toBe(1);
    const plan = await env.DB.prepare("SELECT status FROM plans WHERE id='p-one'").first<{ status: string }>();
    expect(plan?.status).toBe("completed");
  });

  it("rejects plan-to-record IDOR with zero side effects", async () => {
    await seedPlan(OTHER);
    const response = await postState(
      stateRequest("POST", {
        resource: "record",
        item: recordItem({ sourcePlanId: "p-one" }),
      }),
    );
    expect(response.status).toBe(403);
    expect(await tableCount("trip_records")).toBe(0);
    const plan = await env.DB.prepare("SELECT status FROM plans WHERE id='p-one'").first<{ status: string }>();
    expect(plan?.status).toBe("upcoming");
  });

  it("prevents duplicate generation from one plan", async () => {
    await seedPlan();
    await seedRecord(CREATOR, "r-existing", "p-one");
    const response = await postState(
      stateRequest("POST", {
        resource: "record",
        item: recordItem({ sourcePlanId: "p-one" }),
      }),
    );
    expect(response.status).toBe(409);
    expect(await tableCount("trip_records")).toBe(1);
  });

  it.each([
    ["payer outside participants", { expenses: [{ id: "e-one", category: "油费", amount: 1, payerId: "m-three", note: "" }] }],
    ["duplicate expenses", { expenses: [
      { id: "e-one", category: "油费", amount: 1, payerId: "m-one", note: "" },
      { id: "e-one", category: "午餐", amount: 1, payerId: "m-two", note: "" },
    ] }],
    ["body outsider", { bodyData: [{ memberId: "m-three", beforeWeight: 60, afterWeight: 59, beforeBodyFat: 18, afterBodyFat: 17 }] }],
    ["duplicate body rows", { bodyData: [
      { memberId: "m-one", beforeWeight: null, afterWeight: null, beforeBodyFat: null, afterBodyFat: null },
      { memberId: "m-one", beforeWeight: null, afterWeight: null, beforeBodyFat: null, afterBodyFat: null },
    ] }],
    ["fractional cent", { expenses: [{ id: "e-one", category: "油费", amount: 1.001, payerId: "m-one", note: "" }] }],
  ])("rejects unsafe record structure: %s", async (_name, patch) => {
    const response = await postState(
      stateRequest("POST", { resource: "record", item: recordItem(patch) }),
    );
    expect(response.status).toBe(400);
    expect(await tableCount("trip_records")).toBe(0);
  });
});

describe("object-level authorization matrix", () => {
  const mutationCases = [
    { name: "creator updates own plan", resource: "plan", action: "update", owner: CREATOR, actor: CREATOR, expected: 200 },
    { name: "other cannot update plan", resource: "plan", action: "update", owner: CREATOR, actor: OTHER, expected: 403 },
    { name: "creator deletes own plan", resource: "plan", action: "delete", owner: CREATOR, actor: CREATOR, expected: 200 },
    { name: "other cannot delete plan", resource: "plan", action: "delete", owner: CREATOR, actor: OTHER, expected: 403 },
    { name: "creator updates own record", resource: "record", action: "update", owner: CREATOR, actor: CREATOR, expected: 200 },
    { name: "other cannot update record", resource: "record", action: "update", owner: CREATOR, actor: OTHER, expected: 403 },
    { name: "creator deletes own record", resource: "record", action: "delete", owner: CREATOR, actor: CREATOR, expected: 200 },
    { name: "other cannot delete record", resource: "record", action: "delete", owner: CREATOR, actor: OTHER, expected: 403 },
    { name: "other owner updates own plan", resource: "plan", action: "update", owner: OTHER, actor: OTHER, expected: 200 },
    { name: "creator cannot update other plan", resource: "plan", action: "update", owner: OTHER, actor: CREATOR, expected: 403 },
    { name: "other owner updates own record", resource: "record", action: "update", owner: OTHER, actor: OTHER, expected: 200 },
    { name: "creator cannot update other record", resource: "record", action: "update", owner: OTHER, actor: CREATOR, expected: 403 },
  ] as const;

  it.each(mutationCases)("$name", async ({ resource, action, owner, actor, expected }) => {
    if (resource === "plan") await seedPlan(owner);
    else await seedRecord(owner);
    const beforePlan = await env.DB.prepare("SELECT route_name,created_by FROM plans WHERE id='p-one'").first();
    const beforeRecord = await env.DB.prepare("SELECT route_name,created_by FROM trip_records WHERE id='r-one'").first();
    const response = action === "update"
      ? await putState(
        stateRequest("PUT", {
          resource,
          item: resource === "plan"
            ? { ...planItem({ id: "p-one", routeName: "已更新", createdBy: actor }) }
            : { ...recordItem({ id: "r-one", routeName: "已更新", createdBy: actor }) },
        }, actor),
      )
      : await deleteState(stateRequest("DELETE", { resource, id: resource === "plan" ? "p-one" : "r-one" }, actor));
    expect(response.status).toBe(expected);
    if (expected === 403) {
      const afterPlan = await env.DB.prepare("SELECT route_name,created_by FROM plans WHERE id='p-one'").first();
      const afterRecord = await env.DB.prepare("SELECT route_name,created_by FROM trip_records WHERE id='r-one'").first();
      expect(afterPlan).toEqual(beforePlan);
      expect(afterRecord).toEqual(beforeRecord);
    }
  });

  it("protects a plan that already has a linked record", async () => {
    await seedPlan();
    await seedRecord(CREATOR, "r-linked", "p-one");
    const response = await deleteState(stateRequest("DELETE", { resource: "plan", id: "p-one" }));
    expect(response.status).toBe(409);
    expect(await tableCount("plans")).toBe(1);
  });
});

function photoForm(
  bytes: Uint8Array,
  options: { type?: string; name?: string; note?: string; recordId?: string; category?: string } = {},
) {
  const form = new FormData();
  form.set("recordId", options.recordId ?? "r-one");
  form.set("category", options.category ?? "scenery");
  const copy = Uint8Array.from(bytes);
  form.append("files", new File([copy.buffer], options.name ?? "photo.png", { type: options.type ?? "image/png" }));
  form.set("note-0", options.note ?? "山脊");
  return form;
}

function photoRequest(
  form: FormData,
  user: string | null = CREATOR,
  origin: string | null = ORIGIN,
  marker: string | null = "1",
) {
  const headers = new Headers();
  if (user) headers.set("oai-authenticated-user-email", user);
  if (origin) headers.set("origin", origin);
  if (marker) headers.set("x-summit-request", marker);
  headers.set("sec-fetch-site", "same-origin");
  return new Request(`${ORIGIN}/api/photos`, { method: "POST", headers, body: form });
}

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
]);

describe("private photo lifecycle", () => {
  beforeEach(async () => {
    await seedRecord();
  });

  it("stores a validated image under a server-generated private key", async () => {
    const response = await uploadPhotos(photoRequest(photoForm(PNG, { name: "../../cloud.png" })));
    expect(response.status).toBe(201);
    const body = await response.json() as { photos: Array<{ id: string; filename: string; contentType: string }> };
    expect(body.photos[0].filename).toBe("cloud.png");
    expect(body.photos[0].contentType).toBe("image/png");
    const row = await env.DB.prepare("SELECT object_key,filename,content_type FROM photos").first<{
      object_key: string; filename: string; content_type: string;
    }>();
    expect(row?.object_key).toMatch(/^r-one\/scenery\/[0-9a-f-]+\.png$/);
    expect(row?.object_key).not.toContain("cloud");
    expect((await env.BUCKET.head(row!.object_key))).not.toBeNull();
  });

  const rejectedFiles = [
    { name: "empty", bytes: new Uint8Array(), type: "image/png", status: 400 },
    { name: "SVG", bytes: new TextEncoder().encode("<svg/>"), type: "image/svg+xml", status: 400 },
    { name: "HTML", bytes: new TextEncoder().encode("<html/>"), type: "text/html", status: 400 },
    { name: "ZIP", bytes: new Uint8Array([0x50, 0x4b, 0x03, 0x04]), type: "image/png", status: 400 },
    { name: "GIF", bytes: new TextEncoder().encode("GIF89a"), type: "image/gif", status: 400 },
    { name: "PNG declared JPEG", bytes: PNG, type: "image/jpeg", status: 400 },
    { name: "unknown image", bytes: new Uint8Array([1, 2, 3, 4]), type: "image/png", status: 400 },
  ];
  it.each(rejectedFiles)("$name is rejected with no D1 or R2 residue", async ({ bytes, type, status }) => {
    const response = await uploadPhotos(photoRequest(photoForm(bytes, { type })));
    expect(response.status).toBe(status);
    expect(await tableCount("photos")).toBe(0);
    const listed = await env.BUCKET.list();
    expect(listed.objects).toHaveLength(0);
  });

  it.each([
    ["anonymous", null, ORIGIN, "1", 401],
    ["other member", OTHER, ORIGIN, "1", 403],
    ["cross-site", CREATOR, "https://attacker.invalid", "1", 403],
    ["missing marker", CREATOR, ORIGIN, null, 403],
  ] as const)("%s cannot upload", async (_name, user, origin, marker, status) => {
    const response = await uploadPhotos(photoRequest(photoForm(PNG), user, origin, marker));
    expect(response.status).toBe(status);
    expect(await tableCount("photos")).toBe(0);
  });

  async function seedPhoto() {
    const response = await uploadPhotos(photoRequest(photoForm(PNG)));
    const body = await response.json() as { photos: Array<{ id: string }> };
    return body.photos[0].id;
  }

  function photoContext(id: string) {
    return { params: Promise.resolve({ id }) };
  }

  function photoJsonRequest(method: "GET" | "PATCH" | "DELETE", user: string | null, body?: unknown) {
    return new Request(`${ORIGIN}/api/photos/photo-id`, {
      method,
      headers: requestHeaders(user),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  it("serves a private authenticated image with nosniff and no-store", async () => {
    const id = await seedPhoto();
    const response = await getPhoto(photoJsonRequest("GET", OTHER), photoContext(id));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/png");
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(PNG);
  });

  it("rejects anonymous image reads", async () => {
    const id = await seedPhoto();
    const response = await getPhoto(photoJsonRequest("GET", null), photoContext(id));
    expect(response.status).toBe(401);
  });

  it("allows only the record creator to edit a bounded note", async () => {
    const id = await seedPhoto();
    const denied = await patchPhoto(photoJsonRequest("PATCH", OTHER, { note: "other" }), photoContext(id));
    expect(denied.status).toBe(403);
    const allowed = await patchPhoto(photoJsonRequest("PATCH", CREATOR, { note: "<script>alert(1)</script>" }), photoContext(id));
    expect(allowed.status).toBe(200);
    const row = await env.DB.prepare("SELECT note FROM photos WHERE id=?").bind(id).first<{ note: string }>();
    expect(row?.note).toBe("<script>alert(1)</script>");
  });

  it("allows only the record creator to delete D1 and R2 objects", async () => {
    const id = await seedPhoto();
    const row = await env.DB.prepare("SELECT object_key FROM photos WHERE id=?").bind(id).first<{ object_key: string }>();
    const denied = await deletePhoto(photoJsonRequest("DELETE", OTHER), photoContext(id));
    expect(denied.status).toBe(403);
    expect(await env.BUCKET.head(row!.object_key)).not.toBeNull();
    const allowed = await deletePhoto(photoJsonRequest("DELETE", CREATOR), photoContext(id));
    expect(allowed.status).toBe(200);
    expect(await tableCount("photos")).toBe(0);
    expect(await env.BUCKET.head(row!.object_key)).toBeNull();
  });
});
