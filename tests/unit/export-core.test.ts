import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  buildJsonPayload,
  buildSpreadsheetXml,
  escapeXml,
  safeArchiveEntry,
  safeDownloadName,
  safeSpreadsheetText,
  safeTsvCell,
  stripInvalidXml,
  worksheet,
} from "../../app/lib/export-core";
import type { AppState } from "../../app/lib/models";
import { clone, validPhoto, validRecord, validState } from "./fixtures";

const dangerousValues = [
  "=1+1",
  "+SUM(1,1)",
  "-1+1",
  "@SUM(1,1)",
  "\t=1+1",
  "\r=1+1",
  "\n=1+1",
  " =1+1",
  "  +cmd|' /C calc'!A0",
  "\t\r@SUM(1,1)",
];

describe("SpreadsheetML escaping and formula-injection defense", () => {
  it.each(dangerousValues)("neutralizes dangerous cell prefix %j", (value) => {
    const result = safeSpreadsheetText(value);
    expect(result.startsWith("'")).toBe(true);
    expect(result.slice(1)).toBe(value);
  });

  it.each([
    "normal",
    "山行",
    "a=b",
    "1+1",
    "email@example.com",
    "middle @ sign",
    "minus - inside",
    "",
  ])("preserves ordinary text %j", (value) => {
    expect(safeSpreadsheetText(value)).toBe(value);
  });

  it.each([
    ["&", "&amp;"],
    ["<", "&lt;"],
    [">", "&gt;"],
    ['"', "&quot;"],
    ["'", "&apos;"],
    ["<&>\"'", "&lt;&amp;&gt;&quot;&apos;"],
  ])("XML-escapes %j", (value, expected) => {
    expect(escapeXml(value)).toBe(expected);
  });

  it.each([
    "\0",
    "\u0001",
    "\u0008",
    "\u000b",
    "\u000c",
    "\u000e",
    "\u001f",
    "\ufffe",
    "\uffff",
  ])("removes invalid XML control %j", (control) => {
    expect(stripInvalidXml(`before${control}after`)).toBe("beforeafter");
  });

  it.each(dangerousValues)("writes %j as String without formula markup", (value) => {
    const xml = worksheet("安全", [["值", value, 12.34]]);
    expect(xml).toContain('ss:Type="String"');
    expect(xml).toContain('ss:Type="Number">12.34');
    expect(xml).not.toContain("<f");
    expect(xml).toContain("&apos;");
  });

  const exportedFields = [
    "member.nickname",
    "member.realName",
    "member.equipmentNotes",
    "record.routeName",
    "record.createdBy",
    "expense.note",
    "photo.filename",
    "photo.note",
  ] as const;

  function stateWith(field: (typeof exportedFields)[number], value: string): AppState {
    const state = clone(validState);
    if (field === "member.nickname") state.members[0].nickname = value;
    if (field === "member.realName") state.members[0].realName = value;
    if (field === "member.equipmentNotes") state.members[0].equipmentNotes = value;
    if (field === "record.routeName") state.records[0].routeName = value;
    if (field === "record.createdBy") state.records[0].createdBy = value;
    if (field === "expense.note") state.records[0].expenses[0].note = value;
    if (field === "photo.filename") state.photos[0].filename = value;
    if (field === "photo.note") state.photos[0].note = value;
    return state;
  }

  it.each(
    exportedFields.flatMap((field) =>
      dangerousValues.map((value) => ({ name: `${field} with ${JSON.stringify(value)}`, field, value })),
    ),
  )("$name cannot create a workbook formula", ({ field, value }) => {
    const xml = buildSpreadsheetXml(stateWith(field, value));
    expect(xml).not.toContain("<f");
    expect(xml).not.toContain(`<Data ss:Type="String">${escapeXml(value)}</Data>`);
    expect(xml).toContain(`<Data ss:Type="String">${escapeXml(`'${value}`)}</Data>`);
    expect(xml).toContain('ss:Type="Number"');
  });

  it("uses fixed sheet names and a complete workbook envelope", () => {
    const xml = buildSpreadsheetXml(validState);
    for (const name of ["完成记录", "同行成员", "费用", "身体数据", "图片备注", "成员档案"]) {
      expect(xml).toContain(`ss:Name="${name}"`);
    }
    expect(xml).toMatch(/^<\?xml version="1.0"/);
    expect(xml).toContain("</Workbook>");
    expect(xml).not.toContain("<script");
  });

  it("scopes a single-record workbook to that record", () => {
    const other = { ...clone(validRecord), id: "r-other", routeName: "不应导出" };
    const state = { ...clone(validState), records: [validRecord, other] };
    const xml = buildSpreadsheetXml(state, validRecord);
    expect(xml).toContain(validRecord.routeName);
    expect(xml).not.toContain("不应导出");
  });
});

describe("safe download and archive names", () => {
  const hostileNames = [
    "../secret",
    "..\\secret",
    "/etc/passwd",
    "C:\\Windows\\win.ini",
    "\\server\\share",
    "\r\nContent-Disposition: evil",
    "\0evil",
    ".hidden",
    "....",
    "",
    " ",
    "a/b/c",
    "a\\b\\c",
    "😀山行",
    ...Array.from({ length: 140 }, (_, index) => `../route-${index}/../../photo-${index}`),
  ];
  it.each(hostileNames.map((value, index) => [index, value] as const))(
    "sanitizes download name case %i",
    (_index, value) => {
      const result = safeDownloadName(value);
      expect(result.length).toBeGreaterThan(0);
      expect(result.length).toBeLessThanOrEqual(80);
      expect(result).not.toMatch(/[\\/\u0000-\u001f\u007f]/);
      expect(result).not.toContain("..");
      expect(safeDownloadName(result)).toBe(result);
    },
  );

  it.each(
    hostileNames.slice(0, 120).map((filename, index) => ({
      index,
      photo: { ...validPhoto, id: index % 3 === 0 ? `photo-${index}` : "../bad", filename },
    })),
  )("archive entry $index ignores hostile original names", ({ index, photo }) => {
    const entry = safeArchiveEntry(photo, index);
    expect(entry).toMatch(/^03-scenery\/\d{4}-(?:photo-\d+)\.(?:jpg|bin)$/);
    expect(entry).not.toContain("..");
    expect(entry).not.toContain("\\");
    if (photo.filename) expect(entry).not.toContain(photo.filename);
  });

  it.each([
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
    ["image/webp", "webp"],
    ["image/avif", "avif"],
    ["image/heic", "heic"],
    ["application/octet-stream", "bin"],
  ])("maps %s to fixed extension %s", (contentType, extension) => {
    const entry = safeArchiveEntry({ ...validPhoto, contentType }, 0);
    expect(entry).toMatch(new RegExp(`\\.${extension}$`));
  });

  it.each([
    ["start", "01-departure"],
    ["node", "02-waypoints"],
    ["scenery", "03-scenery"],
    ["finish", "04-finish"],
  ] as const)("maps category %s to %s", (category, folder) => {
    expect(safeArchiveEntry({ ...validPhoto, category }, 0)).toMatch(new RegExp(`^${folder}/`));
  });

  it("normalizes TSV row-breaking and formula characters", () => {
    expect(safeTsvCell("\t=cmd\r\nnext")).toBe("' =cmd next");
  });
});

describe("JSON backup contract", () => {
  it("removes the current principal and transient photo URLs from full export", () => {
    const payload = buildJsonPayload(validState) as Record<string, unknown> & {
      photos: Array<Record<string, unknown>>;
    };
    expect(payload.schemaVersion).toBe("1.1");
    expect(payload).not.toHaveProperty("currentUser");
    expect(payload.photos[0]).not.toHaveProperty("url");
    expect(payload).toHaveProperty("unitSystem.currency", "CNY");
    expect(JSON.parse(JSON.stringify(payload))).toEqual(payload);
  });

  it("scopes a single export to record, participants, plan and photo metadata", () => {
    const other = { ...clone(validRecord), id: "r-other", participants: [] };
    const payload = buildJsonPayload(
      { ...clone(validState), records: [validRecord, other] },
      validRecord,
    ) as Record<string, unknown> & { photos: Array<Record<string, unknown>> };
    expect(payload.record).toEqual(validRecord);
    expect(payload.sourcePlan).toEqual(validState.plans[0]);
    expect(payload.participants).toHaveLength(validRecord.participants.length);
    expect(payload.photos).toHaveLength(1);
    expect(payload.photos[0]).not.toHaveProperty("url");
    expect(JSON.stringify(payload)).not.toContain('"r-other"');
  });

  it("uses null when a source plan no longer exists", () => {
    const payload = buildJsonPayload({ ...validState, plans: [] }, validRecord) as {
      sourcePlan: unknown;
    };
    expect(payload.sourcePlan).toBeNull();
  });

  it("does not mutate application state", () => {
    const state = clone(validState);
    const before = clone(state);
    buildJsonPayload(state);
    buildSpreadsheetXml(state);
    expect(state).toEqual(before);
  });
});

describe("export properties", () => {
  it("arbitrary spreadsheet text never creates a formula node", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 2_000 }), (value) => {
        const xml = worksheet("data", [[value]]);
        expect(xml).not.toContain("<f");
        expect(xml).not.toContain("</Data><f");
        expect(() => new DOMParser().parseFromString(xml, "application/xml")).not.toThrow();
      }),
      { numRuns: 2_000 },
    );
  });

  it("arbitrary download names stay path-free and bounded", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 1_000 }), (value) => {
        const result = safeDownloadName(value);
        expect(result.length).toBeGreaterThan(0);
        expect(result.length).toBeLessThanOrEqual(80);
        expect(result).not.toMatch(/[\\/\u0000-\u001f\u007f]/);
        expect(result).not.toContain("..");
      }),
      { numRuns: 2_000 },
    );
  });
});
