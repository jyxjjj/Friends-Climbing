import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  aggregateByMonth,
  calculateEqualSettlement,
  clonePlanToRecord,
  fromCents,
  getMemberStats,
  getTeamStats,
  rankMembers,
  toCents,
} from "../../app/lib/domain";
import { clone, memberOne, memberThree, memberTwo, validPlan, validRecord } from "./fixtures";

describe("exact-cent money conversion", () => {
  const validCents = [
    ...Array.from({ length: 101 }, (_, index) => index),
    999,
    10_001,
    99_999_999,
    1_000_000_000,
  ];
  it.each(validCents)("round-trips %i cents exactly", (cents) => {
    expect(toCents(fromCents(cents))).toBe(cents);
  });

  it.each([
    -1,
    -0.01,
    NaN,
    Infinity,
    -Infinity,
    10_000_000.01,
    0.001,
    1.111,
    999.999,
  ])("rejects invalid currency amount %j", (value) => {
    expect(() => toCents(value)).toThrow(RangeError);
  });

  it.each([0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "rejects non-safe cent integer %j",
    (value) => {
      expect(() => fromCents(value)).toThrow(RangeError);
    },
  );
});

describe("equal-share AA settlement", () => {
  it("matches the documented four-member example exactly", () => {
    const result = calculateEqualSettlement(
      ["lin", "zhou", "lan", "chen"],
      [
        { amount: 360, payerId: "lin" },
        { amount: 120, payerId: "zhou" },
        { amount: 96, payerId: "lan" },
        { amount: 260, payerId: "chen" },
      ],
    );
    expect(result.totalCents).toBe(83_600);
    expect(Object.fromEntries(result.rows.map((row) => [row.memberId, row.differenceCents]))).toEqual({
      lin: 15_100,
      zhou: -8_900,
      lan: -11_300,
      chen: 5_100,
    });
    expect(result.transfers.reduce((sum, transfer) => sum + transfer.amountCents, 0)).toBe(20_200);
  });

  const deterministicCases = Array.from({ length: 300 }, (_, index) => {
    const participantCount = (index % 9) + 1;
    const totalCents = index * 137;
    return {
      name: `${participantCount}人分摊${totalCents}分`,
      participants: Array.from({ length: participantCount }, (_unused, memberIndex) => `m-${memberIndex}`),
      totalCents,
    };
  });
  it.each(deterministicCases)(
    "$name conserves every cent",
    ({ participants, totalCents }) => {
      const result = calculateEqualSettlement(participants, [
        { amount: fromCents(totalCents), payerId: participants[0] },
      ]);
      expect(result.totalCents).toBe(totalCents);
      expect(result.rows.reduce((sum, row) => sum + row.paidCents, 0)).toBe(totalCents);
      expect(result.rows.reduce((sum, row) => sum + row.owedCents, 0)).toBe(totalCents);
      expect(result.rows.reduce((sum, row) => sum + row.differenceCents, 0)).toBe(0);
      const owedValues = result.rows.map((row) => row.owedCents);
      expect(Math.max(...owedValues) - Math.min(...owedValues)).toBeLessThanOrEqual(1);
    },
  );

  it.each([
    [[], []],
    [["m-one", "m-one"], []],
    [["m-one"], [{ amount: 1, payerId: "outsider" }]],
    [["m-one"], [{ amount: -1, payerId: "m-one" }]],
    [["m-one"], [{ amount: 0.001, payerId: "m-one" }]],
    [["m-one"], [{ amount: Infinity, payerId: "m-one" }]],
  ] as const)("rejects invalid settlement input case %#", (participants, expenses) => {
    expect(() => calculateEqualSettlement(participants, expenses)).toThrow(RangeError);
  });

  it("generates transfers that settle every member balance", () => {
    const result = calculateEqualSettlement(
      ["a", "b", "c", "d", "e"],
      [
        { amount: 10, payerId: "a" },
        { amount: 3.33, payerId: "b" },
        { amount: 7.77, payerId: "e" },
      ],
    );
    const balances = new Map(result.rows.map((row) => [row.memberId, row.differenceCents]));
    for (const transfer of result.transfers) {
      balances.set(transfer.fromMemberId, balances.get(transfer.fromMemberId)! + transfer.amountCents);
      balances.set(transfer.toMemberId, balances.get(transfer.toMemberId)! - transfer.amountCents);
    }
    expect([...balances.values()]).toEqual([0, 0, 0, 0, 0]);
    expect(result.transfers.length).toBeLessThanOrEqual(result.rows.length - 1);
  });
});

describe("AA settlement properties", () => {
  const participantArbitrary = fc
    .uniqueArray(fc.integer({ min: 0, max: 40 }), { minLength: 1, maxLength: 12 })
    .map((ids) => ids.map((id) => `m-${id}`));

  it("conserves total, paid, owed and balances for random ledgers", () => {
    fc.assert(
      fc.property(
        participantArbitrary,
        fc.array(
          fc.record({
            cents: fc.integer({ min: 0, max: 1_000_000 }),
            payerIndex: fc.nat(),
          }),
          { maxLength: 100 },
        ),
        (participants, generated) => {
          const expenses = generated.map(({ cents, payerIndex }) => ({
            amount: fromCents(cents),
            payerId: participants[payerIndex % participants.length],
          }));
          const result = calculateEqualSettlement(participants, expenses);
          const expected = generated.reduce((sum, item) => sum + item.cents, 0);
          expect(result.totalCents).toBe(expected);
          expect(result.rows.reduce((sum, row) => sum + row.paidCents, 0)).toBe(expected);
          expect(result.rows.reduce((sum, row) => sum + row.owedCents, 0)).toBe(expected);
          expect(result.rows.reduce((sum, row) => sum + row.differenceCents, 0)).toBe(0);
          for (const row of result.rows) {
            expect(Number.isSafeInteger(row.paidCents)).toBe(true);
            expect(Number.isSafeInteger(row.owedCents)).toBe(true);
            expect(row.owedCents).toBeGreaterThanOrEqual(0);
          }
        },
      ),
      { numRuns: 2_000 },
    );
  });

  it("expense ordering cannot change a settlement", () => {
    fc.assert(
      fc.property(
        participantArbitrary,
        fc.array(
          fc.record({ cents: fc.integer({ min: 0, max: 100_000 }), payerIndex: fc.nat() }),
          { maxLength: 50 },
        ),
        (participants, generated) => {
          const expenses = generated.map(({ cents, payerIndex }) => ({
            amount: fromCents(cents),
            payerId: participants[payerIndex % participants.length],
          }));
          const first = calculateEqualSettlement(participants, expenses);
          const second = calculateEqualSettlement(participants, [...expenses].reverse());
          expect(second).toEqual(first);
        },
      ),
      { numRuns: 1_000 },
    );
  });

  it("splitting one expense preserves every balance", () => {
    fc.assert(
      fc.property(
        participantArbitrary,
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.nat(),
        (participants, cents, payerIndex) => {
          const payerId = participants[payerIndex % participants.length];
          const left = Math.floor(cents / 2);
          const right = cents - left;
          const single = calculateEqualSettlement(participants, [{ amount: fromCents(cents), payerId }]);
          const split = calculateEqualSettlement(participants, [
            { amount: fromCents(left), payerId },
            { amount: fromCents(right), payerId },
          ]);
          expect(split).toEqual(single);
        },
      ),
      { numRuns: 1_000 },
    );
  });
});

describe("team and member statistics", () => {
  it("returns explicit zeros and null pace for empty data", () => {
    expect(getTeamStats([])).toEqual({
      distance: 0,
      duration: 0,
      elevation: 0,
      trips: 0,
      expenseCents: 0,
    });
    expect(getMemberStats("missing", [])).toEqual({
      distance: 0,
      duration: 0,
      elevation: 0,
      trips: 0,
      paceMinutesPerKm: null,
    });
  });

  it("uses weighted pace: total duration divided by total distance", () => {
    const short = { ...clone(validRecord), id: "short", actualDistance: 2, actualDuration: 60 };
    const long = { ...clone(validRecord), id: "long", actualDistance: 18, actualDuration: 180 };
    const stats = getMemberStats(memberOne.id, [short, long]);
    expect(stats.paceMinutesPerKm).toBe(12);
    expect(stats.paceMinutesPerKm).not.toBe((30 + 10) / 2);
  });

  it("counts only records in which the member participated", () => {
    const other = { ...clone(validRecord), id: "other", participants: [memberThree.id] };
    const stats = getMemberStats(memberOne.id, [validRecord, other]);
    expect(stats.trips).toBe(1);
    expect(stats.distance).toBe(validRecord.actualDistance);
  });

  it("sorts rankings by distance, elevation and stable member ID", () => {
    const tied = { ...clone(validRecord), participants: [memberOne.id, memberTwo.id, memberThree.id] };
    const ranking = rankMembers([memberThree, memberTwo, memberOne], [tied]);
    expect(ranking.map((row) => row.member.id)).toEqual(["m-one", "m-three", "m-two"]);
    expect(new Set(ranking.map((row) => row.member.id)).size).toBe(3);
  });

  it("aggregates months chronologically and in exact cents", () => {
    const january = { ...clone(validRecord), id: "jan", tripDate: "2026-01-31", expenses: [{ ...validRecord.expenses[0], amount: 0.01 }] };
    const december = { ...clone(validRecord), id: "dec", tripDate: "2025-12-31", expenses: [{ ...validRecord.expenses[0], amount: 0.02 }] };
    const januaryTwo = { ...clone(january), id: "jan-two", actualDistance: 1 };
    expect(aggregateByMonth([january, december, januaryTwo])).toEqual([
      { period: "2025-12", distance: december.actualDistance, expenseCents: 2 },
      { period: "2026-01", distance: january.actualDistance + 1, expenseCents: 2 },
    ]);
  });

  it("team aggregation is invariant to record ordering", () => {
    const records = [
      validRecord,
      { ...clone(validRecord), id: "r-two", actualDistance: 1.2 },
      { ...clone(validRecord), id: "r-three", actualElevation: 1 },
    ];
    expect(getTeamStats(records)).toEqual(getTeamStats([...records].reverse()));
    expect(aggregateByMonth(records)).toEqual(aggregateByMonth([...records].reverse()));
  });
});

describe("plan to record snapshot", () => {
  it("copies only the intended route snapshot and leaves actuals blank", () => {
    const result = clonePlanToRecord(validPlan, "r-generated");
    expect(result).toMatchObject({
      id: "r-generated",
      sourcePlanId: validPlan.id,
      routeName: validPlan.routeName,
      difficulty: validPlan.difficulty,
      tripDate: validPlan.tripDate,
      actualDistance: 0,
      actualDuration: 0,
      actualElevation: 0,
      expenses: [],
      roadCondition: "",
      routeRisk: "",
      experience: "",
    });
    expect(result).not.toHaveProperty("createdBy");
    expect(result).not.toHaveProperty("budget");
    expect(result).not.toHaveProperty("status");
  });

  it.each(validPlan.participants)("creates a blank body row for %s", (memberId) => {
    const result = clonePlanToRecord(validPlan, "r-generated");
    expect(result.bodyData).toContainEqual({
      memberId,
      beforeWeight: null,
      afterWeight: null,
      beforeBodyFat: null,
      afterBodyFat: null,
    });
  });

  it("deep-copies participant and body arrays", () => {
    const result = clonePlanToRecord(validPlan, "r-generated");
    result.participants.push("attacker");
    result.bodyData[0].beforeWeight = 1;
    expect(validPlan.participants).not.toContain("attacker");
    expect(validPlan).not.toHaveProperty("bodyData");
  });
});
