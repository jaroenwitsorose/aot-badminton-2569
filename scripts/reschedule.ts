/**
 * จัดตารางแข่งใหม่ตามข้อกำหนดที่ตกลงกันไว้ แล้วเขียนกลับลง data/seed-data.json
 *
 *   npx tsx scripts/reschedule.ts --check    ดูผลอย่างเดียว ไม่เขียนไฟล์
 *   npx tsx scripts/reschedule.ts            เขียนไฟล์จริง
 *
 * ทำไมต้องจัดใหม่ (ปัญหาของตารางเดิม):
 *   1. มือใหม่ ชายคู่ / หญิงคู่ / คู่ผสม ลงพร้อมกันครบทั้ง 16 ช่วงเวลา
 *      คนหนึ่งลงได้ทั้งชายคู่และคู่ผสม จึงมีโอกาสต้องลงสองคอร์ตพร้อมกัน
 *   2. มือทั่วไป รอบพบกันหมด ยัด 3 แมตช์ของคู่สีเดียวกันลงเวลาเดียวกัน
 *      แต่ละสีมีแค่ 3 คู่ = ต้องมี 6 คนพอดี ถ้าคนไม่พอจะมีคนอยู่สองคู่แล้วแข่งไม่ได้
 *
 * ข้อกำหนดที่ใช้จัด (ยืนยันกับเจ้าของงานแล้ว):
 *   - คนหนึ่งลงได้ไม่เกิน 1 คู่ต่อประเภท → ชายคู่กับหญิงคู่ลงพร้อมกันได้
 *     และสองแมตช์ของประเภทเดียวกันก็ลงพร้อมกันได้ ห้ามเฉพาะคู่ผสมชนกับอีกสองประเภท
 *   - รอบพบกันหมดมือทั่วไป: สองคู่สีของรอบเดียวกันขนานกัน ไล่คู่ที่ 1→2→3 สามช่วงติดกัน
 *   - รอบ Page Playoff คงเดิม (3 คอร์ตพร้อมกัน)
 *   - มือใหม่กับมือทั่วไปแข่งเวลาเดียวกันได้ (ตารางเดิมกันไว้ ทำให้ไม่มีที่ว่างพอ)
 *   - ห้ามขยายวัน/เวลา ต้องอยู่ในกริด 38 ช่วงเวลาเดิม
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const SEED_PATH = path.join(here, "..", "data", "seed-data.json");
const CHECK_ONLY = process.argv.includes("--check");

/** ระยะพักขั้นต่ำ (จำนวนช่วงเวลา) ระหว่างแมตช์ที่ผลต่อกัน — ตารางเดิมใช้ 2 */
const REST_SLOTS = 2;
const COURTS = 5;
const LEVEL_OF: Record<string, string> = { L1: "LEVEL1", L2: "LEVEL2", L3: "LEVEL3", L4: "LEVEL4" };

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
  tieNo: number;
  phase: string;
  stage: string;
  dayNo: number;
  startTime: string;
  courts: string;
  teamASource: string;
  teamBSource: string;
  matchNos: number[];
  requiredMatchWins: number;
  playAllThree: boolean;
}
interface Seed {
  matches: SeedMatch[];
  ties: SeedTie[];
  [k: string]: unknown;
}
interface Slot {
  index: number;
  dayNo: number;
  startTime: string;
  endTime: string;
}

/**
 * สิ่งที่ต้องวางลงตาราง
 * `groups` = แมตช์ที่ลงในแต่ละช่วงเวลาที่ยูนิตนี้กิน
 *   ยาว 1 ช่อง = วางช่วงเดียว · ยาว 3 ช่อง = ต้องได้สามช่วงติดกันในวันเดียวกัน
 */
interface Unit {
  id: string;
  groups: number[][];
  tier: 0 | 1;
  order: number;
  /** ช่วงเวลาที่อยากให้ลงใกล้ ๆ (ตำแหน่งเดิม) เพื่อรักษาจังหวะของงานไว้ */
  anchor: number;
  /** เป็นคู่สีมือทั่วไปหรือไม่ — คู่สีจองช่วงเวลาแบบผูกขาด */
  isL4: boolean;
}

const seed = JSON.parse(readFileSync(SEED_PATH, "utf-8")) as Seed;
const matches = seed.matches;
const byNo = new Map(matches.map((m) => [m.matchNo, m]));
const byCode = new Map(matches.map((m) => [m.sourceMatchCode, m]));
const tieById = new Map(seed.ties.map((t) => [t.tieId, t]));

