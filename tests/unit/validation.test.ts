import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { BUDGET_CATEGORIES } from "../../app/lib/models";
import { HttpError } from "../../app/lib/security";
import {
  asMember,
  asPlan,
  asRecord,
  parseDeleteEnvelope,
  parseMemberInput,
  parseMutationEnvelope,
  parsePhotoCategory,
  parsePhotoNote,
  parsePlanInput,
  parseRecordInput,
} from "../../app/lib/validation";
import { validPlan, validRecord } from "./fixtures";

function planInput() {
  return {
    id: validPlan.id,
    routeName: validPlan.routeName,
    difficulty: validPlan.difficulty,
    tripDate: validPlan.tripDate,
    plannedDistance: validPlan.plannedDistance,
    plannedDuration: validPlan.plannedDuration,
    plannedElevation: validPlan.plannedElevation,
    participants: [...validPlan.participants],
    budget: { ...validPlan.budget },
    equipment: validPlan.equipment,
    risks: validPlan.risks,
    waterPoints: validPlan.waterPoints,
    status: validPlan.status,
  };
}

function recordInput() {
  return {
    id: validRecord.id,
    sourcePlanId: validRecord.sourcePlanId,
    routeName: validRecord.routeName,
    difficulty: validRecord.difficulty,
    tripDate: validRecord.tripDate,
    actualDistance: validRecord.actualDistance,
    actualDuration: validRecord.actualDuration,
    actualElevation: validRecord.actualElevation,
    participants: [...validRecord.participants],
    expenses: validRecord.expenses.map((item) => ({ ...item })),
    bodyData: validRecord.bodyData.map((item) => ({ ...item })),
    roadCondition: validRecord.roadCondition,
    routeRisk: validRecord.routeRisk,
    experience: validRecord.experience,
  };
}

function memberInput() {
  return {
    id: "m-one",
    nickname: "示例甲",
    realName: "匿名成员甲",
    baseWeight: 71.8,
    baseBodyFat: 18.6,
    equipmentNotes: "头灯",
  };
}

function expectValidationFailure(action: () => unknown, path?: string) {
  try {
    action();
    throw new Error("expected validation failure");
  } catch (error) {
    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({ status: 400, code: expect.any(String) });
    if (path) expect((error as Error).message).toContain(path);
  }
}

const genericInvalidNumbers: unknown[] = [
  undefined,
  null,
  "",
  " ",
  "1",
  NaN,
  Infinity,
  -Infinity,
  -1,
  Number.MAX_SAFE_INTEGER,
  Number.MAX_SAFE_INTEGER + 1,
  {},
  [],
  true,
  false,
];

describe("member validation matrix", () => {
  it("accepts and trims a valid member", () => {
    const result = parseMemberInput({
      ...memberInput(),
      nickname: "  示例甲  ",
      realName: "  匿名成员甲 ",
    });
    expect(result.nickname).toBe("示例甲");
    expect(result.realName).toBe("匿名成员甲");
  });

  const invalidTextCases: Array<[string, unknown]> = [
    ["undefined", undefined],
    ["null", null],
    ["empty", ""],
    ["spaces", "   "],
    ["tab-newline", "\t\n"],
    ["NUL", "林\0深"],
    ["control-1", "林\u0001深"],
    ["control-8", "林\u0008深"],
    ["control-31", "林\u001f深"],
    ["DEL", "林\u007f深"],
  ];
  for (const field of ["nickname", "realName"] as const) {
    it.each(invalidTextCases)(
      `${field} rejects %s`,
      (_label, value) => {
        expectValidationFailure(() => parseMemberInput({ ...memberInput(), [field]: value }), field);
      },
    );
  }

  it.each([
    ["nickname", "a".repeat(41)],
    ["realName", "a".repeat(81)],
    ["equipmentNotes", "a".repeat(2001)],
  ] as const)("%s rejects overlong text", (field, value) => {
    expectValidationFailure(() => parseMemberInput({ ...memberInput(), [field]: value }), field);
  });

  const validWeightValues = [20, 20.01, 71.8, 399.99, 400];
  it.each(validWeightValues)("accepts baseWeight=%s", (value) => {
    expect(parseMemberInput({ ...memberInput(), baseWeight: value }).baseWeight).toBe(value);
  });
  it.each([...genericInvalidNumbers, 0, 19.99, 400.01, 71.801])(
    "rejects baseWeight=%j",
    (value) => {
      expectValidationFailure(() => parseMemberInput({ ...memberInput(), baseWeight: value }), "baseWeight");
    },
  );

  const validBodyFatValues = [0.1, 0.11, 18.6, 74.99, 75];
  it.each(validBodyFatValues)("accepts baseBodyFat=%s", (value) => {
    expect(parseMemberInput({ ...memberInput(), baseBodyFat: value }).baseBodyFat).toBe(value);
  });
  it.each([...genericInvalidNumbers, 0, 0.09, 75.01, 18.601])(
    "rejects baseBodyFat=%j",
    (value) => {
      expectValidationFailure(() => parseMemberInput({ ...memberInput(), baseBodyFat: value }), "baseBodyFat");
    },
  );

  it("requires an ID for updates", () => {
    const withoutId: Partial<ReturnType<typeof memberInput>> = memberInput();
    delete withoutId.id;
    expectValidationFailure(() => parseMemberInput(withoutId, true));
  });

  it.each(["createdBy", "createdAt", "updatedAt", "isArchived", "ownerId", "r2Key"])(
    "strips mass-assignment field %s",
    (field) => {
      const parsed = parseMemberInput({ ...memberInput(), [field]: "attacker" });
      expect(parsed).not.toHaveProperty(field);
      expect(asMember(parsed)).not.toHaveProperty(field);
    },
  );
});

