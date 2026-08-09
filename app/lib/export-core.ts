import type { AppState, PhotoAsset, TripRecord } from "./models";

const XML_INVALID = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g;
const FORMULA_PREFIX = /^[\t\r\n ]*[=+\-@]/;

export function stripInvalidXml(value: unknown): string {
  return String(value ?? "").replace(XML_INVALID, "");
}

export function safeSpreadsheetText(value: unknown): string {
  const text = stripInvalidXml(value);
  return FORMULA_PREFIX.test(text) ? `'${text}` : text;
}

export function escapeXml(value: unknown): string {
  return stripInvalidXml(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function safeDownloadName(value: string, fallback = "山行备份"): string {
  const cleaned = value
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/^\.+/, "")
    .replace(/\.{2,}/g, ".")
    .trim()
    .slice(0, 80);
  return cleaned || fallback;
}

export function worksheet(name: string, rows: readonly (readonly unknown[])[]): string {
  const safeSheetName = safeDownloadName(name, "数据").slice(0, 31);
  return `<Worksheet ss:Name="${escapeXml(safeSheetName)}"><Table>${rows
    .map(
      (row) =>
        `<Row>${row
          .map((cell) => {
            const isSafeNumber =
              typeof cell === "number" && Number.isFinite(cell);
            const value = isSafeNumber ? cell : safeSpreadsheetText(cell);
            return `<Cell><Data ss:Type="${isSafeNumber ? "Number" : "String"}">${escapeXml(value)}</Data></Cell>`;
          })
          .join("")}</Row>`,
    )
    .join("")}</Table></Worksheet>`;
}

export function buildSpreadsheetXml(state: AppState, record?: TripRecord): string {
  const records = record ? [record] : state.records;
  const recordIds = new Set(records.map((item) => item.id));
  const memberIds = new Set(records.flatMap((item) => item.participants));
  const memberRows = state.members.filter((member) => !record || memberIds.has(member.id));
  const sheets = [
    worksheet("完成记录", [["ID", "路线", "日期", "难度", "实际里程(km)", "实际耗时(min)", "实际爬升(m)", "来源计划ID", "创建人"], ...records.map((item) => [item.id, item.routeName, item.tripDate, item.difficulty, item.actualDistance, item.actualDuration, item.actualElevation, item.sourcePlanId ?? "", item.createdBy])]),
    worksheet("同行成员", [["记录ID", "成员ID", "昵称", "真实姓名"], ...records.flatMap((item) => item.participants.map((id) => { const member = state.members.find((candidate) => candidate.id === id); return [item.id, id, member?.nickname ?? "", member?.realName ?? ""]; }))]),
    worksheet("费用", [["记录ID", "费用ID", "类别", "金额(CNY)", "垫付成员ID", "备注"], ...records.flatMap((item) => item.expenses.map((expense) => [item.id, expense.id, expense.category, expense.amount, expense.payerId, expense.note ?? ""]))]),
    worksheet("身体数据", [["记录ID", "成员ID", "爬前体重(kg)", "爬后体重(kg)", "爬前体脂(%)", "爬后体脂(%)"], ...records.flatMap((item) => item.bodyData.map((metric) => [item.id, metric.memberId, metric.beforeWeight ?? "", metric.afterWeight ?? "", metric.beforeBodyFat ?? "", metric.afterBodyFat ?? ""]))]),
    worksheet("图片备注", [["记录ID", "文件名", "分类", "备注", "大小(bytes)"], ...state.photos.filter((photo) => recordIds.has(photo.recordId)).map((photo) => [photo.recordId, photo.filename, photo.category, photo.note, photo.size])]),
    worksheet("成员档案", [["成员ID", "昵称", "真实姓名", "基础体重(kg)", "基础体脂(%)", "装备备注"], ...memberRows.map((member) => [member.id, member.nickname, member.realName, member.baseWeight, member.baseBodyFat, member.equipmentNotes])]),
  ].join("");
  return `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">${sheets}</Workbook>`;
}

export function buildJsonPayload(state: AppState, record?: TripRecord): unknown {
  if (record) {
    return {
      schemaVersion: "1.1",
      exportedAt: new Date().toISOString(),
      record,
      participants: state.members.filter((member) =>
        record.participants.includes(member.id),
      ),
      sourcePlan:
        state.plans.find((plan) => plan.id === record.sourcePlanId) ?? null,
      photos: state.photos
        .filter((photo) => photo.recordId === record.id)
        .map(withoutPhotoUrl),
    };
  }
  return {
    schemaVersion: "1.1",
    exportedAt: new Date().toISOString(),
    unitSystem: {
      distance: "km",
      duration: "minute",
      elevation: "m",
      weight: "kg",
      bodyFat: "%",
      currency: "CNY",
    },
    members: state.members,
    plans: state.plans,
    records: state.records,
    photos: state.photos.map(withoutPhotoUrl),
  };
}

function withoutPhotoUrl(photo: PhotoAsset): Omit<PhotoAsset, "url"> {
  const result = { ...photo };
  delete (result as Partial<PhotoAsset>).url;
  return result;
}

const CATEGORY_FOLDER: Record<PhotoAsset["category"], string> = {
  start: "01-departure",
  node: "02-waypoints",
  scenery: "03-scenery",
  finish: "04-finish",
};

const CONTENT_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/heic": "heic",
};

export function safeArchiveEntry(photo: PhotoAsset, index: number): string {
  const folder = CATEGORY_FOLDER[photo.category];
  const extension = CONTENT_EXTENSION[photo.contentType] ?? "bin";
  const id = /^[A-Za-z0-9_-]{1,64}$/.test(photo.id) ? photo.id : `photo-${index + 1}`;
  return `${folder}/${String(index + 1).padStart(4, "0")}-${id}.${extension}`;
}

export function safeTsvCell(value: unknown): string {
  return safeSpreadsheetText(value).replace(/[\t\r\n]+/g, " ");
}
