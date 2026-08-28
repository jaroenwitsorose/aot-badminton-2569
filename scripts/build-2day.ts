/**
 * สร้าง "ตารางแข่งแบบ 2 วัน" จากตาราง 3 วัน เพื่อใช้เปรียบเทียบตอนตัดสินใจ
 *
 *   npx tsx scripts/build-2day.ts          เขียน data/seed-data-2day.json
 *   npx tsx scripts/build-2day.ts --check  ดูผลอย่างเดียว
 *
 * รูปแบบ 2 วันตัดออก 2 อย่างจากรูปแบบ 3 วัน (ตามข้อเสนอในเอกสารเปรียบเทียบ)
 *   - มือ D และมือ C: ตัดสายล่างทิ้ง เหลือเฉพาะสายบน (ลดระดับละ 8 นัด)
 *   - มือทั่วไป: จบที่รอบพบกันหมด ไม่มี Page Playoff (ลด 12 นัด)
 * 158 - 28 = 130 นัด · มือใหม่ไม่เปลี่ยนเลย
 *
 * ข้อกำหนดการจัดตารางใช้ชุดเดียวกับแบบ 3 วันทุกข้อ (คู่ผสมไม่ชนกับชายคู่/หญิงคู่ ·
 * คู่สีมือทั่วไปลงทีละคู่ · พักอย่างน้อย 30 นาทีก่อนลงรอบถัดไป)
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { scheduleFingerprint } from "../src/lib/schedule-fingerprint";

const here = path.dirname(fileURLToPath(import.meta.url));
const CHECK_ONLY = process.argv.includes("--check");
const REST_SLOTS = 2;
const COURTS = 5;

/** กรอบเวลาที่ตั้งไว้สำหรับแบบ 2 วัน — กว้างกว่าแบบ 3 วันเพราะต้องอัด 130 นัดลง 2 วัน */
const DAY_GRID: Record<number, string[]> = {
  1: ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30"],
  2: ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "13:30", "14:00", "14:30", "15:00", "15:30", "16:00", "16:30"],
};

interface Match {
  matchNo: number; matchUid: string; sourceMatchCode: string;
  dayNo: number; startTime: string; endTime: string; courtNo: number;
  levelCode: string; eventType: string | null; phase: string; bracket: string;
  roundLabel: string; groupKey: string | null; tieId: string | null; tieOrderNo: number | null;
  sideASource: string; sideBSource: string;
}
interface Tie {
  tieId: string; tieNo: number; phase: string; stage: string;
  dayNo: number; startTime: string; courts: string;
  teamASource: string; teamBSource: string; matchNos: number[];
  requiredMatchWins: number; playAllThree: boolean;
}
interface Seed { matches: Match[]; ties: Tie[]; [k: string]: unknown }

const seed = JSON.parse(readFileSync(path.join(here, "..", "data", "seed-data.json"), "utf-8")) as Seed;

// ───────── ตัดสายล่าง + Page Playoff ─────────
const matches = seed.matches.filter((m) => m.bracket !== "LOWER" && m.phase !== "PAGE_PLAYOFF");
const ties = seed.ties.filter((t) => t.phase === "ROUND_ROBIN");
const keptUids = new Set(matches.map((m) => m.matchUid));
const byNo = new Map(matches.map((m) => [m.matchNo, m]));
const byCode = new Map(matches.map((m) => [m.sourceMatchCode, m]));
const tieById = new Map(ties.map((t) => [t.tieId, t]));

// ───────── กริดช่วงเวลา ─────────
interface Slot { index: number; dayNo: number; startTime: string; endTime: string }
const slots: Slot[] = [];
for (const day of Object.keys(DAY_GRID).map(Number).sort()) {
  for (const t of DAY_GRID[day]) {
    const [h, m] = t.split(":").map(Number);
    const end = new Date(0, 0, 0, h, m + 30);
    slots.push({
      index: slots.length,
      dayNo: day,
      startTime: t,
      endTime: `${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`,
    });
  }
}

// ───────── ความสัมพันธ์ระหว่างแมตช์ ─────────
const LEVEL_OF: Record<string, string> = { L1: "LEVEL1", L2: "LEVEL2", L3: "LEVEL3", L4: "LEVEL4" };
function predecessorsOf(m: Match): Set<number> {
  const out = new Set<number>();
  for (const src of [m.sideASource, m.sideBSource]) {
    const p = src.split(":");
    if (p[0] === "WINNER" || p[0] === "LOSER") {
      const prev = byCode.get(src.slice(p[0].length + 1));
      if (prev) out.add(prev.matchNo);
    } else if (p[0] === "GROUP_RANK") {
      for (const x of matches) {
        if (x.levelCode === LEVEL_OF[p[1]] && x.groupKey === p[2]) out.add(x.matchNo);
      }
    }
    // LINEUP ของรอบพบกันหมดผูกกับสีตายตัวอยู่แล้ว จึงไม่มีเงื่อนไขว่าต้องรอผลอะไร
  }
  out.delete(m.matchNo);
  return out;
}
const preds = new Map(matches.map((m) => [m.matchNo, predecessorsOf(m)]));