describe("plan validation matrix", () => {
  it.each(["休闲", "进阶", "速穿", "重装"] as const)(
    "accepts difficulty %s",
    (difficulty) => {
      expect(parsePlanInput({ ...planInput(), difficulty }).difficulty).toBe(difficulty);
    },
  );
  it.each(["", "轻松", "ADVANCED", "进阶 ", null, 1, undefined])(
    "rejects difficulty %j",
    (difficulty) => {
      expectValidationFailure(() => parsePlanInput({ ...planInput(), difficulty }), "difficulty");
    },
  );

  const validDates = [
    "2000-01-01",
    "2000-02-29",
    "2024-02-29",
    "2026-08-09",
    "2099-12-31",
    "2100-12-31",
  ];
  it.each(validDates)("accepts real ISO date %s", (tripDate) => {
    expect(parsePlanInput({ ...planInput(), tripDate }).tripDate).toBe(tripDate);
  });
  it.each([
    "1999-12-31",
    "2101-01-01",
    "2023-02-29",
    "2100-02-29",
    "2026-00-01",
    "2026-13-01",
    "2026-01-00",
    "2026-01-32",
    "2026-1-01",
    "26-01-01",
    "2026/01/01",
    "",
    " ",
    null,
    undefined,
  ])("rejects invalid date %j", (tripDate) => {
    expectValidationFailure(() => parsePlanInput({ ...planInput(), tripDate }), "tripDate");
  });

  const planNumberSpecs = [
    { field: "plannedDistance", minimum: 0.1, maximum: 1000, integer: false },
    { field: "plannedDuration", minimum: 1, maximum: 20160, integer: true },
    { field: "plannedElevation", minimum: 0, maximum: 30000, integer: true },
  ] as const;
  for (const spec of planNumberSpecs) {
    const valid = [
      spec.minimum,
      spec.minimum + (spec.integer ? 1 : 0.01),
      Math.floor((spec.minimum + spec.maximum) / 2),
      spec.maximum - (spec.integer ? 1 : 0.01),
      spec.maximum,
    ];
    it.each(valid)(`${spec.field} accepts boundary %s`, (value) => {
      expect(parsePlanInput({ ...planInput(), [spec.field]: value })[spec.field]).toBe(value);
    });
    const invalid = [
      ...genericInvalidNumbers,
      spec.minimum - (spec.integer ? 1 : 0.01),
      spec.maximum + (spec.integer ? 1 : 0.01),
      ...(spec.integer ? [1.1, 10.5, 99.99] : [1.001, 18.555, 999.999]),
    ];
    it.each(invalid)(`${spec.field} rejects %j`, (value) => {
      expectValidationFailure(() => parsePlanInput({ ...planInput(), [spec.field]: value }), spec.field);
    });
  }

  const amountInvalid = [
    ...genericInvalidNumbers,
    -0.01,
    10_000_000.01,
    0.001,
    1.111,
    999.999,
  ];
  const amountValid = [0, 0.01, 1, 1.1, 1.11, 9_999_999.99, 10_000_000];
  for (const category of BUDGET_CATEGORIES) {
    it.each(amountValid)(`budget.${category} accepts %s`, (value) => {
      const input = planInput();
      input.budget[category] = value;
      expect(parsePlanInput(input).budget[category]).toBe(value);
    });
    it.each(amountInvalid)(`budget.${category} rejects %j`, (value) => {
      const input = planInput() as Record<string, unknown> & { budget: Record<string, unknown> };
      input.budget[category] = value;
      expectValidationFailure(() => parsePlanInput(input), `budget.${category}`);
    });
  }

  const participantCases: Array<[string, unknown]> = [
    ["empty", []],
    ["duplicate", ["m-one", "m-one"]],
    ["non-array", "m-one"],
    ["null", null],
    ["number", [1]],
    ["empty-id", [""]],
    ["slash", ["../m-one"]],
    ["too-many", Array.from({ length: 101 }, (_, index) => `m-${index}`)],
  ];
  it.each(participantCases)("rejects participant set %s", (_label, participants) => {
    expectValidationFailure(() => parsePlanInput({ ...planInput(), participants }), "participants");
  });

  const planTextSpecs = [
    ["routeName", 120, true],
    ["equipment", 8000, false],
    ["risks", 8000, false],
    ["waterPoints", 8000, false],
  ] as const;
  for (const [field, maximum, required] of planTextSpecs) {
    it.each([
      "<script>alert(1)</script>",
      "'; DROP TABLE plans;--",
      "😀山脊",
      "e\u0301",
      "正常\n多行\t内容",
    ])(`${field} safely accepts plain text %j`, (value) => {
      expect(parsePlanInput({ ...planInput(), [field]: value })[field]).toBe(value.trim());
    });
    it.each([
      "x\0y",
      "x\u0001y",
      "x\u001fy",
      "x\u007fy",
      "x".repeat(maximum + 1),
      ...(required ? ["", "   ", null, undefined] : []),
    ])(`${field} rejects unsafe or invalid text case %#`, (value) => {
      expectValidationFailure(() => parsePlanInput({ ...planInput(), [field]: value }), field);
    });
  }

  it.each(["createdBy", "createdAt", "updatedAt", "actualDistance", "ownerEmail", "totalCost"])(
    "strips plan mass-assignment field %s",
    (field) => {
      const parsed = parsePlanInput({ ...planInput(), [field]: "attacker" });
      expect(parsed).not.toHaveProperty(field);
      expect(asPlan(parsed)).not.toHaveProperty(field);
    },
  );
});

