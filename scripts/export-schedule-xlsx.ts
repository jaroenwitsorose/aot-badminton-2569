/**
 * สร้างไฟล์ Excel สรุปตารางแข่งทั้งหมดจาก data/seed-data.json
 *
 *   npm run export:schedule                 → ได้ไฟล์ในโฟลเดอร์ปัจจุบัน
 *   npm run export:schedule -- <ที่อยู่ไฟล์> → กำหนดที่เก็บเอง
 *
 * ไฟล์จะได้ชื่อลงท้าย -v1, -v2, -v3 ... ไล่ขึ้นเสมอ ไม่เขียนทับของเดิม
 * (ใส่ --overwrite ถ้าอยากเขียนทับชื่อที่ระบุจริง ๆ)
 *   npm run export:schedule -- <ไฟล์> --compare <ตารางเก่า.json>
 *        → เพิ่มชีตเทียบก่อน/หลังให้ด้วย
 *
 * ไฟล์นี้ไว้แจกผู้เล่นและติดบอร์ดหน้างาน จึงเน้นอ่านง่ายมากกว่านำกลับเข้าระบบ
 * (ไฟล์สำหรับกรอกข้อมูลกลับเข้าระบบคือคนละไฟล์ อยู่ที่หน้ารายชื่อนักกีฬา)
 */

import ExcelJS from "exceljs";
import { validateXlsx } from "./validate-xlsx";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const compareIdx = args.indexOf("--compare");
const comparePath = compareIdx >= 0 ? args[compareIdx + 1] : null;
/**
 * ตั้งชื่อไฟล์แบบมีเวอร์ชัน ไม่เขียนทับไฟล์เดิมเด็ดขาด
 *
 * เหตุผล: ไฟล์ที่แจกออกไปแล้วต้องอ้างอิงย้อนหลังได้ว่าใครถือเวอร์ชันไหน
 * และถ้าเผลอสร้างทับตอนที่ไฟล์เปิดค้างอยู่ใน Excel จะเขียนไม่ได้ (EBUSY)
 */
function versionedPath(requested: string): string {
  const dir = path.dirname(requested);
  const ext = path.extname(requested) || ".xlsx";
  const base = path.basename(requested, ext).replace(/-v\d+$/, "");
  const prefix = `${base}-v`;
  let next = 1;
  if (existsSync(dir)) {
    for (const f of readdirSync(dir)) {
      if (!f.startsWith(prefix) || !f.endsWith(ext)) continue;
      const n = Number(f.slice(prefix.length, f.length - ext.length));
      if (Number.isInteger(n) && n >= next) next = n + 1;
    }
  }
  return path.join(dir, `${prefix}${next}${ext}`);
}

const requested = args.find((a) => a.endsWith(".xlsx")) ?? "ตารางแข่งขันแบดมินตัน-ทอท-2569.xlsx";
const outPath = args.includes("--overwrite") ? requested : versionedPath(requested);

interface Match {
  matchNo: number;
  matchUid: string;
  sourceMatchCode: string;
  dayNo: number;
  startTime: string;
  endTime: string;
  courtNo: number;
  levelCode: string;
  eventType: string | null;
  phase: string;
  bracket: string;
  roundLabel: string;
  groupKey: string | null;
  tieId: string | null;
  tieOrderNo: number | null;
  sideASource: string;
  sideBSource: string;
}
interface Tie {
  tieId: string;
  tieNo: number;
  phase: string;
  stage: string;
  dayNo: number;
  startTime: string;
  courts: string;
  teamASource: string;
  teamBSource: string;
  matchNos: number[];
}
interface Seed {
  tournament: { titleTh: string; venue: string | null; venueConfirmed: boolean };
  levels: { levelCode: string; nameTh: string; format: string; eventTypes: string; pairSlots: number }[];
  pairs: unknown[];
  participants: unknown[];
  matches: Match[];
  ties: Tie[];
}

const seed = JSON.parse(readFileSync(path.join(here, "..", "data", "seed-data.json"), "utf-8")) as Seed;
const M = [...seed.matches].sort((a, b) => a.matchNo - b.matchNo);
const byCode = new Map(M.map((m) => [m.sourceMatchCode, m]));

