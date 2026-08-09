import type { ExpenseItem, Member, Plan, TripRecord } from "./models";

export type SettlementRow = {
  memberId: string;
  paidCents: number;
  owedCents: number;
  differenceCents: number;
};

export type SettlementTransfer = {
  fromMemberId: string;
  toMemberId: string;
  amountCents: number;
};

export type EqualSettlement = {
  totalCents: number;
  rows: SettlementRow[];
  transfers: SettlementTransfer[];
};

export function toCents(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 10_000_000) {
    throw new RangeError("金额必须是允许范围内的有限非负数");
  }
  const scaled = value * 100;
  const rounded = Math.round(scaled);
  if (Math.abs(scaled - rounded) >= 1e-7) {
    throw new RangeError("金额最多保留两位小数");
  }
  return rounded;
}

export function fromCents(value: number): number {
  if (!Number.isSafeInteger(value)) throw new RangeError("分值必须是安全整数");
  return value / 100;
}

export function calculateEqualSettlement(
  participantIds: readonly string[],
  expenses: readonly Pick<ExpenseItem, "amount" | "payerId">[],
): EqualSettlement {
  if (!participantIds.length) throw new RangeError("至少需要一名同行成员");
  if (new Set(participantIds).size !== participantIds.length) {
    throw new RangeError("同行成员不能重复");
  }
  const participantSet = new Set(participantIds);
  const paid = new Map(participantIds.map((id) => [id, 0]));
  let totalCents = 0;
  for (const expense of expenses) {
    if (!participantSet.has(expense.payerId)) {
      throw new RangeError("垫付成员必须是同行成员");
    }
    const cents = toCents(expense.amount);
    totalCents += cents;
    if (!Number.isSafeInteger(totalCents)) throw new RangeError("总金额过大");
    paid.set(expense.payerId, (paid.get(expense.payerId) ?? 0) + cents);
  }
  const orderedForRemainder = [...participantIds].sort((a, b) => a.localeCompare(b));
  const baseShare = Math.floor(totalCents / participantIds.length);
  const remainder = totalCents % participantIds.length;
  const owed = new Map(
    orderedForRemainder.map((id, index) => [
      id,
      baseShare + (index < remainder ? 1 : 0),
    ]),
  );
  const rows = participantIds.map((memberId) => {
    const paidCents = paid.get(memberId) ?? 0;
    const owedCents = owed.get(memberId) ?? 0;
    return {
      memberId,
      paidCents,
      owedCents,
      differenceCents: paidCents - owedCents,
    };
  });

  const debtors = rows
    .filter((row) => row.differenceCents < 0)
    .map((row) => ({ memberId: row.memberId, amount: -row.differenceCents }))
    .sort((a, b) => a.memberId.localeCompare(b.memberId));
  const creditors = rows
    .filter((row) => row.differenceCents > 0)
    .map((row) => ({ memberId: row.memberId, amount: row.differenceCents }))
    .sort((a, b) => a.memberId.localeCompare(b.memberId));
  const transfers: SettlementTransfer[] = [];
  let debtorIndex = 0;
  let creditorIndex = 0;
  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amountCents = Math.min(debtor.amount, creditor.amount);
    if (amountCents > 0) {
      transfers.push({
        fromMemberId: debtor.memberId,
        toMemberId: creditor.memberId,
        amountCents,
      });
      debtor.amount -= amountCents;
      creditor.amount -= amountCents;
    }
    if (debtor.amount === 0) debtorIndex += 1;
    if (creditor.amount === 0) creditorIndex += 1;
  }
  return { totalCents, rows, transfers };
}

export type TeamStats = {
  distance: number;
  duration: number;
  elevation: number;
  trips: number;
  expenseCents: number;
};

export function getTeamStats(records: readonly TripRecord[]): TeamStats {
  return records.reduce<TeamStats>(
    (result, record) => ({
      distance: result.distance + record.actualDistance,
      duration: result.duration + record.actualDuration,
      elevation: result.elevation + record.actualElevation,
      trips: result.trips + 1,
      expenseCents:
        result.expenseCents +
        record.expenses.reduce((sum, expense) => sum + toCents(expense.amount), 0),
    }),
    { distance: 0, duration: 0, elevation: 0, trips: 0, expenseCents: 0 },
  );
}

export type MemberStats = {
  distance: number;
  duration: number;
  elevation: number;
  trips: number;
  paceMinutesPerKm: number | null;
};

export function getMemberStats(
  memberId: string,
  records: readonly TripRecord[],
): MemberStats {
  const scoped = records.filter((record) => record.participants.includes(memberId));
  const totals = scoped.reduce(
    (result, record) => ({
      distance: result.distance + record.actualDistance,
      duration: result.duration + record.actualDuration,
      elevation: result.elevation + record.actualElevation,
    }),
    { distance: 0, duration: 0, elevation: 0 },
  );
  return {
    ...totals,
    trips: scoped.length,
    paceMinutesPerKm: totals.distance > 0 ? totals.duration / totals.distance : null,
  };
}

export function rankMembers(
  members: readonly Member[],
  records: readonly TripRecord[],
): Array<{ member: Member; stats: MemberStats }> {
  return members
    .map((member) => ({ member, stats: getMemberStats(member.id, records) }))
    .sort(
      (a, b) =>
        b.stats.distance - a.stats.distance ||
        b.stats.elevation - a.stats.elevation ||
        a.member.id.localeCompare(b.member.id),
    );
}

export function clonePlanToRecord(
  plan: Plan,
  id: string,
): Omit<TripRecord, "createdBy" | "createdAt" | "updatedAt"> {
  return {
    id,
    sourcePlanId: plan.id,
    routeName: plan.routeName,
    difficulty: plan.difficulty,
    tripDate: plan.tripDate,
    actualDistance: 0,
    actualDuration: 0,
    actualElevation: 0,
    participants: [...plan.participants],
    expenses: [],
    bodyData: plan.participants.map((memberId) => ({
      memberId,
      beforeWeight: null,
      afterWeight: null,
      beforeBodyFat: null,
      afterBodyFat: null,
    })),
    roadCondition: "",
    routeRisk: "",
    experience: "",
  };
}

export function aggregateByMonth(
  records: readonly TripRecord[],
): Array<{ period: string; distance: number; expenseCents: number }> {
  const buckets = new Map<string, { distance: number; expenseCents: number }>();
  for (const record of records) {
    const period = record.tripDate.slice(0, 7);
    const current = buckets.get(period) ?? { distance: 0, expenseCents: 0 };
    current.distance += record.actualDistance;
    current.expenseCents += record.expenses.reduce(
      (sum, expense) => sum + toCents(expense.amount),
      0,
    );
    buckets.set(period, current);
  }
  return [...buckets.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([period, values]) => ({ period, ...values }));
}
