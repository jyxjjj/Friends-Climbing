import type { ClimbRecord, DashboardStats, Member } from '../types';
import { appError } from './errors';
export const sumBudget = (b: any) =>
  Object.values(b || {}).reduce((a: any, v: any) => a + (Number(v) || 0), 0) as number;
export function aa(record: ClimbRecord, ownerMemberId?: string) {
  const ids = record.memberIds;
  if (!ids.length) throw appError(422, 'empty_members', '参与成员不能为空');
  if (new Set(ids).size !== ids.length) throw appError(422, 'duplicate_members', '成员不能重复');
  const total = record.expenses.reduce((a, e) => a + e.amountCents, 0);
  for (const e of record.expenses)
    if (!ids.includes(e.payerMemberId))
      throw appError(422, 'payer_not_participant', '付款人必须是参与成员');
  const base = Math.floor(total / ids.length),
    rem = total % ids.length,
    owner = ownerMemberId && ids.includes(ownerMemberId) ? ownerMemberId : ids[0];
  const byMember = ids.map((id) => {
    const owed = base + (id === owner ? rem : 0);
    const paid = record.expenses
      .filter((e) => e.payerMemberId === id)
      .reduce((a, e) => a + e.amountCents, 0);
    return {
      memberId: id,
      paidCents: paid,
      shareCents: owed,
      receivableCents: Math.max(0, paid - owed),
      payableCents: Math.max(0, owed - paid),
    };
  });
  return {
    totalCents: total,
    baseShareCents: base,
    remainderCents: rem,
    remainderOwnerMemberId: owner,
    byMember,
  };
}
export function dashboard(records: ClimbRecord[], _members: Member[]): DashboardStats {
  const monthly = new Map<string, any>(),
    yearly = new Map<string, any>(),
    rank = new Map<string, any>();
  let cost = 0;
  for (const r of records) {
    cost += r.expenses.reduce((a, e) => a + e.amountCents, 0);
    const m = r.date.slice(0, 7),
      y = r.date.slice(0, 4);
    for (const [p, map] of [
      [m, monthly],
      [y, yearly],
    ] as const) {
      const v = map.get(p) || { period: p, distanceKm: 0, elevationM: 0, costCents: 0 };
      v.distanceKm += r.actualDistanceKm || 0;
      v.elevationM += r.actualElevationM || 0;
      v.costCents += r.expenses.reduce((a, e) => a + e.amountCents, 0);
      map.set(p, v);
    }
    for (const id of r.memberIds) {
      const v = rank.get(id) || { memberId: id, distanceKm: 0, elevationM: 0, participations: 0 };
      v.distanceKm += r.actualDistanceKm || 0;
      v.elevationM += r.actualElevationM || 0;
      v.participations++;
      rank.set(id, v);
    }
  }
  return {
    totalDistanceKm: records.reduce((a, r) => a + (r.actualDistanceKm || 0), 0),
    totalElevationM: records.reduce((a, r) => a + (r.actualElevationM || 0), 0),
    totalDurationMin: records.reduce((a, r) => a + (r.actualDurationMin || 0), 0),
    totalTrips: records.length,
    totalCostCents: cost,
    monthly: [...monthly.values()].sort((a, b) => a.period.localeCompare(b.period)),
    yearly: [...yearly.values()].sort((a, b) => a.period.localeCompare(b.period)),
    memberRankings: [...rank.values()].sort((a, b) => b.distanceKm - a.distanceKm),
  };
}