const LEVEL_TH: Record<string, string> = {
  LEVEL1: "มือใหม่",
  LEVEL2: "มือ D",
  LEVEL3: "มือ C",
  LEVEL4: "มือทั่วไป",
};
const EVENT_TH: Record<string, string> = { MD: "ชายคู่", WD: "หญิงคู่", XD: "คู่ผสม" };
const TEAM_TH: Record<string, string> = { PUR: "ม่วง", GRN: "เขียว", RED: "แดง", BLU: "น้ำเงิน" };
const L = (c: string) => LEVEL_TH[c] ?? c;

/**
 * แปลง "ที่มาของฝั่ง" ให้เป็นภาษาคน
 * ตอนนี้ยังไม่มีชื่อนักกีฬาจริง ช่องคู่แข่งขันจึงบอกที่มาแทน เช่น "ผู้ชนะนัดที่ 12"
 * ซึ่งอ่านแล้วรู้ทันทีว่าต้องรอผลนัดไหน — ดีกว่าเว้นว่างหรือใส่รหัสดิบ
 */
function sideLabel(src: string): string {
  const p = src.split(":");
  switch (p[0]) {
    case "SEED":
      return `${L(`LEVEL${p[1][1]}`)} ${EVENT_TH[p[2]] ?? p[2]} · สาย ${Number(p[3])}`;
    case "GROUP":
      return `${L(`LEVEL${p[1][1]}`)} · กลุ่ม ${p[2]} คู่ที่ ${p[3].replace("SLOT", "")}`;
    case "GROUP_RANK":
      return `${L(`LEVEL${p[1][1]}`)} · อันดับ ${p[3]} กลุ่ม ${p[2]}`;
    case "WINNER": {
      const ref = byCode.get(src.slice(7));
      return ref ? `ผู้ชนะนัดที่ ${ref.matchNo}` : `ผู้ชนะ ${src.slice(7)}`;
    }
    case "LOSER": {
      const ref = byCode.get(src.slice(6));
      return ref ? `ผู้แพ้นัดที่ ${ref.matchNo}` : `ผู้แพ้ ${src.slice(6)}`;
    }
    case "LINEUP": {
      const [, , , team, order] = p;
      const no = order.replace("ORDER", "");
      if (TEAM_TH[team]) return `${TEAM_TH[team]} · คู่ที่ ${no}`;
      if (/^RANK[1-4]$/.test(team)) return `สีอันดับ ${team.slice(4)} · คู่ที่ ${no}`;
      const m = /^(WINNER|LOSER)_T(\d+)$/.exec(team);
      if (m) {
        const tie = seed.ties.find((t) => t.tieId === `L4-T${m[2]}`);
        return `${m[1] === "WINNER" ? "ผู้ชนะ" : "ผู้แพ้"} ${tie?.stage ?? `คู่สี ${m[2]}`} · คู่ที่ ${no}`;
      }
      return src;
    }
    default:
      return src;
  }
}

// ───────────────────────── สไตล์ ─────────────────────────
const NAVY = "FF061F46";
const GOLD = "FFF7C948";
const SOFT = "FFEDF1F7";
const LINE = "FFCBD5E1";

function header(ws: ExcelJS.Worksheet, cols: { header: string; width: number }[]) {
  ws.columns = cols.map((c) => ({ width: c.width }));
  const row = ws.addRow(cols.map((c) => c.header));
  row.height = 26;
  row.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  });
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
}

function zebra(ws: ExcelJS.Worksheet, keyCol = 0) {
  let last = "";
  let shade = false;
  for (let r = 2; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r);
    if (keyCol > 0) {
      const key = String(row.getCell(keyCol).value ?? "");
      if (key !== last) {
        shade = !shade;
        last = key;
      }
    } else {
      shade = r % 2 === 0;
    }
    row.eachCell({ includeEmpty: true }, (cell) => {
      if (shade) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: SOFT } };
      cell.border = {
        top: { style: "hair", color: { argb: LINE } },
        bottom: { style: "hair", color: { argb: LINE } },
        left: { style: "hair", color: { argb: LINE } },
        right: { style: "hair", color: { argb: LINE } },
      };
      cell.alignment = { vertical: "middle" };
    });
  }
}