// ───────── หน่วยที่ต้องวาง ─────────
interface Unit { id: string; groups: number[][]; tier: 0 | 1; order: number; isL4: boolean }
const units: Unit[] = [];
const claimed = new Set<number>();

const rrTies = [...ties].sort((a, b) => a.tieNo - b.tieNo);
for (let i = 0; i < rrTies.length; i += 2) {
  const pair = [rrTies[i], rrTies[i + 1]].filter(Boolean);
  const groups = [0, 1, 2].map((k) =>
    pair.map((t) => t.matchNos[k]).filter((n): n is number => n !== undefined && keptUids.has(byNo.get(n)!.matchUid)),
  );
  units.push({ id: `RR:รอบ${i / 2 + 1}`, groups, tier: 0, order: i / 2 + 1, isL4: true });
  groups.flat().forEach((n) => claimed.add(n));
}
for (const m of matches) {
  if (claimed.has(m.matchNo)) continue;
  units.push({ id: `M:${m.matchNo}`, groups: [[m.matchNo]], tier: 1, order: m.matchNo, isL4: false });
}
const unitById = new Map(units.map((u) => [u.id, u]));
const unitOfMatch = new Map<number, string>();
for (const u of units) for (const n of u.groups.flat()) unitOfMatch.set(n, u.id);

// ───────── วางลงตาราง ─────────
const placed = new Map<string, { startSlot: number; courtsPerGroup: number[][] }>();
const usage = slots.map(() => ({
  courtsUsed: new Set<number>(),
  tokens: new Set<string>(),
  l1Events: new Set<string>(),
  hasL4: false,
}));

const fixedTokens = (m: Match) =>
  [m.sideASource, m.sideBSource].filter((s) => s.startsWith("SEED:") || s.startsWith("GROUP:") || s.startsWith("LINEUP:"));

function slotOfMatch(n: number): number | null {
  const id = unitOfMatch.get(n)!;
  const p = placed.get(id);
  if (!p) return null;
  return p.startSlot + unitById.get(id)!.groups.findIndex((g) => g.includes(n));
}

function canPlace(u: Unit, startSlot: number): boolean {
  if (startSlot + u.groups.length > slots.length) return false;
  if (slots[startSlot].dayNo !== slots[startSlot + u.groups.length - 1].dayNo) return false;

  for (let gi = 0; gi < u.groups.length; gi += 1) {
    const si = startSlot + gi;
    const group = u.groups[gi];
    const use = usage[si];
    if (use.courtsUsed.size + group.length > COURTS) return false;
    if (u.isL4 && use.hasL4) return false;

    const seen = new Set<string>();
    const l1 = new Set(use.l1Events);
    for (const n of group) {
      const m = byNo.get(n)!;
      for (const p of preds.get(n)!) {
        const ps = slotOfMatch(p);
        if (ps === null || ps + REST_SLOTS > si) return false;
      }
      for (const t of fixedTokens(m)) {
        if (use.tokens.has(t) || seen.has(t)) return false;
        seen.add(t);
      }
      if (m.levelCode === "LEVEL1" && m.eventType) l1.add(m.eventType);
    }
    if (l1.has("XD") && l1.size > 1) return false;
  }
  return true;
}

function place(u: Unit, startSlot: number): void {
  const courtsPerGroup: number[][] = [];
  u.groups.forEach((group, gi) => {
    const use = usage[startSlot + gi];
    const courts: number[] = [];
    for (let c = 1; c <= COURTS && courts.length < group.length; c += 1) {
      if (!use.courtsUsed.has(c)) courts.push(c);
    }
    courts.forEach((c) => use.courtsUsed.add(c));
    for (const n of group) {
      const m = byNo.get(n)!;
      fixedTokens(m).forEach((t) => use.tokens.add(t));
      if (m.levelCode === "LEVEL1" && m.eventType) use.l1Events.add(m.eventType);
    }
    if (u.isL4) use.hasL4 = true;
    courtsPerGroup.push(courts);
  });
  placed.set(u.id, { startSlot, courtsPerGroup });
}