// ───────────────────────── กริดช่วงเวลาเดิม ─────────────────────────
const slotSet = new Map<string, Slot>();
for (const m of matches) {
  const key = `${m.dayNo}|${m.startTime}`;
  if (!slotSet.has(key)) {
    slotSet.set(key, { index: 0, dayNo: m.dayNo, startTime: m.startTime, endTime: m.endTime });
  }
}
const slots = [...slotSet.values()].sort(
  (a, b) => a.dayNo - b.dayNo || a.startTime.localeCompare(b.startTime),
);
slots.forEach((s, i) => (s.index = i));
const slotsOfDay = new Map<number, Slot[]>();
for (const s of slots) {
  if (!slotsOfDay.has(s.dayNo)) slotsOfDay.set(s.dayNo, []);
  slotsOfDay.get(s.dayNo)!.push(s);
}
const originalSlot = new Map<number, number>();
{
  const lookup = new Map(slots.map((s) => [`${s.dayNo}|${s.startTime}`, s.index]));
  for (const m of matches) originalSlot.set(m.matchNo, lookup.get(`${m.dayNo}|${m.startTime}`)!);
}

// ───────────────────────── ความสัมพันธ์ระหว่างแมตช์ ─────────────────────────

/** แมตช์ที่ต้องแข่งจบก่อน แมตช์นี้ถึงจะรู้ว่าใครลง */
function predecessorsOf(m: SeedMatch): Set<number> {
  const out = new Set<number>();
  const addTie = (tieId: string) => {
    for (const n of tieById.get(tieId)?.matchNos ?? []) out.add(n);
  };
  const addGroup = (levelCode: string, groupKey: string) => {
    for (const x of matches) {
      if (x.levelCode === levelCode && x.groupKey === groupKey) out.add(x.matchNo);
    }
  };

  for (const src of [m.sideASource, m.sideBSource]) {
    const parts = src.split(":");
    if (parts[0] === "WINNER" || parts[0] === "LOSER") {
      const prev = byCode.get(src.slice(parts[0].length + 1));
      if (prev) out.add(prev.matchNo);
    } else if (parts[0] === "GROUP_RANK") {
      addGroup(LEVEL_OF[parts[1]], parts[2]);
    } else if (parts[0] === "LINEUP") {
      // LINEUP:L4:T07:RANK1:ORDER1 — สีที่จะลงขึ้นกับผลรอบก่อนหน้า
      const teamSource = parts[3];
      if (/^RANK[1-4]$/.test(teamSource)) {
        for (const t of seed.ties) if (t.phase === "ROUND_ROBIN") addTie(t.tieId);
      } else if (/^(WINNER|LOSER)_T\d+$/.test(teamSource)) {
        addTie(`L4-${teamSource.split("_")[1]}`);
      }
    }
  }
  out.delete(m.matchNo);
  return out;
}
const preds = new Map<number, Set<number>>(matches.map((m) => [m.matchNo, predecessorsOf(m)]));

// ───────────────────────── สร้าง unit ─────────────────────────
const units: Unit[] = [];
const claimed = new Set<number>();

// 1) มือทั่วไป รอบ Page Playoff — 3 แมตช์พร้อมกัน 3 คอร์ต (คงรูปแบบเดิม)
for (const tie of seed.ties) {
  if (tie.phase !== "PAGE_PLAYOFF") continue;
  units.push({
    id: `PO:${tie.tieId}`,
    groups: [[...tie.matchNos]],
    tier: 0,
    order: 1000 + tie.tieNo,
    anchor: originalSlot.get(tie.matchNos[0])!,
    isL4: true,
  });
  tie.matchNos.forEach((n) => claimed.add(n));
}

// 2) มือทั่วไป รอบพบกันหมด — สองคู่สีของรอบเดียวกันขนานกัน ไล่คู่ที่ 1→2→3 สามช่วงติดกัน
const rrTies = seed.ties.filter((t) => t.phase === "ROUND_ROBIN").sort((a, b) => a.tieNo - b.tieNo);
for (let i = 0; i < rrTies.length; i += 2) {
  const pairOfTies = [rrTies[i], rrTies[i + 1]].filter(Boolean);
  const roundNo = i / 2 + 1;
  const groups = [0, 1, 2].map((order) =>
    pairOfTies.map((t) => t.matchNos[order]).filter((n): n is number => n !== undefined),
  );
  units.push({
    id: `RR:รอบ${roundNo}`,
    groups,
    tier: 0,
    order: roundNo,
    anchor: originalSlot.get(groups[0][0])!,
    isL4: true,
  });
  groups.flat().forEach((n) => claimed.add(n));
}