const wb = new ExcelJS.Workbook();
wb.creator = "AOT Badminton 2569";
wb.created = new Date();

// ───────────────────────── 1. สรุป ─────────────────────────
const sum = wb.addWorksheet("สรุป");
sum.columns = [{ width: 26 }, { width: 18 }, { width: 16 }, { width: 44 }];
const title = sum.addRow([seed.tournament.titleTh]);
title.getCell(1).font = { bold: true, size: 15, color: { argb: NAVY } };
title.height = 26;
sum.addRow([]);

const days = [...new Set(M.map((m) => m.dayNo))].sort();
sum.addRow(["ภาพรวม"]).getCell(1).font = { bold: true, size: 12 };
for (const [k, v] of [
  ["จำนวนแมตช์ทั้งหมด", `${M.length} แมตช์`],
  ["จำนวนวันแข่ง", `${days.length} วัน`],
  ["คอร์ตที่ใช้", `${[...new Set(M.map((m) => m.courtNo))].sort((a, b) => a - b).join(", ")}`],
  ["คู่แข่งขัน", `${seed.pairs.length} คู่ · นักกีฬา ${seed.participants.length} คน`],
  ["สถานที่", seed.tournament.venue ?? "ยังไม่กำหนด"],
  ["วันที่จริง", "ยังไม่กำหนด — ใช้ วันที่ 1/2/3 ไปก่อน"],
] as [string, string][]) {
  const r = sum.addRow([k, v]);
  r.getCell(1).font = { color: { argb: "FF64748B" } };
  r.getCell(2).font = { bold: true };
}
sum.addRow([]);

sum.addRow(["แต่ละวัน"]).getCell(1).font = { bold: true, size: 12 };
const dh = sum.addRow(["วัน", "เวลา", "จำนวนแมตช์", "คอร์ตที่ใช้"]);
dh.eachCell((c) => {
  c.font = { bold: true, color: { argb: "FFFFFFFF" } };
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
});
for (const d of days) {
  const inDay = M.filter((m) => m.dayNo === d);
  sum.addRow([
    `วันที่ ${d}`,
    `${inDay.reduce((a, b) => (a.startTime < b.startTime ? a : b)).startTime}–${inDay.reduce((a, b) => (a.endTime > b.endTime ? a : b)).endTime}`,
    inDay.length,
    [...new Set(inDay.map((m) => m.courtNo))].sort((a, b) => a - b).join(", "),
  ]);
}
sum.addRow([]);

sum.addRow(["แยกตามระดับมือ"]).getCell(1).font = { bold: true, size: 12 };
const lh = sum.addRow(["ระดับมือ", "จำนวนคู่", "จำนวนแมตช์", "รูปแบบการแข่ง"]);
lh.eachCell((c) => {
  c.font = { bold: true, color: { argb: "FFFFFFFF" } };
  c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
});
for (const lv of seed.levels) {
  sum.addRow([lv.nameTh, lv.pairSlots, M.filter((m) => m.levelCode === lv.levelCode).length, lv.format]);
}
sum.addRow([]);

sum.addRow(["กติกาการจัดตาราง"]).getCell(1).font = { bold: true, size: 12 };
for (const t of [
  "มือใหม่: คู่ผสมไม่แข่งพร้อมกับชายคู่/หญิงคู่ เพราะคนหนึ่งลงข้ามประเภทได้",
  "มือใหม่: ชายคู่กับหญิงคู่ลงพร้อมกันได้ (คนละเพศ) และสองแมตช์ประเภทเดียวกันก็ได้ (คนละคู่)",
  "มือทั่วไป รอบพบกันหมด: คู่สีหนึ่งลงคู่ที่ 1→2→3 ทีละช่วง ไม่ลงพร้อมกัน 3 คอร์ต",
  "มือทั่วไป รอบ Page Playoff: ลง 3 คอร์ตพร้อมกันตามเดิม",
  "ทุกแมตช์ที่ต่อเนื่องกันมีเวลาพักอย่างน้อย 30 นาที",
  "ช่องคู่แข่งขันที่ยังเป็น \"ผู้ชนะนัดที่ ...\" จะเติมชื่อจริงให้เองเมื่อผลออก",
]) {
  const r = sum.addRow([`· ${t}`]);
  sum.mergeCells(`A${r.number}:D${r.number}`);
  r.getCell(1).alignment = { wrapText: true, vertical: "middle" };
  r.height = 18;
}
sum.addRow([]);
sum.addRow([`สร้างเมื่อ ${new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}`]).getCell(1).font = {
  color: { argb: "FF94A3B8" },
  size: 10,
};

