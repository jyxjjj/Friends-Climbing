export type Difficulty = "休闲" | "进阶" | "速穿" | "重装";
export type PlanStatus = "upcoming" | "completed" | "cancelled";
export type PhotoCategory = "start" | "node" | "scenery" | "finish";

export const BUDGET_CATEGORIES = [
  "油费",
  "过路费",
  "停车费",
  "午餐",
  "路餐补给",
  "零食",
  "门票",
  "其他杂项",
] as const;

export type BudgetCategory = (typeof BUDGET_CATEGORIES)[number];
export type Budget = Record<BudgetCategory, number>;

export interface CurrentUser {
  email: string;
  displayName: string;
}

export interface Member {
  id: string;
  nickname: string;
  realName: string;
  baseWeight: number;
  baseBodyFat: number;
  equipmentNotes: string;
  isArchived?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Plan {
  id: string;
  routeName: string;
  difficulty: Difficulty;
  tripDate: string;
  plannedDistance: number;
  plannedDuration: number;
  plannedElevation: number;
  participants: string[];
  budget: Budget;
  equipment: string;
  risks: string;
  waterPoints: string;
  status: PlanStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseItem {
  id: string;
  category: BudgetCategory;
  amount: number;
  payerId: string;
  note?: string;
}

export interface BodyMetric {
  memberId: string;
  beforeWeight: number | null;
  afterWeight: number | null;
  beforeBodyFat: number | null;
  afterBodyFat: number | null;
}

export interface TripRecord {
  id: string;
  sourcePlanId: string | null;
  routeName: string;
  difficulty: Difficulty;
  tripDate: string;
  actualDistance: number;
  actualDuration: number;
  actualElevation: number;
  participants: string[];
  expenses: ExpenseItem[];
  bodyData: BodyMetric[];
  roadCondition: string;
  routeRisk: string;
  experience: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface PhotoAsset {
  id: string;
  recordId: string;
  category: PhotoCategory;
  filename: string;
  contentType: string;
  size: number;
  note: string;
  createdBy: string;
  createdAt: string;
  url: string;
}

export interface AppState {
  currentUser: CurrentUser;
  members: Member[];
  plans: Plan[];
  records: TripRecord[];
  photos: PhotoAsset[];
}

export const EMPTY_BUDGET: Budget = {
  油费: 0,
  过路费: 0,
  停车费: 0,
  午餐: 0,
  路餐补给: 0,
  零食: 0,
  门票: 0,
  其他杂项: 0,
};