// 3) ที่เหลือวางทีละแมตช์
for (const m of matches) {
  if (claimed.has(m.matchNo)) continue;
  units.push({
    id: `M:${m.matchNo}`,
    groups: [[m.matchNo]],
    tier: 1,
    order: m.matchNo,
    anchor: originalSlot.get(m.matchNo)!,
    isL4: false,
  });
}
const unitById = new Map(units.map((u) => [u.id, u]));
const unitOfMatch = new Map<number, string>();
for (const u of units) for (const n of u.groups.flat()) unitOfMatch.set(n, u.id);

// ───────────────────────── วางลงตาราง ─────────────────────────
const placed = new Map<string, { startSlot: number; courtsPerGroup: number[][] }>();
const usage = slots.map(() => ({
  courtsUsed: new Set<number>(),
  /** โทเคนที่มาแบบตายตัว — คู่เดียวกันห้ามลงสองคอร์ตพร้อมกัน */
  tokens: new Set<string>(),
  /** ประเภทของมือใหม่ที่ลงในช่วงนี้ */
  l1Events: new Set<string>(),
  hasL4: false,
}));

function fixedTokens(m: SeedMatch): string[] {
  return [m.sideASource, m.sideBSource].filter(
    (s) => s.startsWith("SEED:") || s.startsWith("GROUP:") || s.startsWith("LINEUP:"),
  );
}
function slotOfMatch(n: number): number | null {
  const id = unitOfMatch.get(n)!;
  const p = placed.get(id);
  if (!p) return null;
  return p.startSlot + unitById.get(id)!.groups.findIndex((g) => g.includes(n));
}

function canPlace(u: Unit, startSlot: number): boolean {
  if (startSlot + u.groups.length > slots.length) return false;
  // ทุกช่วงของยูนิตเดียวกันต้องอยู่วันเดียวกัน — คู่สีจะได้จบภายในวันเดียว
  if (slots[startSlot].dayNo !== slots[startSlot + u.groups.length - 1].dayNo) return false;

  for (let gi = 0; gi < u.groups.length; gi += 1) {
    const si = startSlot + gi;
    const group = u.groups[gi];
    const slotUse = usage[si];

    if (slotUse.courtsUsed.size + group.length > COURTS) return false;

    // คู่สีมือทั่วไปจองช่วงเวลาแบบผูกขาด — คู่สีต่างรอบกันมีสีซ้ำกันเสมอ
    // (เช่น ม่วง-เขียว กับ ม่วง-แดง) ถ้าปล่อยให้ทับกัน สีม่วงต้องลงสองคอร์ตพร้อมกัน
    if (u.isL4 && slotUse.hasL4) return false;

    const seen = new Set<string>();
    const l1Events = new Set(slotUse.l1Events);
    for (const n of group) {
      const m = byNo.get(n)!;

      // ต้องหลังแมตช์ที่ผลต่อกัน + พักอย่างน้อย REST_SLOTS ช่วง
      for (const p of preds.get(n)!) {
        const ps = slotOfMatch(p);
        if (ps === null || ps + REST_SLOTS > si) return false;
      }

      for (const t of fixedTokens(m)) {
        if (slotUse.tokens.has(t) || seen.has(t)) return false;
        seen.add(t);
      }
      if (m.levelCode === "LEVEL1" && m.eventType) l1Events.add(m.eventType);
    }

    // มือใหม่: คู่ผสมห้ามอยู่ช่วงเดียวกับชายคู่/หญิงคู่ เพราะคนหนึ่งลงข้ามประเภทได้
    // (ชายคู่กับหญิงคู่อยู่ด้วยกันได้ คนละเพศ · สองแมตช์ประเภทเดียวกันก็ได้ คนละคู่)
    if (l1Events.has("XD") && l1Events.size > 1) return false;
  }
  return true;
}

function place(u: Unit, startSlot: number): void {
  const courtsPerGroup: number[][] = [];
  u.groups.forEach((group, gi) => {
    const slotUse = usage[startSlot + gi];
    const courts: number[] = [];
    for (let c = 1; c <= COURTS && courts.length < group.length; c += 1) {
      if (!slotUse.courtsUsed.has(c)) courts.push(c);
    }
    courts.forEach((c) => slotUse.courtsUsed.add(c));
    for (const n of group) {
      const m = byNo.get(n)!;
      fixedTokens(m).forEach((t) => slotUse.tokens.add(t));
      if (m.levelCode === "LEVEL1" && m.eventType) slotUse.l1Events.add(m.eventType);
    }
    if (u.isL4) slotUse.hasL4 = true;
    courtsPerGroup.push(courts);
  });
  placed.set(u.id, { startSlot, courtsPerGroup });
}