// ───────────────────────── 2. ตารางแข่งขัน ─────────────────────────
const list = wb.addWorksheet("ตารางแข่งขัน");
header(list, [
  { header: "นัดที่", width: 8 },
  { header: "วัน", width: 10 },
  { header: "เริ่ม", width: 8 },
  { header: "จบ", width: 8 },
  { header: "คอร์ต", width: 8 },
  { header: "ระดับมือ", width: 12 },
  { header: "ประเภท", width: 10 },
  { header: "รอบ", width: 34 },
  { header: "ฝั่ง A", width: 30 },
  { header: "ฝั่ง B", width: 30 },
  { header: "รหัสนัด", width: 16 },
]);
for (const m of M) {
  list.addRow([
    m.matchNo,
    `วันที่ ${m.dayNo}`,
    m.startTime,
    m.endTime,
    m.courtNo,
    L(m.levelCode),
    m.eventType ? EVENT_TH[m.eventType] : "—",
    m.roundLabel,
    sideLabel(m.sideASource),
    sideLabel(m.sideBSource),
    m.sourceMatchCode,
  ]);
}
zebra(list, 2);
for (let r = 2; r <= list.rowCount; r += 1) {
  [1, 3, 4, 5].forEach((c) => (list.getRow(r).getCell(c).alignment = { horizontal: "center", vertical: "middle" }));
}

// ───────────────────────── 3. ผังคอร์ต (แบบติดบอร์ด) ─────────────────────────
//
// ชีตนี้ทำมาเพื่อ "พิมพ์ติดบอร์ดหน้างาน" โดยเฉพาะ จึงใช้สีแยกประเภทแทนการอ่านตัวหนังสือ
// ผู้เล่นมองปราดเดียวต้องเจอคอร์ตกับเวลาของตัวเอง ไม่ต้องไล่อ่านทีละบรรทัด

/** สีประจำแต่ละประเภท — เลือกให้อ่อนพอที่ตัวหนังสือสีเข้มยังชัดเมื่อพิมพ์ขาวดำ */
const FILL: Record<string, string> = {
  "LEVEL1:MD": "FFD9EAD3", // เขียวอ่อน
  "LEVEL1:WD": "FFFADCE8", // ชมพูอ่อน
  "LEVEL1:XD": "FFE4E4E4", // เทาอ่อน
  LEVEL2: "FFCFE2F3", // ฟ้าอ่อน
  LEVEL3: "FFFCE5D6", // ส้มอ่อน
  LEVEL4: "FFFDE9A9", // เหลืองทอง
};
const fillOf = (m: Match) =>
  m.levelCode === "LEVEL1" ? FILL[`LEVEL1:${m.eventType}`] : FILL[m.levelCode];

const tieOfId = new Map(seed.ties.map((t) => [t.tieId, t]));

/** ข้อความสองบรรทัดในช่อง: บรรทัดบนบอกว่าใครแข่ง บรรทัดล่างบอกรอบ */
function cellText(m: Match): string {
  if (m.levelCode === "LEVEL4" && m.tieId) {
    const t = tieOfId.get(m.tieId)!;
    const team = (x: string) =>
      TEAM_TH[x] ??
      (/^RANK[1-4]$/.test(x)
        ? `สีอันดับ ${x.slice(4)}`
        : x.replace("WINNER_T", "ผู้ชนะคู่สี ").replace("LOSER_T", "ผู้แพ้คู่สี "));
    const stage = t.phase === "ROUND_ROBIN" ? t.stage.replace("คู่สีที่", "คู่สีที่") : t.stage;
    return `#${m.matchNo}  มือทั่วไป · ${team(t.teamASource)} พบ ${team(t.teamBSource)}
${stage} · คู่ที่ ${m.tieOrderNo}`;
  }
  const ev = m.eventType ? ` · ${EVENT_TH[m.eventType]}` : "";
  return `#${m.matchNo}  ${L(m.levelCode)}${ev}
${m.roundLabel}`;
}

