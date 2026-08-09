export type ViewName = "dashboard" | "members" | "member-detail" | "plans" | "plan-detail" | "records" | "record-detail" | "analytics" | "backup";
export type Navigate = (view: ViewName, id?: string) => void;
