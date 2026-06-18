export type Role = 'Owner' | 'Member';
export type Difficulty = '休闲' | '进阶' | '速穿' | '重装';
export type ExpenseCategory = '油费' | '过路费' | '停车费' | '午餐' | '补给' | '门票' | '其他';
export interface PasswordHash {
  algorithm: 'PBKDF2';
  digest: 'SHA-256';
  iterations: 524288;
  salt: string;
  derivedKey: string;
  derivedKeyLength: 64;
}
export interface Versioned {
  version: number;
  createdAt: string;
  updatedAt: string;
}
export interface User extends Versioned {
  username: string;
  role: Role;
  passwordHash: PasswordHash;
  memberId: string;
  tokenVersion: number;
  disabled: boolean;
  passwordChangedAt?: string;
}
export interface RefreshSession {
  jti: string;
  username: string;
  memberId: string;
  role: Role;
  tokenVersion: number;
  createdAt: number;
  expiresAt: number;
  rotatedAt?: number;
  revokedAt?: number;
  userAgentHash?: string;
}
export interface JwtClaims {
  sub: string;
  username: string;
  memberId: string;
  role: Role;
  tokenVersion: number;
  jti: string;
  iat: number;
  exp: number;
  typ: 'access' | 'refresh';
}
export interface Member extends Versioned {
  id: string;
  username: string;
  nickname: string;
  realName: string;
  baseWeightKg?: number;
  baseBodyFatPct?: number;
  gearNotes: string;
  disabled?: boolean;
}
export interface RouteTemplate extends Versioned {
  id: string;
  name: string;
  defaultDifficulty: Difficulty;
  defaultDistanceKm?: number;
  defaultDurationMin?: number;
  defaultElevationM?: number;
  dangerPoints: string;
  waterPoints: string;
  notes: string;
  createdBy: string;
}
export interface ExpenseItem {
  id: string;
  category: ExpenseCategory;
  amountCents: number;
  payerMemberId: string;
  notes?: string;
}
export interface Budget {
  fuelCents?: number;
  tollCents?: number;
  parkingCents?: number;
  lunchCents?: number;
  supplyCents?: number;
  snackCents?: number;
  ticketCents?: number;
  otherCents?: number;
}
export interface ClimbPlan extends Versioned {
  id: string;
  routeName: string;
  difficulty: Difficulty;
  planDate: string;
  plannedDistanceKm?: number;
  plannedDurationMin?: number;
  plannedElevationM?: number;
  memberIds: string[];
  budget?: Budget;
  gearList: string;
  dangerPoints: string;
  waterPoints: string;
  createdBy: string;
}
export interface MemberBodyData {
  memberId: string;
  beforeWeightKg?: number;
  beforeBodyFatPct?: number;
  afterWeightKg?: number;
  afterBodyFatPct?: number;
}
export interface ClimbRecord extends Versioned {
  id: string;
  planId?: string;
  routeName: string;
  difficulty: Difficulty;
  date: string;
  memberIds: string[];
  plannedDistanceKm?: number;
  plannedDurationMin?: number;
  plannedElevationM?: number;
  actualDistanceKm?: number;
  actualDurationMin?: number;
  actualElevationM?: number;
  budget?: Budget;
  expenses: ExpenseItem[];
  bodyData: MemberBodyData[];
  roadNotes: string;
  riskNotes: string;
  weather: string;
  review: string;
  otherNotes: string;
  createdBy: string;
}
export interface RecordImage {
  id: string;
  recordId: string;
  r2Key: string;
  category: '出发点照片' | '途中关键节点' | '风景照' | '终点照片';
  note: string;
  fileName: string;
  contentType: string;
  size: number;
  createdAt: string;
}
export interface DashboardStats {
  totalDistanceKm: number;
  totalElevationM: number;
  totalDurationMin: number;
  totalTrips: number;
  totalCostCents: number;
  monthly: { period: string; distanceKm: number; elevationM: number; costCents: number }[];
  yearly: { period: string; distanceKm: number; elevationM: number; costCents: number }[];
  memberRankings: {
    memberId: string;
    distanceKm: number;
    elevationM: number;
    participations: number;
  }[];
}
export interface Env {
  CLIMB_KV: KVNamespace;
  CLIMB_IMAGES: R2Bucket;
  JWT_ED25519_PRIVATE_JWK?: string;
  JWT_ED25519_PUBLIC_JWK?: string;
  JWT_KEY_ID?: string;
}