// ห้ามใส่ views แบบ frozen ที่นี่ — ชีตนี้มีหัวข้อซ้ำรายวัน ตรึงแถวบนไม่มีประโยชน์
// และถ้าใส่ frozen โดยไม่มีค่า split จริง exceljs จะเขียน <pane state="frozen"/> เปล่า ๆ
// ซึ่งผิดสเปก OOXML แล้ว Excel จะฟ้องว่า "พบปัญหากับเนื้อหาบางอย่าง" ตอนเปิดไฟล์
const grid = wb.addWorksheet("ผังคอร์ต", {
  pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 },
});
const courts = [...new Set(M.map((m) => m.courtNo))].sort((a, b) => a - b);
const lastCol = 1 + courts.length;
grid.columns = [{ width: 14 }, ...courts.map(() => ({ width: 32 }))];

const colLetter = (i: number) => grid.getColumn(i).letter;
function banner(text: string, bg: string, fg: string, size: number, height: number) {
  const row = grid.addRow([text]);
  grid.mergeCells(`${colLetter(1)}${row.number}:${colLetter(lastCol)}${row.number}`);
  const cell = row.getCell(1);
  cell.value = text;
  cell.font = { bold: true, size, color: { argb: fg } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
  cell.alignment = { horizontal: "center", vertical: "middle" };
  row.height = height;
  return row;
}

banner(seed.tournament.titleTh, NAVY, "FFFFFFFF", 16, 34);
banner(
  `${M.length} แมตช์ · ${seed.levels.length} ระดับมือ · 4 สี · ${seed.pairs.length} คู่ · ` +
    `ช่องละ 30 นาที · ${courts.length} คอร์ต` +
    (seed.tournament.venue ? ` · สถานที่ ${seed.tournament.venue}` : ""),
  "FF1768C5",
  "FFFFFFFF",
  11,
  20,
);

// แถบอธิบายสี — ต้องมี ไม่งั้นสีบนกระดาษไม่มีความหมาย
const legendRow = grid.addRow([
  "คำอธิบายสี",
  ...["มือใหม่ ชายคู่", "มือใหม่ หญิงคู่", "มือใหม่ คู่ผสม", "มือ D", "มือ C"].slice(0, courts.length),
]);
legendRow.height = 20;
const legendFills = ["", FILL["LEVEL1:MD"], FILL["LEVEL1:WD"], FILL["LEVEL1:XD"], FILL.LEVEL2, FILL.LEVEL3];
legendRow.eachCell({ includeEmpty: true }, (cell, i) => {
  cell.font = { bold: true, size: 10 };
  cell.alignment = { horizontal: "center", vertical: "middle" };
  if (legendFills[i - 1]) {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: legendFills[i - 1] } };
  }
  cell.border = { top: { style: "thin", color: { argb: LINE } }, bottom: { style: "thin", color: { argb: LINE } }, left: { style: "thin", color: { argb: LINE } }, right: { style: "thin", color: { argb: LINE } } };
});
const legend2 = grid.addRow(["", "มือทั่วไป (ทีมสี)"]);
legend2.getCell(2).fill = { type: "pattern", pattern: "solid", fgColor: { argb: FILL.LEVEL4 } };
legend2.getCell(2).font = { bold: true, size: 10 };
legend2.getCell(2).alignment = { horizontal: "center", vertical: "middle" };
legend2.getCell(2).border = { top: { style: "thin", color: { argb: LINE } }, bottom: { style: "thin", color: { argb: LINE } }, left: { style: "thin", color: { argb: LINE } }, right: { style: "thin", color: { argb: LINE } } };
legend2.height = 20;

