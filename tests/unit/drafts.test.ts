import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  DRAFT_SCHEMA_VERSION,
  DRAFT_TTL_MS,
  clearDraft,
  draftStorageKey,
  loadDraft,
  sanitizePlanDraft,
  sanitizeRecordDraft,
  saveDraft,
  type SafePlanDraft,
  type SafeRecordDraft,
} from "../../app/lib/drafts";

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
  serialized() {
    return [...this.values.values()].join("\n");
  }
}

const planDraft = {
  routeName: "示例山脊 A",
  difficulty: "进阶",
  tripDate: "2020-08-16",
  plannedDistance: 18.5,
  plannedDuration: 420,
  plannedElevation: 1240,
  participants: ["m-one", "m-two"],
  budget: { 油费: 360 },
  equipment: "头灯",
  risks: "碎石",
  waterPoints: "村口",
  createdBy: "creator@example.com",
};

const recordDraft = {
  routeName: "示例山脊 B",
  difficulty: "速穿",
  tripDate: "2026-08-02",
  actualDistance: 14.8,
  actualDuration: 318,
  actualElevation: 1126,
  participants: ["m-one", "m-two"],
  expenses: [{ amount: 360, payerId: "m-one", note: "SECRET_EXPENSE" }],
  bodyData: [{ memberId: "m-one", beforeWeight: 71.8, afterWeight: 70.9 }],
  photos: [{ note: "SECRET_PHOTO" }],
  realName: "SECRET_REAL_NAME",
  roadCondition: "湿滑",
  routeRisk: "石阶",
  experience: "稳定",
};

describe("draft key isolation", () => {
  const principals = Array.from({ length: 150 }, (_, index) => `user-${index}@example.com`);
  it.each(principals)("creates an opaque, deterministic key for %s", (principal) => {
    const first = draftStorageKey("plan", principal, "new");
    const second = draftStorageKey("plan", principal.toUpperCase(), "new");
    expect(first).toBe(second);
    expect(first).not.toContain(principal);
    expect(first).toMatch(/^summit:v2:[a-z0-9]+:plan:new$/);
  });

  it("separates principals, resource types and entity IDs", () => {
    const keys = new Set([
      draftStorageKey("plan", "a@example.com", "new"),
      draftStorageKey("record", "a@example.com", "new"),
      draftStorageKey("plan", "b@example.com", "new"),
      draftStorageKey("plan", "a@example.com", "p-one"),
    ]);
    expect(keys.size).toBe(4);
  });

  it.each(["../escape", "x/y", "", " ".repeat(3), "中", "a".repeat(65)])(
    "normalizes unsafe entity key %j",
    (entityId) => {
      expect(draftStorageKey("plan", "a@example.com", entityId)).toMatch(/:plan:new$/);
    },
  );
});

describe("sensitive draft minimization", () => {
  const planSensitiveKeys = ["participants", "budget", "createdBy", "createdAt", "updatedAt"];
  it.each(planSensitiveKeys)("plan drafts exclude %s", (key) => {
    expect(sanitizePlanDraft(planDraft)).not.toHaveProperty(key);
  });

  const recordSensitiveKeys = [
    "participants",
    "expenses",
    "bodyData",
    "photos",
    "realName",
    "createdBy",
    "createdAt",
    "updatedAt",
    "sourcePlanId",
  ];
  it.each(recordSensitiveKeys)("record drafts exclude %s", (key) => {
    expect(sanitizeRecordDraft(recordDraft)).not.toHaveProperty(key);
  });

  it("never serializes sensitive canaries", () => {
    const storage = new MemoryStorage();
    expect(saveDraft(storage, "record-key", "record", recordDraft, 1_000)).toBe(true);
    const serialized = storage.serialized();
    for (const canary of [
      "SECRET_EXPENSE",
      "SECRET_PHOTO",
      "SECRET_REAL_NAME",
      "71.8",
      "70.9",
      "m-one",
      "creator@example.com",
    ]) {
      expect(serialized).not.toContain(canary);
    }
    expect(serialized).toContain("示例山脊 B");
  });

  it("does not modify the input while sanitizing", () => {
    const before = structuredClone(recordDraft);
    sanitizeRecordDraft(recordDraft);
    expect(recordDraft).toEqual(before);
  });

  it.each(["invalid", "", null, undefined, 1, {}, []])(
    "falls back to a safe difficulty for %j",
    (difficulty) => {
      expect(sanitizePlanDraft({ ...planDraft, difficulty }).difficulty).toBe("休闲");
      expect(sanitizeRecordDraft({ ...recordDraft, difficulty }).difficulty).toBe("休闲");
    },
  );
});