/**
 * ลำดับช่วงเวลาที่จะลอง: เริ่มจากตำแหน่งเดิม แล้วขยายออกทีละก้าว ลองไปข้างหน้าก่อน
 *
 * เหตุผลที่ไม่ใช้ "ช่วงว่างแรกสุด": ตารางเดิมออกแบบจังหวะของงานไว้แล้ว
 * (รอบแรกเช้าวันแรก ชิงชนะเลิศบ่ายวันสุดท้าย) ถ้าอัดทุกอย่างไปข้างหน้าให้เร็วที่สุด
 * ชิงชนะเลิศจะไปจบตั้งแต่วันแรก แล้ววันสุดท้ายจะว่างเปล่า
 */
function searchOrder(anchor: number): number[] {
  const out: number[] = [];
  for (let d = 0; d < slots.length; d += 1) {
    if (anchor + d < slots.length) out.push(anchor + d);
    if (d > 0 && anchor - d >= 0) out.push(anchor - d);
  }
  return out;
}

const failed: Unit[] = [];
for (const u of [...units].sort((a, b) => a.tier - b.tier || a.order - b.order)) {
  const slot = searchOrder(u.anchor).find((s) => canPlace(u, s));
  if (slot === undefined) failed.push(u);
  else place(u, slot);
}

if (failed.length > 0) {
  console.error(`\n✗ วางไม่ได้ ${failed.length} รายการ: ${failed.map((u) => u.id).join(", ")}\n`);
  process.exit(1);
}

// ───────────────────────── เขียนผลลงข้อมูล ─────────────────────────
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

for (const tie of seed.ties) {
  const ms = tie.matchNos.map((n) => byNo.get(n)!);
  const first = ms.reduce((a, b) =>
    a.dayNo < b.dayNo || (a.dayNo === b.dayNo && a.startTime <= b.startTime) ? a : b,
  );
  tie.dayNo = first.dayNo;
  tie.startTime = first.startTime;
  tie.courts = [...new Set(ms.map((m) => m.courtNo))].sort((a, b) => a - b).join(",");
}

// เรียงเลขแมตช์ใหม่ให้ไล่ตามเวลา — เลขแมตช์คือสิ่งที่ผู้เล่นใช้ดูว่าใกล้ถึงคิวหรือยัง
// (matchUid / sourceMatchCode คงเดิม เพราะเป็นคีย์ถาวรที่ทุกอย่างอ้างถึง)
const chronological = [...matches].sort(
  (a, b) => a.dayNo - b.dayNo || a.startTime.localeCompare(b.startTime) || a.courtNo - b.courtNo,
);
const newNo = new Map<number, number>();
chronological.forEach((m, i) => newNo.set(m.matchNo, i + 1));
for (const m of matches) m.matchNo = newNo.get(m.matchNo)!;
for (const tie of seed.ties) tie.matchNos = tie.matchNos.map((n) => newNo.get(n)!).sort((a, b) => a - b);
seed.matches = matches.sort((a, b) => a.matchNo - b.matchNo);

// ───────────────────────── รายงาน ─────────────────────────
console.log("\nตารางใหม่");
console.log("─".repeat(74));
for (const day of [...slotsOfDay.keys()].sort()) {
  console.log(`\nวันที่ ${day}`);
  for (const slot of slotsOfDay.get(day)!) {
    const inSlot = matches
      .filter((m) => m.dayNo === slot.dayNo && m.startTime === slot.startTime)
      .sort((a, b) => a.courtNo - b.courtNo);
    const cells: string[] = [];
    for (let c = 1; c <= COURTS; c += 1) {
      const m = inSlot.find((x) => x.courtNo === c);
      if (!m) {
        cells.push("   —  ");
        continue;
      }
      const lv = m.levelCode.replace("LEVEL", "L");
      const tag = m.levelCode === "LEVEL1" ? `${lv}${m.eventType}` : m.tieId ? `${lv}·${m.tieId.slice(3)}` : lv;
      cells.push(tag.padEnd(6));
    }
    console.log(`  ${slot.startTime}  ${cells.join(" ")}  ${inSlot.length}/5`);
  }
}
console.log("\n" + "─".repeat(74));
console.log(`วางครบ ${matches.length} แมตช์ ในกริดเดิม ${slots.length} ช่วงเวลา ไม่ขยายวัน`);

if (CHECK_ONLY) {
  console.log("\n--check : ไม่เขียนไฟล์\n");
} else {
  writeFileSync(SEED_PATH, JSON.stringify(seed, null, 2) + "\n", "utf-8");
  console.log(`\nเขียน ${path.relative(process.cwd(), SEED_PATH)} แล้ว\n`);
}
