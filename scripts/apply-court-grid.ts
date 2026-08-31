/**
 * ย้ายตารางจากชีต "ผังคอร์ต" ที่จัดด้วยมือ เข้าไปเป็นตารางตั้งต้นของเว็บ
 *
 *   npx tsx scripts/apply-court-grid.ts "<ไฟล์ผังคอร์ต.xlsx>"
 *   npx tsx scripts/apply-court-grid.ts "<ไฟล์.xlsx>" --dry-run   ← ดูผลก่อน ไม่เขียนไฟล์
 *
 * ทำไมต้องมี: ปุ่ม "นำเข้าตาราง" ในหน้าผู้ดูแลไม่ได้อ่านไฟล์ Excel ที่อัปโหลด
 * แต่อ่าน data/seed-data.json ที่ติดไปกับเว็บตอน deploy การจะเอาผังคอร์ตขึ้นเว็บ
 * จึงต้องเขียนกลับเข้า seed-data.json ก่อน แล้ว deploy แล้วค่อยกดปุ่มนำเข้า
 *
 * แตะเฉพาะ "อยู่วันไหน เวลาไหน คอร์ตไหน เลขนัดอะไร" เท่านั้น
 * ไม่แตะโครงสาย ไม่แตะชื่อรอบ ไม่แตะคู่แข่งขัน — ตัวเลือกเดียวกับที่ปุ่มนำเข้าทำได้
 *
 * ผังคอร์ตบอกแค่ "ระดับมือ / สาย / รอบ" ไม่ได้บอกว่าฝั่งไหนพบฝั่งไหน จึงจับคู่
 * กับของเดิมทีละกลุ่ม เช่น "มือ C สายล่าง รอบ 8 คู่" มี 4 นัดทั้งสองฝั่ง
 * ก็เรียงตามเลขนัดแล้วจับคู่กันตามลำดับ
 */

import ExcelJS from "exceljs";
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scheduleFingerprint } from "../src/lib/schedule-fingerprint";

const here = path.dirname(fileURLToPath(import.meta.url));
const seedPath = path.join(here, "../data/seed-data.json");
const backupPath = path.join(here, "../data/seed-data.before-court-grid.json");

const srcPath = process.argv[2];
const dryRun = process.argv.includes("--dry-run");
if (!srcPath) {
  console.error('ใช้: npx tsx scripts/apply-court-grid.ts "<ไฟล์ผังคอร์ต.xlsx>" [--dry-run]');
  process.exit(1);
}