describe("draft lifecycle and TTL", () => {
  it("round-trips a versioned plan draft", () => {
    const storage = new MemoryStorage();
    const key = draftStorageKey("plan", "a@example.com");
    expect(saveDraft(storage, key, "plan", planDraft, 10_000)).toBe(true);
    expect(loadDraft<SafePlanDraft>(storage, key, "plan", 10_001)).toEqual(sanitizePlanDraft(planDraft));
  });

  it("round-trips a versioned record draft", () => {
    const storage = new MemoryStorage();
    const key = draftStorageKey("record", "a@example.com");
    expect(saveDraft(storage, key, "record", recordDraft, 10_000)).toBe(true);
    expect(loadDraft<SafeRecordDraft>(storage, key, "record", 10_001)).toEqual(sanitizeRecordDraft(recordDraft));
  });

  it.each([
    ["just saved", 0, true],
    ["one millisecond before expiry", DRAFT_TTL_MS - 1, true],
    ["exact expiry", DRAFT_TTL_MS, false],
    ["after expiry", DRAFT_TTL_MS + 1, false],
    ["far future", DRAFT_TTL_MS * 100, false],
  ] as const)("handles TTL boundary: %s", (_label, elapsed, expected) => {
    const storage = new MemoryStorage();
    saveDraft(storage, "key", "plan", planDraft, 1_000);
    expect(Boolean(loadDraft(storage, "key", "plan", 1_000 + elapsed))).toBe(expected);
    if (!expected) expect(storage.getItem("key")).toBeNull();
  });

  it.each([
    0,
    1,
    DRAFT_SCHEMA_VERSION - 1,
    DRAFT_SCHEMA_VERSION + 1,
    999,
    null,
    "2",
  ])("rejects schema version %j", (schemaVersion) => {
    const storage = new MemoryStorage();
    storage.setItem("key", JSON.stringify({
      schemaVersion,
      kind: "plan",
      expiresAt: 10_000,
      data: planDraft,
    }));
    expect(loadDraft(storage, "key", "plan", 1_000)).toBeNull();
    expect(storage.getItem("key")).toBeNull();
  });

  it("rejects a draft of another form kind", () => {
    const storage = new MemoryStorage();
    saveDraft(storage, "key", "record", recordDraft, 1_000);
    expect(loadDraft(storage, "key", "plan", 1_001)).toBeNull();
  });

  const corruptValues = [
    "",
    "null",
    "[]",
    "1",
    "true",
    "{",
    "{}",
    '{"schemaVersion":2}',
    '{"schemaVersion":2,"kind":"plan","expiresAt":9999,"data":[]}',
    '{"schemaVersion":2,"kind":"plan","expiresAt":"9999","data":{}}',
    ...Array.from({ length: 80 }, (_, index) => `{"broken":${"[".repeat(index + 1)}`),
  ];
  it.each(corruptValues.map((value, index) => [index, value] as const))(
    "fails closed for corrupt draft case %i",
    (_index, value) => {
      const storage = new MemoryStorage();
      storage.setItem("key", value);
      expect(loadDraft(storage, "key", "plan", 1_000)).toBeNull();
      expect(storage.getItem("key")).toBeNull();
    },
  );

  it("clears a submitted draft", () => {
    const storage = new MemoryStorage();
    saveDraft(storage, "key", "plan", planDraft);
    clearDraft(storage, "key");
    expect(storage.getItem("key")).toBeNull();
  });
});

describe("storage failure handling", () => {
  it.each(["QuotaExceededError", "SecurityError", "UnknownError"])(
    "keeps the form usable when setItem throws %s",
    (name) => {
      const storage = {
        getItem: () => null,
        setItem: () => {
          throw new DOMException("blocked", name);
        },
        removeItem: () => undefined,
      };
      expect(saveDraft(storage, "key", "plan", planDraft)).toBe(false);
    },
  );

  it("returns null when getItem throws", () => {
    const storage = {
      getItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
      setItem: () => undefined,
      removeItem: () => undefined,
    };
    expect(loadDraft(storage, "key", "plan")).toBeNull();
  });

  it("does not throw when cleanup itself is blocked", () => {
    const storage = {
      getItem: () => "{",
      setItem: () => undefined,
      removeItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
    };
    expect(() => loadDraft(storage, "key", "plan")).not.toThrow();
    expect(() => clearDraft(storage, "key")).not.toThrow();
  });
});

describe("draft properties", () => {
  it("round-trips arbitrary non-sensitive route drafts after normalization", () => {
    fc.assert(
      fc.property(
        fc.record({
          routeName: fc.string({ maxLength: 200 }),
          difficulty: fc.constantFrom("休闲", "进阶", "速穿", "重装"),
          tripDate: fc.string({ maxLength: 20 }),
          plannedDistance: fc.oneof(fc.double({ noNaN: true }), fc.string({ maxLength: 40 })),
          plannedDuration: fc.oneof(fc.double({ noNaN: true }), fc.string({ maxLength: 40 })),
          plannedElevation: fc.oneof(fc.double({ noNaN: true }), fc.string({ maxLength: 40 })),
          equipment: fc.string({ maxLength: 9_000 }),
          risks: fc.string({ maxLength: 9_000 }),
          waterPoints: fc.string({ maxLength: 9_000 }),
        }),
        (value) => {
          const storage = new MemoryStorage();
          expect(saveDraft(storage, "key", "plan", value, 1_000)).toBe(true);
          expect(loadDraft(storage, "key", "plan", 1_001)).toEqual(sanitizePlanDraft(value));
        },
      ),
      { numRuns: 1_000 },
    );
  });

  it("arbitrary corrupted storage content never escapes as an exception", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 2_000 }), (serialized) => {
        const storage = new MemoryStorage();
        storage.setItem("key", serialized);
        expect(() => loadDraft(storage, "key", "record", 1_000)).not.toThrow();
      }),
      { numRuns: 2_000 },
    );
  });
});
