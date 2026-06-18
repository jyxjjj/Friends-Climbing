const CSV_DANG = /^[=+\-@\t\r\n]/;
export const RECORD_COLUMNS = [
  'id',
  'planId',
  'routeName',
  'difficulty',
  'date',
  'memberIds',
  'plannedDistanceKm',
  'plannedDurationMin',
  'plannedElevationM',
  'actualDistanceKm',
  'actualDurationMin',
  'actualElevationM',
  'budget',
  'expenses',
  'bodyData',
  'roadNotes',
  'riskNotes',
  'weather',
  'review',
  'otherNotes',
  'createdBy',
  'createdAt',
  'updatedAt',
  'version',
];
function cell(v: any) {
  let s = String(v ?? '');
  if (CSV_DANG.test(s)) s = "'" + s;
  return `"${s.replace(/"/g, '""')}"`;
}
export function csv(rows: any[]) {
  const cols = RECORD_COLUMNS;
  return [
    cols.map(cell).join(','),
    ...rows.map((r) =>
      cols.map((c) => cell(typeof r[c] === 'object' ? JSON.stringify(r[c]) : r[c])).join(','),
    ),
  ].join('\n');
}
export function jsonc(data: any) {
  return `// Friends Climbing export\n${JSON.stringify(data, null, 2)}`;
}
export function jsonl(rows: any[]) {
  return rows.map((r) => JSON.stringify(r)).join('\n');
}
export function sql(rows: any[], table = 'climb_records') {
  if (table !== 'climb_records') throw new Error('invalid table');
  const create = `CREATE TABLE IF NOT EXISTS ${table} (id VARCHAR(128) PRIMARY KEY, data JSON NOT NULL, created_at TIMESTAMP NULL);`;
  const ins = rows
    .map(
      (r) =>
        `INSERT INTO ${table} (id,data,created_at) VALUES ('${esc(r.id)}', CAST('${esc(JSON.stringify(r))}' AS JSON), '${esc(r.createdAt || '')}');`,
    )
    .join('\n');
  return create + '\n' + ins;
}
function esc(s: string) {
  return String(s).replace(/\\/g, '\\\\').replace(/'/g, "''");
}
function xml(s: any) {
  return String(s ?? '').replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!,
  );
}
function crc32(str: string) {
  let c = ~0;
  for (let i = 0; i < str.length; i++) {
    c ^= str.charCodeAt(i);
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function dosDate() {
  return { time: 0, date: 0x0021 };
}
function zip(files: Record<string, string>) {
  const parts: Uint8Array[] = [],
    central: Uint8Array[] = [];
  let off = 0;
  const enc = new TextEncoder();
  const u16 = (n: number) => [n & 255, (n >>> 8) & 255],
    u32 = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
  for (const [name, content] of Object.entries(files)) {
    const nb = enc.encode(name),
      db = enc.encode(content),
      crc = crc32(content),
      d = dosDate();
    const local = new Uint8Array([
      ...u32(0x04034b50),
      ...u16(20),
      0,
      0,
      0,
      0,
      ...u16(d.time),
      ...u16(d.date),
      ...u32(crc),
      ...u32(db.length),
      ...u32(db.length),
      ...u16(nb.length),
      0,
      0,
      ...nb,
      ...db,
    ]);
    parts.push(local);
    const cen = new Uint8Array([
      ...u32(0x02014b50),
      20,
      0,
      20,
      0,
      0,
      0,
      0,
      0,
      ...u16(d.time),
      ...u16(d.date),
      ...u32(crc),
      ...u32(db.length),
      ...u32(db.length),
      ...u16(nb.length),
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      ...u32(off),
      ...nb,
    ]);
    central.push(cen);
    off += local.length;
  }
  const csize = central.reduce((a, b) => a + b.length, 0);
  const end = new Uint8Array([
    ...u32(0x06054b50),
    0,
    0,
    0,
    0,
    ...u16(central.length),
    ...u16(central.length),
    ...u32(csize),
    ...u32(off),
    0,
    0,
  ]);
  return new Blob([...parts, ...central, end] as any[], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}
export function xlsx(rows: any[]) {
  const headers = RECORD_COLUMNS;
  const data = [
    headers,
    ...rows.map((r) =>
      headers.map((h) => (typeof r[h] === 'object' ? JSON.stringify(r[h]) : (r[h] ?? ''))),
    ),
  ];
  const sheetRows = data
    .map(
      (row, i) =>
        `<row r="${i + 1}">${row.map((v, j) => `<c r="${String.fromCharCode(65 + j)}${i + 1}" t="inlineStr"><is><t>${xml(v)}</t></is></c>`).join('')}</row>`,
    )
    .join('');
  return zip({
    '[Content_Types].xml':
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    '_rels/.rels':
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml':
      '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Records" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels':
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/worksheets/sheet1.xml': `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`,
  });
}