// วางแบบเร็วที่สุดเท่าที่กติกาอนุญาต — 2 วันไม่มีที่ว่างให้เผื่อเหมือนแบบ 3 วัน
const failed: Unit[] = [];
for (const u of [...units].sort((a, b) => a.tier - b.tier || a.order - b.order)) {
  let done = false;
  for (let s = 0; s < slots.length; s += 1) {
    if (canPlace(u, s)) {
      place(u, s);
      done = true;
      break;
    }
  }
  if (!done) failed.push(u);
}
if (failed.length > 0) {
  console.error(`\nวางไม่ได้ ${failed.length} รายการ: ${failed.map((u) => u.id).join(", ")}\n`);
  process.exit(1);
}

// ───────── เขียนผล ─────────
for (const u of units) {
  const p = placed.get(u.id)!;
  u.groups.forEach((group, gi) => {
    const slot = slots[p.startSlot + gi];
    group.forEach((n, ci) => {
      const m = byNo.get(n)!;
      m.dayNo = slot.dayNo;
      m.startTime = slot.startTime;
      m.endTime = slot.endTime;
      m.courtNo = p.courtsPerGroup[gi][ci];
    });
  });
}
for (const tie of ties) {
  const ms = tie.matchNos.map((n) => byNo.get(n)!).filter(Boolean);
  const first = ms.reduce((a, b) => (a.dayNo < b.dayNo || (a.dayNo === b.dayNo && a.startTime <= b.startTime) ? a : b));
  tie.dayNo = first.dayNo;
  tie.startTime = first.startTime;
  tie.courts = [...new Set(ms.map((m) => m.courtNo))].sort((a, b) => a - b).join(",");
}
const chrono = [...matches].sort(
  (a, b) => a.dayNo - b.dayNo || a.startTime.localeCompare(b.startTime) || a.courtNo - b.courtNo,
);
const newNo = new Map<number, number>();
chrono.forEach((m, i) => newNo.set(m.matchNo, i + 1));
for (const m of matches) m.matchNo = newNo.get(m.matchNo)!;
for (const t of ties) t.matchNos = t.matchNos.map((n) => newNo.get(n)!).filter(Boolean).sort((a, b) => a - b);
matches.sort((a, b) => a.matchNo - b.matchNo);

// ───────── รายงาน ─────────
const LV: Record<string, string> = { LEVEL1: "มือใหม่", LEVEL2: "มือ D", LEVEL3: "มือ C", LEVEL4: "มือทั่วไป" };
console.log("\nรูปแบบ 2 วัน");
console.log("─".repeat(70));
console.log(`รวม ${matches.length} นัด · ` + ["LEVEL1", "LEVEL2", "LEVEL3", "LEVEL4"].map((l) => `${LV[l]} ${matches.filter((m) => m.levelCode === l).length}`).join(" · "));
console.log(`รหัสตาราง: ${scheduleFingerprint(matches)}\n`);

for (const day of [1, 2]) {
  const inDay = matches.filter((m) => m.dayNo === day);
  const times = [...new Set(inDay.map((m) => m.startTime))].sort();
  const last = inDay.reduce((a, b) => (a.endTime > b.endTime ? a : b)).endTime;
  console.log(`วันที่ ${day}: ${inDay.length} นัด · ${times[0]}–${last} · ${times.length} ช่วง · คอร์ต ${[...new Set(inDay.map((m) => m.courtNo))].sort().join(",")}`);
  for (const lv of ["LEVEL1", "LEVEL2", "LEVEL3", "LEVEL4"]) {
    const rounds = new Map<string, number>();
    for (const m of inDay) {
      if (m.levelCode !== lv) continue;
      const r = m.roundLabel.includes("กลุ่ม") ? "รอบแบ่งกลุ่ม" : m.roundLabel.split("(")[0].trim();
      rounds.set(r, (rounds.get(r) ?? 0) + 1);
    }
    if (rounds.size > 0) {
      console.log(`   ${LV[lv].padEnd(10)} ` + [...rounds].map(([k, v]) => `${k} ${v}`).join(" · "));
    }
  }
  const holes = times.map((t) => ({ t, n: inDay.filter((m) => m.startTime === t).length })).filter((x) => x.n < COURTS);
  console.log(`   ช่องที่ไม่เต็ม: ${holes.length === 0 ? "ไม่มี" : holes.map((h) => `${h.t}(${h.n}/5)`).join(" ")}\n`);
}

if (CHECK_ONLY) {
  console.log("--check : ไม่เขียนไฟล์\n");
} else {
  const out = { ...seed, matches, ties };
  const file = path.join(here, "..", "data", "seed-data-2day.json");
  writeFileSync(file, JSON.stringify(out, null, 2) + "\n", "utf-8");
  console.log(`เขียน ${path.relative(process.cwd(), file)} แล้ว\n`);
}