describe("record validation matrix", () => {
  const recordNumberSpecs = [
    { field: "actualDistance", minimum: 0.1, maximum: 1000, integer: false },
    { field: "actualDuration", minimum: 1, maximum: 20160, integer: true },
    { field: "actualElevation", minimum: 0, maximum: 30000, integer: true },
  ] as const;
  for (const spec of recordNumberSpecs) {
    it.each([
      spec.minimum,
      spec.minimum + (spec.integer ? 1 : 0.01),
      spec.maximum - (spec.integer ? 1 : 0.01),
      spec.maximum,
    ])(`${spec.field} accepts %s`, (value) => {
      expect(parseRecordInput({ ...recordInput(), [spec.field]: value })[spec.field]).toBe(value);
    });
    it.each([
      ...genericInvalidNumbers,
      spec.minimum - (spec.integer ? 1 : 0.01),
      spec.maximum + (spec.integer ? 1 : 0.01),
      ...(spec.integer ? [1.1, 9.9] : [0.101, 18.555]),
    ])(`${spec.field} rejects %j`, (value) => {
      expectValidationFailure(() => parseRecordInput({ ...recordInput(), [spec.field]: value }), spec.field);
    });
  }

  const expenseFields = [
    ["category", "未知"],
    ["category", null],
    ["amount", -0.01],
    ["amount", 0.001],
    ["amount", Infinity],
    ["amount", "1"],
    ["payerId", "../m-one"],
    ["payerId", "m-outsider"],
    ["id", "../expense"],
    ["note", "x".repeat(501)],
    ["note", "x\0y"],
  ] as const;
  it.each(expenseFields)(
    "rejects invalid expense.%s=%j",
    (field, value) => {
      const input = recordInput();
      (input.expenses[0] as unknown as Record<string, unknown>)[field] = value;
      expectValidationFailure(() => parseRecordInput(input), "expenses.0");
    },
  );

  it.each(BUDGET_CATEGORIES)("accepts record expense category %s", (category) => {
    const input = recordInput();
    input.expenses[0].category = category;
    expect(parseRecordInput(input).expenses[0].category).toBe(category);
  });

  it("rejects duplicate expense IDs", () => {
    const input = recordInput();
    input.expenses[1].id = input.expenses[0].id;
    expectValidationFailure(() => parseRecordInput(input), "expenses.1.id");
  });

  const metricFields = [
    "beforeWeight",
    "afterWeight",
    "beforeBodyFat",
    "afterBodyFat",
  ] as const;
  for (const field of metricFields) {
    it(`${field} accepts null`, () => {
      const input = recordInput();
      input.bodyData[0][field] = null;
      expect(parseRecordInput(input).bodyData[0][field]).toBeNull();
    });
    const invalidMetricValues = field.includes("BodyFat")
      ? [undefined, "", "70", NaN, Infinity, -1, 0, 0.09, 75.01, 18.601, {}]
      : [undefined, "", "70", NaN, Infinity, -1, 0, 19.99, 400.01, 70.001, {}];
    it.each(invalidMetricValues)(`${field} rejects %j`, (value) => {
      const input = recordInput();
      (input.bodyData[0] as unknown as Record<string, unknown>)[field] = value;
      expectValidationFailure(() => parseRecordInput(input), `bodyData.0.${field}`);
    });
  }

  it("rejects duplicate body metric members", () => {
    const input = recordInput();
    input.bodyData[1].memberId = input.bodyData[0].memberId;
    expectValidationFailure(() => parseRecordInput(input), "bodyData.1.memberId");
  });

  it("rejects body metrics for a non-participant", () => {
    const input = recordInput();
    input.bodyData[0].memberId = "m-outsider";
    expectValidationFailure(() => parseRecordInput(input), "bodyData.0.memberId");
  });

  it.each(["roadCondition", "routeRisk", "experience"] as const)(
    "%s rejects overlong and control text",
    (field) => {
      expectValidationFailure(() => parseRecordInput({ ...recordInput(), [field]: "x".repeat(8001) }), field);
      expectValidationFailure(() => parseRecordInput({ ...recordInput(), [field]: "x\0y" }), field);
    },
  );

  it.each(["createdBy", "createdAt", "updatedAt", "objectKey", "totalExpense", "ownerId"])(
    "strips record mass-assignment field %s",
    (field) => {
      const parsed = parseRecordInput({ ...recordInput(), [field]: "attacker" });
      expect(parsed).not.toHaveProperty(field);
      expect(asRecord(parsed)).not.toHaveProperty(field);
    },
  );
});