for (const d of days) {
  grid.addRow([]).height = 8;

  const inDay = M.filter((m) => m.dayNo === d);
  const first = inDay.reduce((a, b) => (a.startTime < b.startTime ? a : b)).startTime;
  const last = inDay.reduce((a, b) => (a.endTime > b.endTime ? a : b)).endTime;
  // แต่ละวันใช้คอร์ตไม่เท่ากัน (วันสุดท้ายใช้แค่ 3) — บอกให้ตรงกับความจริงของวันนั้น
  const dayCourts = new Set(inDay.map((m) => m.courtNo));
  banner(`วันแข่งขันที่ ${d}   (${first}–${last} น. · ${dayCourts.size} คอร์ต)`, NAVY, "FFFFFFFF", 13, 26);

  const head = grid.addRow(["เวลา", ...courts.map((c) => `คอร์ตที่ ${c}`)]);
  head.height = 22;
  head.eachCell((cell) => {
    cell.font = { bold: true, size: 12 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9D9D9" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } };
  });

  const times = [...new Set(inDay.map((m) => m.startTime))].sort();
  for (const t of times) {
    const inSlot = inDay.filter((m) => m.startTime === t);
    const row = grid.addRow([
      `${t}-${inSlot[0].endTime}`,
      ...courts.map((c) => {
        const m = inSlot.find((x) => x.courtNo === c);
        if (m) return cellText(m);
        // คอร์ตที่วันนั้นไม่ได้ใช้เลย ปล่อยว่างสนิท ไม่ต้องเขียนอะไร
        return dayCourts.has(c) ? "ว่าง" : "";
      }),
    ]);
    row.height = 34;
    row.eachCell({ includeEmpty: true }, (cell, i) => {
      cell.border = {
        top: { style: "thin", color: { argb: LINE } },
        bottom: { style: "thin", color: { argb: LINE } },
        left: { style: "thin", color: { argb: LINE } },
        right: { style: "thin", color: { argb: LINE } },
      };
      if (i === 1) {
        cell.font = { bold: true, size: 11 };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } };
        return;
      }
      const court = courts[i - 2];
      const m = inSlot.find((x) => x.courtNo === court);
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      if (!m) {
        // คอร์ตที่วันนั้นไม่เปิดใช้ ทำเป็นพื้นเทาทึบให้รู้ว่า "ไม่มีคอร์ตนี้" ไม่ใช่ "ว่างรอคิว"
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: dayCourts.has(court) ? "FFFFFFFF" : "FFEDEDED" },
        };
        cell.font = { size: 10, italic: true, color: { argb: "FFAAAAAA" } };
        return;
      }
      cell.font = { size: 10, color: { argb: "FF1A1A1A" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fillOf(m) } };
    });
  }

  // แถวสำรองท้ายวัน — เผื่อแมตช์ยืดหรือมีเหตุให้เลื่อน
  const reserve = grid.addRow(["สำรอง", ...courts.map((c) => (dayCourts.has(c) ? "สำรอง" : ""))]);
  reserve.height = 24;
  reserve.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { size: 10, italic: true, color: { argb: "FF999999" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = {
      top: { style: "thin", color: { argb: LINE } },
      bottom: { style: "thin", color: { argb: LINE } },
      left: { style: "thin", color: { argb: LINE } },
      right: { style: "thin", color: { argb: LINE } },
    };
  });
}

