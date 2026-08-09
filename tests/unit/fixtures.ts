import {
  EMPTY_BUDGET,
  type AppState,
  type Member,
  type PhotoAsset,
  type Plan,
  type TripRecord,
} from "../../app/lib/models";

export const memberOne: Member = {
  id: "m-one",
  nickname: "示例甲",
  realName: "匿名成员甲",
  baseWeight: 71.8,
  baseBodyFat: 18.6,
  equipmentNotes: "头灯",
  isArchived: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

export const memberTwo: Member = {
  ...memberOne,
  id: "m-two",
  nickname: "示例乙",
  realName: "匿名成员乙",
  baseWeight: 64.2,
  baseBodyFat: 16.9,
};

export const memberThree: Member = {
  ...memberOne,
  id: "m-three",
  nickname: "示例丙",
  realName: "匿名成员丙",
  baseWeight: 55.6,
  baseBodyFat: 22.1,
};

export const validPlan: Plan = {
  id: "p-one",
  routeName: "示例山脊 A 环线",
  difficulty: "进阶",
  tripDate: "2020-08-16",
  plannedDistance: 18.5,
  plannedDuration: 420,
  plannedElevation: 1240,
  participants: [memberOne.id, memberTwo.id, memberThree.id],
  budget: { ...EMPTY_BUDGET, 油费: 360, 午餐: 180 },
  equipment: "头灯、登山杖",
  risks: "碎石坡",
  waterPoints: "高岭村",
  status: "upcoming",
  createdBy: "creator@example.com",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

export const validRecord: TripRecord = {
  id: "r-one",
  sourcePlanId: validPlan.id,
  routeName: validPlan.routeName,
  difficulty: validPlan.difficulty,
  tripDate: "2020-08-16",
  actualDistance: 18.2,
  actualDuration: 410,
  actualElevation: 1210,
  participants: [memberOne.id, memberTwo.id, memberThree.id],
  expenses: [
    { id: "e-one", category: "油费", amount: 301.01, payerId: memberOne.id, note: "往返" },
    { id: "e-two", category: "午餐", amount: 199.99, payerId: memberTwo.id, note: "午餐" },
  ],
  bodyData: [
    {
      memberId: memberOne.id,
      beforeWeight: 71.8,
      afterWeight: 70.9,
      beforeBodyFat: 18.6,
      afterBodyFat: 18.2,
    },
    {
      memberId: memberTwo.id,
      beforeWeight: 64.2,
      afterWeight: 63.7,
      beforeBodyFat: 16.9,
      afterBodyFat: 16.6,
    },
  ],
  roadCondition: "湿滑",
  routeRisk: "碎石",
  experience: "节奏稳定",
  createdBy: "creator@example.com",
  createdAt: "2020-08-16T12:00:00.000Z",
  updatedAt: "2020-08-16T12:00:00.000Z",
};

export const validPhoto: PhotoAsset = {
  id: "photo-one",
  recordId: validRecord.id,
  category: "scenery",
  filename: "云海.jpg",
  contentType: "image/jpeg",
  size: 12345,
  note: "山脊云海",
  createdBy: "creator@example.com",
  createdAt: "2020-08-16T10:00:00.000Z",
  url: "/api/photos/photo-one",
};

export const validState: AppState = {
  currentUser: { email: "creator@example.com", displayName: "创建人" },
  members: [memberOne, memberTwo, memberThree],
  plans: [validPlan],
  records: [validRecord],
  photos: [validPhoto],
};

export function clone<T>(value: T): T {
  return structuredClone(value);
}
