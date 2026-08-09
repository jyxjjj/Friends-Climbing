import type { Difficulty } from "./models";

export const DRAFT_SCHEMA_VERSION = 2;
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1_000;

export type SafePlanDraft = {
  routeName: string;
  difficulty: Difficulty;
  tripDate: string;
  plannedDistance: number | string;
  plannedDuration: number | string;
  plannedElevation: number | string;
  equipment: string;
  risks: string;
  waterPoints: string;
};

export type SafeRecordDraft = {
  routeName: string;
  difficulty: Difficulty;
  tripDate: string;
  actualDistance: number;
  actualDuration: number;
  actualElevation: number;
  roadCondition: string;
  routeRisk: string;
  experience: string;
};

type DraftKind = "plan" | "record";

type DraftEnvelope<T> = {
  schemaVersion: number;
  kind: DraftKind;
  savedAt: number;
  expiresAt: number;
  data: T;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function opaquePrincipalKey(principal: string): string {
  let hash = 0x811c9dc5;
  const normalized = principal.trim().toLowerCase();
  for (let index = 0; index < normalized.length; index += 1) {
    hash ^= normalized.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function safeEntityKey(value: string): string {
  return /^[A-Za-z0-9_-]{1,64}$/.test(value) ? value : "new";
}

export function draftStorageKey(
  kind: DraftKind,
  principal: string,
  entityId = "new",
): string {
  return `summit:v${DRAFT_SCHEMA_VERSION}:${opaquePrincipalKey(principal)}:${kind}:${safeEntityKey(entityId)}`;
}

function safeString(value: unknown, maximum: number): string {
  return typeof value === "string" ? value.slice(0, maximum) : "";
}

function safeNumberLike(value: unknown): number | string {
  return typeof value === "number" && Number.isFinite(value)
    ? Object.is(value, -0) ? 0 : value
    : typeof value === "string" && value.length <= 32
      ? value
      : "";
}

function safeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function difficulty(value: unknown): Difficulty {
  return ["休闲", "进阶", "速穿", "重装"].includes(String(value))
    ? (value as Difficulty)
    : "休闲";
}

export function sanitizePlanDraft(input: Record<string, unknown>): SafePlanDraft {
  return {
    routeName: safeString(input.routeName, 120),
    difficulty: difficulty(input.difficulty),
    tripDate: safeString(input.tripDate, 10),
    plannedDistance: safeNumberLike(input.plannedDistance),
    plannedDuration: safeNumberLike(input.plannedDuration),
    plannedElevation: safeNumberLike(input.plannedElevation),
    equipment: safeString(input.equipment, 8_000),
    risks: safeString(input.risks, 8_000),
    waterPoints: safeString(input.waterPoints, 8_000),
  };
}

export function sanitizeRecordDraft(input: Record<string, unknown>): SafeRecordDraft {
  return {
    routeName: safeString(input.routeName, 120),
    difficulty: difficulty(input.difficulty),
    tripDate: safeString(input.tripDate, 10),
    actualDistance: safeNumber(input.actualDistance),
    actualDuration: safeNumber(input.actualDuration),
    actualElevation: safeNumber(input.actualElevation),
    roadCondition: safeString(input.roadCondition, 8_000),
    routeRisk: safeString(input.routeRisk, 8_000),
    experience: safeString(input.experience, 8_000),
  };
}

export function saveDraft(
  storage: StorageLike,
  key: string,
  kind: DraftKind,
  data: Record<string, unknown>,
  now = Date.now(),
): boolean {
  const envelope: DraftEnvelope<SafePlanDraft | SafeRecordDraft> = {
    schemaVersion: DRAFT_SCHEMA_VERSION,
    kind,
    savedAt: now,
    expiresAt: now + DRAFT_TTL_MS,
    data: kind === "plan" ? sanitizePlanDraft(data) : sanitizeRecordDraft(data),
  };
  try {
    storage.setItem(key, JSON.stringify(envelope));
    return true;
  } catch {
    return false;
  }
}

export function loadDraft<T extends SafePlanDraft | SafeRecordDraft>(
  storage: StorageLike,
  key: string,
  kind: DraftKind,
  now = Date.now(),
): T | null {
  try {
    const serialized = storage.getItem(key);
    if (serialized === null) return null;
    if (!serialized) {
      storage.removeItem(key);
      return null;
    }
    const parsed = JSON.parse(serialized) as Partial<DraftEnvelope<Record<string, unknown>>>;
    if (
      parsed.schemaVersion !== DRAFT_SCHEMA_VERSION ||
      parsed.kind !== kind ||
      typeof parsed.expiresAt !== "number" ||
      parsed.expiresAt <= now ||
      !parsed.data ||
      typeof parsed.data !== "object" ||
      Array.isArray(parsed.data)
    ) {
      storage.removeItem(key);
      return null;
    }
    return (kind === "plan"
      ? sanitizePlanDraft(parsed.data)
      : sanitizeRecordDraft(parsed.data)) as T;
  } catch {
    try {
      storage.removeItem(key);
    } catch {
      // Storage can be unavailable in privacy mode; the form remains usable.
    }
    return null;
  }
}

export function clearDraft(storage: StorageLike, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // A successful server save must not be reported as failed because local storage is unavailable.
  }
}
