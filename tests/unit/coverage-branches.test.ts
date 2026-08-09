import { describe, expect, it } from "vitest";
import {
  buildSpreadsheetXml,
  stripInvalidXml,
  worksheet,
} from "../../app/lib/export-core";
import {
  loadDraft,
  sanitizePlanDraft,
  sanitizeRecordDraft,
  saveDraft,
} from "../../app/lib/drafts";
import { getRequestUser } from "../../app/lib/request-user";
import { HttpError, readJsonObject } from "../../app/lib/security";
import { asPlan, asRecord, parsePlanInput, parseRecordInput } from "../../app/lib/validation";
import { clone, validRecord, validState } from "./fixtures";

class StorageStub {
  value: string | null = null;
  getItem() { return this.value; }
  setItem(_key: string, value: string) { this.value = value; }
  removeItem() { this.value = null; }
}

describe("explicit defensive branches", () => {
  it.each([null, undefined, 0, false])("normalizes nullish/non-text XML value %j", (value) => {
    expect(stripInvalidXml(value)).toBe(value == null ? "" : String(value));
  });

  it.each([NaN, Infinity, -Infinity])("never emits non-finite %j as a numeric spreadsheet cell", (value) => {
    const xml = worksheet("", [[value]]);
    expect(xml).toContain('ss:Name="数据"');
    expect(xml).toContain('ss:Type="String"');
    expect(xml).not.toContain('ss:Type="Number"');
  });

  it("covers absent optional workbook relationships and values", () => {
    const state = clone(validState);
    state.records[0].sourcePlanId = null;
    state.records[0].participants = ["missing-member"];
    state.records[0].expenses[0].note = undefined;
    state.records[0].bodyData = [{
      memberId: "missing-member",
      beforeWeight: null,
      afterWeight: null,
      beforeBodyFat: null,
      afterBodyFat: null,
    }];
    const xml = buildSpreadsheetXml(state, state.records[0]);
    expect(xml).toContain("missing-member");
    expect(xml).not.toContain("undefined");
  });

  it("rejects content length before reading a JSON stream", async () => {
    const request = new Request("https://app.test/api", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": "999",
      },
      body: "{}",
    });
    await expect(readJsonObject(request, 10)).rejects.toMatchObject({
      code: "BODY_TOO_LARGE",
    });
  });

  it("maps malformed UTF-8 to a controlled encoding error", async () => {
    const request = new Request("https://app.test/api", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: new Uint8Array([0xff, 0xfe]),
    });
    await expect(readJsonObject(request)).rejects.toMatchObject({
      code: "BODY_ENCODING_INVALID",
    });
  });

  it("fails closed for a JSON request without a body", async () => {
    const request = new Request("https://app.test/api", {
      method: "POST",
      headers: { "content-type": "application/json" },
    });
    await expect(readJsonObject(request)).rejects.toBeInstanceOf(HttpError);
  });

  it("walks nested arrays while checking unsafe JSON keys", async () => {
    const request = new Request("https://app.test/api", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: '{"items":[{"safe":true},[1,2,3]]}',
    });
    await expect(readJsonObject(request)).resolves.toEqual({
      items: [{ safe: true }, [1, 2, 3]],
    });
  });

  it.each(["https://terminal.local/api", "http://localhost/api"])(
    "does not invent an identity for unauthenticated local requests on %s",
    (url) => {
      expect(getRequestUser(new Request(url))).toBeNull();
    },
  );

  it("normalizes every non-sensitive draft primitive fallback", () => {
    expect(sanitizePlanDraft({
      routeName: 1,
      difficulty: null,
      tripDate: {},
      plannedDistance: Infinity,
      plannedDuration: "x".repeat(33),
      plannedElevation: {},
      equipment: null,
      risks: 1,
      waterPoints: [],
    })).toEqual({
      routeName: "",
      difficulty: "休闲",
      tripDate: "",
      plannedDistance: "",
      plannedDuration: "",
      plannedElevation: "",
      equipment: "",
      risks: "",
      waterPoints: "",
    });
    expect(sanitizeRecordDraft({
      difficulty: "休闲",
      actualDistance: Infinity,
      actualDuration: "1",
      actualElevation: null,
    })).toMatchObject({
      actualDistance: 0,
      actualDuration: 0,
      actualElevation: 0,
    });
  });

  it("uses default plan status and nullable source plan fallbacks", () => {
    const plan = { ...validState.plans[0] } as unknown as Record<string, unknown>;
    delete plan.status;
    delete plan.createdBy;
    delete plan.createdAt;
    delete plan.updatedAt;
    expect(asPlan(parsePlanInput(plan)).status).toBe("upcoming");

    const record = clone(validRecord) as unknown as Record<string, unknown>;
    delete record.sourcePlanId;
    delete record.createdBy;
    delete record.createdAt;
    delete record.updatedAt;
    expect(asRecord(parseRecordInput(record)).sourcePlanId).toBeNull();
  });

  it("loads a valid record envelope through the record sanitizer branch", () => {
    const storage = new StorageStub();
    expect(saveDraft(storage, "key", "record", {
      routeName: "山",
      difficulty: "休闲",
      actualDistance: 1,
      actualDuration: 2,
      actualElevation: 3,
    }, 1_000)).toBe(true);
    expect(loadDraft(storage, "key", "record", 1_001)).toMatchObject({
      routeName: "山",
      actualDistance: 1,
    });
  });
});