// ───────────────────────── ข้อมูลตั้งต้นเดิม ─────────────────────────
interface SeedMatch {
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
interface SeedTie {
  tieId: string;
  dayNo: number;
  startTime: string;
  courts: string;
  matchNos: number[];
}
interface Seed {
  matches: SeedMatch[];
  ties: SeedTie[];
}
const seed = JSON.parse(readFileSync(seedPath, "utf8")) as Seed & Record<string, unknown>;

const LEVEL_TH: Record<string, string> = {
  LEVEL1: "มือใหม่",
  LEVEL2: "มือ D",
  LEVEL3: "มือ C",
  LEVEL4: "มือทั่วไป",
};
const EVENT_TH: Record<string, string> = { MD: "ชายคู่", WD: "หญิงคู่", XD: "คู่ผสม" };
const L = (c: string) => LEVEL_TH[c] ?? c;

// ───────────────────────── อ่านผังคอร์ต ─────────────────────────
interface GridCell {
  no: number;
  day: number;
  start: string;
  end: string;
  court: number;
  level: string;
  event: string;
  bracket: string;
  round: string;
}

const cellText = (v: ExcelJS.CellValue): string => {
  if (v == null) return "";
  if (typeof v === "object") {
    const rich = v as { richText?: { text: string }[]; text?: string };
    if (rich.richText) return rich.richText.map((x) => x.text).join("");
    return rich.text ?? "";
  }
  return String(v);
};

function readGrid(ws: ExcelJS.Worksheet): GridCell[] {
  const cells: GridCell[] = [];
  let day = 0;

  for (let r = 1; r <= ws.rowCount; r += 1) {
    const a = cellText(ws.getRow(r).getCell(1).value).trim();
    const dm = a.match(/^วันแข่งขันที่\s*(\d+)\s*\(/);
    if (dm) {
      day = Number(dm[1]);
      continue;
    }
    const tm = a.match(/^(\d{2}:\d{2})-(\d{2}:\d{2})$/);
    if (!tm || !day) continue;

    for (let c = 2; c <= 6; c += 1) {
      const raw = cellText(ws.getRow(r).getCell(c).value).replace(/\r/g, "").trim();
      // ช่องว่าง / "สำรอง" / "X" คือช่องที่ไม่มีแมตช์ ไม่ใช่ข้อมูลผิด
      if (!raw || raw === "สำรอง" || raw === "ว่าง" || raw === "X") continue;
      const mm = raw.match(/^#(\d+)\s+([\s\S]*)$/);
      if (!mm) throw new Error(`อ่านช่องไม่ออก แถว ${r} คอลัมน์ ${c}: ${raw}`);
      const [l1, l2 = ""] = mm[2].split("\n").map((s) => s.replace(/\s+/g, " ").trim());

      let level = "";
      let event = "";
      let bracket = "";
      if (l1.startsWith("มือใหม่")) {
        level = "มือใหม่";
        event = l1.split("·")[1]?.trim() ?? "";
      } else if (l1.startsWith("มือทั่วไป")) {
        level = "มือทั่วไป";
      } else {
        const g = l1.match(/^มือ ?([CD])/);
        if (!g) throw new Error(`ไม่รู้จักระดับมือ: ${l1}`);
        level = `มือ ${g[1]}`;
        if (l1.includes("สายบน")) bracket = "สายบน";
        if (l1.includes("สายล่าง")) bracket = "สายล่าง";
      }
      cells.push({
        no: Number(mm[1]),
        day,
        start: tm[1],
        end: tm[2],
        court: c - 1,
        level,
        event,
        bracket,
        // เลข "Match ที่ N" ในผังไม่น่าเชื่อถือ (หญิงคู่เขียน 1 ซ้ำทุกนัด) จึงตัดทิ้ง
        round: l2.replace(/\s*-\s*Match ที่ \d+$/, "").trim(),
      });
    }
  }
  return cells.sort((a, b) => a.no - b.no);
}

// ───────────────── จับคู่ช่องในผัง กับแมตช์เดิม ─────────────────
const ROUND_ALIAS: Record<string, string> = { "ก่อนรองชนะเลิศ": "รอบ 8 คู่" };
const BRACKET_TH: Record<string, string> = { UPPER: "สายบน", LOWER: "สายล่าง" };

function gridBucket(g: GridCell): string {
  if (g.level === "มือทั่วไป") {
    const rr = g.round.match(/พบกันหมด คู่สีที่ (\d+) · คู่ที่ (\d+)/);
    if (rr) return `L4-T${rr[1].padStart(2, "0")}#${rr[2]}`;
    const stages: [RegExp, number][] = [
      [/^Qualifier 1 · คู่ที่ (\d+)/, 7],
      [/^Eliminator · คู่ที่ (\d+)/, 8],
      [/^Qualifier 2 .*· คู่ที่ (\d+)/, 9],
      [/^ชิงชนะเลิศ · คู่ที่ (\d+)/, 10],
    ];
    for (const [re, tie] of stages) {
      const m = g.round.match(re);
      if (m) return `L4-T${String(tie).padStart(2, "0")}#${m[1]}`;
    }
    throw new Error(`ไม่รู้จักรอบมือทั่วไป: ${g.round}`);
  }
  if (g.level === "มือใหม่") return `มือใหม่|${g.event}|${g.round}`;
  if (g.round.startsWith("กลุ่ม ")) return `${g.level}|${g.round}`;
  return `${g.level}|${g.bracket}|${g.round}`;
}

function seedBucket(m: SeedMatch): string {
  if (m.levelCode === "LEVEL4") return `${m.tieId}#${m.tieOrderNo}`;
  const round = ROUND_ALIAS[m.roundLabel] ?? m.roundLabel;
  if (m.levelCode === "LEVEL1") return `มือใหม่|${EVENT_TH[m.eventType ?? ""]}|${round}`;
  if (m.phase === "GROUP_STAGE") return `${L(m.levelCode)}|${m.roundLabel}`;
  return `${L(m.levelCode)}|${BRACKET_TH[m.bracket] ?? ""}|${round}`;
}

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(srcPath);
  const ws = wb.worksheets.find((w) => w.name === "ผังคอร์ต");
  if (!ws) throw new Error('ไม่พบชีต "ผังคอร์ต" ในไฟล์ต้นทาง');
  const cells = readGrid(ws);

  if (cells.length !== seed.matches.length) {
    throw new Error(`ผังคอร์ตมี ${cells.length} นัด แต่ตารางตั้งต้นมี ${seed.matches.length} นัด`);
  }
  for (let i = 1; i <= cells.length; i += 1) {
    if (!cells.some((c) => c.no === i)) throw new Error(`ผังคอร์ตไม่มีนัดที่ ${i}`);
  }

  const gb = new Map<string, GridCell[]>();
  for (const g of cells) {
    const k = gridBucket(g);
    if (!gb.has(k)) gb.set(k, []);
    gb.get(k)!.push(g);
  }
  const sb = new Map<string, SeedMatch[]>();
  for (const m of seed.matches) {
    const k = seedBucket(m);
    if (!sb.has(k)) sb.set(k, []);
    sb.get(k)!.push(m);
  }
  for (const [k, v] of gb) {
    const w = sb.get(k);
    if (!w) throw new Error(`ผังคอร์ตมีกลุ่ม "${k}" ที่ไม่มีในตารางตั้งต้น`);
    if (w.length !== v.length) throw new Error(`กลุ่ม "${k}" จำนวนไม่ตรง: ผัง ${v.length} เดิม ${w.length}`);
  }
  for (const k of sb.keys()) if (!gb.has(k)) throw new Error(`ตารางตั้งต้นมีกลุ่ม "${k}" ที่หายไปจากผังคอร์ต`);

  /** เลขนัดเดิม → ช่องในผังคอร์ต */
  const placed = new Map<string, GridCell>();
  for (const [k, v] of gb) {
    const w = [...sb.get(k)!].sort((a, b) => a.matchNo - b.matchNo);
    [...v].sort((a, b) => a.no - b.no).forEach((g, i) => placed.set(w[i].matchUid, g));
  }

  const before = seed.matches.map((m) => ({ ...m }));
  for (const m of seed.matches) {
    const g = placed.get(m.matchUid)!;
    m.matchNo = g.no;
    m.dayNo = g.day;
    m.startTime = g.start;
    m.endTime = g.end;
    m.courtNo = g.court;
  }
  seed.matches.sort((a, b) => a.matchNo - b.matchNo);

  // คู่สีเก็บ วัน/เวลา/คอร์ต ของตัวเองไว้ต่างหาก ต้องอัปเดตตามลูกให้ครบ
  const byNo = new Map(seed.matches.map((m) => [m.matchNo, m]));
  for (const t of seed.ties) {
    const kids = seed.matches.filter((m) => m.tieId === t.tieId).sort((a, b) => a.matchNo - b.matchNo);
    t.matchNos = kids.map((m) => m.matchNo);
    t.dayNo = kids[0].dayNo;
    t.startTime = kids.reduce((a, b) => (a.startTime < b.startTime ? a : b)).startTime;
    t.courts = [...new Set(kids.map((m) => m.courtNo))].sort((a, b) => a - b).join(",");
  }

  // ───────── ตรวจก่อนเขียน ─────────
  const problems: string[] = [];
  const slotKey = (m: SeedMatch) => m.dayNo * 10000 + Number(m.startTime.replace(":", ""));
  const bySlot = new Map<number, SeedMatch[]>();
  for (const m of seed.matches) {
    const k = slotKey(m);
    if (!bySlot.has(k)) bySlot.set(k, []);
    bySlot.get(k)!.push(m);
  }
  for (const [, ms] of bySlot) {
    const seen = new Set<number>();
    for (const m of ms) {
      if (seen.has(m.courtNo)) problems.push(`วันที่ ${m.dayNo} ${m.startTime} คอร์ต ${m.courtNo} มี 2 นัดซ้อน`);
      seen.add(m.courtNo);
    }
    const ev = new Set(ms.filter((m) => m.levelCode === "LEVEL1").map((m) => m.eventType));
    if (ev.has("XD") && ev.size > 1) problems.push(`วันที่ ${ms[0].dayNo} ${ms[0].startTime} คู่ผสมลงพร้อมชายคู่/หญิงคู่`);
    if (ms.filter((m) => m.levelCode === "LEVEL4").length > 1) {
      problems.push(`วันที่ ${ms[0].dayNo} ${ms[0].startTime} มือทั่วไปลงพร้อมกันเกิน 1 คอร์ต`);
    }
  }
  const at = new Map(seed.matches.map((m) => [m.sourceMatchCode, slotKey(m)]));
  for (const m of seed.matches) {
    for (const src of [m.sideASource, m.sideBSource]) {
      if (!src.startsWith("WINNER:") && !src.startsWith("LOSER:")) continue;
      const ref = src.slice(src.indexOf(":") + 1);
      if (at.has(ref) && at.get(ref)! >= slotKey(m)) {
        problems.push(`นัดที่ ${m.matchNo} แข่งก่อนหรือพร้อมนัดที่ต้องรอผล (${ref})`);
      }
    }
  }
  if (problems.length > 0) {
    console.error("ผังคอร์ตมีปัญหา ไม่เขียนไฟล์:\n" + problems.map((p) => "  - " + p).join("\n"));
    process.exit(1);
  }

  const moved = seed.matches.filter((m) => {
    const b = before.find((x) => x.matchUid === m.matchUid)!;
    return b.matchNo !== m.matchNo || b.dayNo !== m.dayNo || b.startTime !== m.startTime || b.courtNo !== m.courtNo;
  }).length;

  console.log(`อ่านผังคอร์ต: ${cells.length} นัด · ย้าย/เปลี่ยนเลข ${moved} นัด`);
  console.log(`รหัสตารางเดิม: ${scheduleFingerprint(before)}`);
  console.log(`รหัสตารางใหม่: ${scheduleFingerprint(seed.matches)}`);
  for (const d of [...new Set(seed.matches.map((m) => m.dayNo))].sort()) {
    const inDay = seed.matches.filter((m) => m.dayNo === d);
    const first = inDay.reduce((a, b) => (a.startTime < b.startTime ? a : b)).startTime;
    const last = inDay.reduce((a, b) => (a.endTime > b.endTime ? a : b)).endTime;
    console.log(`  วันที่ ${d}: ${inDay.length} นัด · ${first}–${last} · ${new Set(inDay.map((m) => m.courtNo)).size} คอร์ต`);
  }

  if (dryRun) {
    console.log("\n--dry-run: ไม่ได้เขียนไฟล์");
    return;
  }
  if (!existsSync(backupPath)) copyFileSync(seedPath, backupPath);
  writeFileSync(seedPath, JSON.stringify(seed, null, 2) + "\n", "utf8");
  console.log(`\nเขียน ${path.relative(process.cwd(), seedPath)} แล้ว`);
  console.log("ขั้นต่อไป: deploy แล้วเข้าหน้าผู้ดูแล → ตั้งค่า → กดนำเข้าตาราง");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