describe("photo and mutation envelope validation", () => {
  it.each(["start", "node", "scenery", "finish"] as const)(
    "accepts photo category %s",
    (category) => expect(parsePhotoCategory(category)).toBe(category),
  );
  it.each(["", "START", "landscape", "../start", null, undefined, 1])(
    "rejects photo category %j",
    (category) => expectValidationFailure(() => parsePhotoCategory(category)),
  );
  it.each(["", "云海", "😀", "<script>alert(1)</script>", "x".repeat(500)])(
    "accepts bounded photo note case %#",
    (note) => expect(parsePhotoNote(note)).toBe(note),
  );
  it.each(["x".repeat(501), "x\0y", "x\u0001y"])(
    "rejects unsafe photo note case %#",
    (note) => expectValidationFailure(() => parsePhotoNote(note)),
  );

  it.each(["member", "plan", "record"] as const)(
    "accepts mutation resource %s",
    (resource) => {
      expect(parseMutationEnvelope({ resource, item: {} })).toEqual({ resource, item: {} });
      expect(parseDeleteEnvelope({ resource, id: "valid-id" })).toEqual({ resource, id: "valid-id" });
    },
  );
  it.each(["", "photo", "users", null, undefined, 1])(
    "rejects unknown mutation resource %j",
    (resource) => {
      expectValidationFailure(() => parseMutationEnvelope({ resource, item: {} }));
      expectValidationFailure(() => parseDeleteEnvelope({ resource, id: "valid-id" }));
    },
  );
});

describe("validation properties", () => {
  it("valid plan parsing is idempotent", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.1, max: 1000, noNaN: true }).map((value) => Math.round(value * 100) / 100),
        fc.integer({ min: 1, max: 20160 }),
        (distance, duration) => {
          const first = parsePlanInput({ ...planInput(), plannedDistance: distance, plannedDuration: duration });
          expect(parsePlanInput(first)).toEqual(first);
        },
      ),
      { numRuns: 1_000 },
    );
  });

  it("random hostile inputs always fail as a controlled HttpError", () => {
    fc.assert(
      fc.property(fc.anything(), (value) => {
        try {
          parseRecordInput(value);
        } catch (error) {
          expect(error).toBeInstanceOf(HttpError);
          expect((error as HttpError).status).toBe(400);
        }
      }),
      { numRuns: 2_000 },
    );
  });

  it("mass-assignment values never survive parsing", () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        const parsed = parsePlanInput({
          ...planInput(),
          createdBy: value,
          createdAt: value,
          objectKey: value,
          ownerId: value,
        });
        expect(parsed).not.toHaveProperty("createdBy");
        expect(parsed).not.toHaveProperty("createdAt");
        expect(parsed).not.toHaveProperty("objectKey");
        expect(parsed).not.toHaveProperty("ownerId");
      }),
      { numRuns: 1_000 },
    );
  });
});