// ───────────────────────── 4. คู่สีมือทั่วไป ─────────────────────────
const tieWs = wb.addWorksheet("คู่สีมือทั่วไป");
header(tieWs, [
  { header: "คู่สีที่", width: 9 },
  { header: "รอบ", width: 30 },
  { header: "สี", width: 24 },
  { header: "วัน", width: 10 },
  { header: "เวลา", width: 22 },
  { header: "คอร์ต", width: 10 },
  { header: "นัดที่", width: 18 },
]);
for (const t of [...seed.ties].sort((a, b) => a.tieNo - b.tieNo)) {
  const ms = t.matchNos.map((n) => M.find((m) => m.matchNo === n)!).sort((a, b) => a.matchNo - b.matchNo);
  const teamText = (s: string) =>
    TEAM_TH[s] ?? (/^RANK[1-4]$/.test(s) ? `สีอันดับ ${s.slice(4)}` : s.replace("WINNER_T", "ผู้ชนะคู่สี ").replace("LOSER_T", "ผู้แพ้คู่สี "));
  tieWs.addRow([
    t.tieNo,
    t.stage,
    `${teamText(t.teamASource)} พบ ${teamText(t.teamBSource)}`,
    `วันที่ ${t.dayNo}`,
    [...new Set(ms.map((m) => m.startTime))].sort().join(" · "),
    t.courts,
    ms.map((m) => `#${m.matchNo}`).join(" "),
  ]);
}
zebra(tieWs, 0);

// ───────────────────────── 5. เทียบก่อน/หลัง (ถ้าสั่ง) ─────────────────────────
if (comparePath) {
  const oldSeed = JSON.parse(readFileSync(comparePath, "utf-8")) as Seed;
  const oldByUid = new Map(oldSeed.matches.map((m) => [m.matchUid, m]));
  const cmp = wb.addWorksheet("เทียบก่อน-หลัง");
  header(cmp, [
    { header: "นัดที่ (เดิม → ใหม่)", width: 20 },
    { header: "ระดับมือ", width: 12 },
    { header: "ประเภท", width: 10 },
    { header: "รอบ", width: 32 },
    { header: "เดิม", width: 26 },
    { header: "ใหม่", width: 26 },
    { header: "เปลี่ยนอะไร", width: 24 },
  ]);
  const slot = (m: Match) => `วันที่ ${m.dayNo} · ${m.startTime} · คอร์ต ${m.courtNo}`;
  let changed = 0;
  for (const m of M) {
    const o = oldByUid.get(m.matchUid);
    if (!o) continue;
    const dayT = o.dayNo !== m.dayNo;
    const timeT = o.startTime !== m.startTime;
    const courtT = o.courtNo !== m.courtNo;
    if (!dayT && !timeT && !courtT && o.matchNo === m.matchNo) continue;
    changed += 1;
    const what = [dayT && "ย้ายวัน", !dayT && timeT && "ย้ายเวลา", courtT && "ย้ายคอร์ต"].filter(Boolean).join(" · ");
    cmp.addRow([
      `#${o.matchNo} → #${m.matchNo}`,
      L(m.levelCode),
      m.eventType ? EVENT_TH[m.eventType] : "—",
      m.roundLabel,
      slot(o),
      slot(m),
      what || "เปลี่ยนแค่เลขนัด",
    ]);
  }
  zebra(cmp, 2);
  for (let r = 2; r <= cmp.rowCount; r += 1) {
    const cell = cmp.getRow(r).getCell(6);
    cell.font = { bold: true };
    if (String(cmp.getRow(r).getCell(7).value).includes("ย้ายวัน")) {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GOLD } };
    }
  }
  console.log(`  เทียบก่อน-หลัง: ${changed} แมตช์ที่เปลี่ยน`);
}

// ห่อด้วยฟังก์ชันแทน top-level await เพราะ tsx แปลงเป็น CommonJS แล้วรันโมดูล async ไม่ได้
async function write() {
  await wb.xlsx.writeFile(outPath);

  // ตรวจไฟล์ก่อนบอกว่าสำเร็จ — เคยส่งไฟล์ที่ Excel เปิดไม่ได้ออกไปมาแล้ว
  const problems = await validateXlsx(outPath);
  console.log("");
  if (problems.length > 0) {
    console.error("ไฟล์ที่สร้างมีปัญหา ไม่ควรนำไปใช้:");
    for (const p of problems) console.error(`  x ${p}`);
    process.exitCode = 1;
    return;
  }

  console.log(`สร้างไฟล์แล้ว: ${outPath}`);
  console.log(
    `  ${M.length} แมตช์ · ${days.length} วัน · ${courts.length} คอร์ต · ${seed.ties.length} คู่สี · ตรวจไฟล์ผ่าน`,
  );
  console.log("");
}

write();
