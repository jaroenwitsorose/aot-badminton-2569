/**
 * ตรวจความถูกต้องของตารางแข่งใน data/seed-data.json
 *
 *   npm run verify:schedule
 *
 * ตารางแข่งเป็นข้อมูลที่ผิดแล้วเสียหายที่สุด เพราะถ้าคอร์ตชนกันหรือคนต้องลงสองคอร์ต
 * พร้อมกัน จะไปรู้ตัวเอาหน้างานตอนที่แก้อะไรไม่ทันแล้ว จึงตรวจทุกข้อด้วยเครื่อง
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const seed = JSON.parse(
  readFileSync(path.join(here, "..", "data", "seed-data.json"), "utf-8"),
) as {
  matches: {
    matchNo: number;
    matchUid: string;
    sourceMatchCode: string;
    dayNo: number;
    startTime: string;
    endTime: string;
    courtNo: number;
    levelCode: string;
    eventType: string | null;
    groupKey: string | null;
    tieId: string | null;
    tieOrderNo: number | null;
    sideASource: string;
    sideBSource: string;
  }[];
  ties: { tieId: string; tieNo: number; phase: string; matchNos: number[] }[];
};

const M = seed.matches;
const byNo = new Map(M.map((m) => [m.matchNo, m]));
const byCode = new Map(M.map((m) => [m.sourceMatchCode, m]));
const tieById = new Map(seed.ties.map((t) => [t.tieId, t]));

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${ok || !detail ? "" : ` — ${detail}`}`);
  if (!ok) failures += 1;
}

const slotKey = (m: { dayNo: number; startTime: string }) => `${m.dayNo}|${m.startTime}`;
const slots = [...new Set(M.map(slotKey))].sort((a, b) => {
  const [d1, t1] = a.split("|");
  const [d2, t2] = b.split("|");
  return Number(d1) - Number(d2) || t1.localeCompare(t2);
});
const slotIndex = new Map(slots.map((s, i) => [s, i]));
const idx = (m: { dayNo: number; startTime: string }) => slotIndex.get(slotKey(m))!;

console.log("\nตรวจตารางแข่งขัน");
console.log("─".repeat(72));

// ───────── ความครบถ้วน ─────────
check("มีครบ 158 แมตช์", M.length === 158, `ได้ ${M.length}`);
check("เลขแมตช์ไม่ซ้ำและครบ 1..158", new Set(M.map((m) => m.matchNo)).size === M.length);
check("รหัสแมตช์ (matchUid) ไม่ซ้ำ", new Set(M.map((m) => m.matchUid)).size === M.length);
check("รหัสสาย (sourceMatchCode) ไม่ซ้ำ", new Set(M.map((m) => m.sourceMatchCode)).size === M.length);
check(
  "เลขแมตช์เรียงตามเวลาจริง",
  M.every((m, i) => i === 0 || idx(M[i - 1]) <= idx(m)),
);

// ───────── คอร์ตชนกัน ─────────
const courtClash: string[] = [];
const seen = new Map<string, number>();
for (const m of M) {
  const k = `${slotKey(m)}|${m.courtNo}`;
  if (seen.has(k)) courtClash.push(`${k} (#${seen.get(k)} กับ #${m.matchNo})`);
  else seen.set(k, m.matchNo);
}
check("ไม่มีสองแมตช์ลงคอร์ตเดียวกันในเวลาเดียวกัน", courtClash.length === 0, courtClash.slice(0, 3).join(" · "));
check("ใช้คอร์ต 1-5 เท่านั้น", M.every((m) => m.courtNo >= 1 && m.courtNo <= 5));

// ───────── คู่เดียวกันลงสองคอร์ตพร้อมกัน ─────────
const tokenClash: string[] = [];
const tokenSeen = new Map<string, number>();
for (const m of M) {
  for (const src of [m.sideASource, m.sideBSource]) {
    if (!src.startsWith("SEED:") && !src.startsWith("GROUP:") && !src.startsWith("LINEUP:")) continue;
    const k = `${slotKey(m)}|${src}`;
    if (tokenSeen.has(k)) tokenClash.push(`${src} @ ${slotKey(m)}`);
    else tokenSeen.set(k, m.matchNo);
  }
}
check("ไม่มีคู่ไหนต้องลงสองคอร์ตพร้อมกัน", tokenClash.length === 0, tokenClash.slice(0, 3).join(" · "));

// ───────── ข้อ 1: คู่ผสมมือใหม่ต้องไม่ชนกับชายคู่/หญิงคู่ ─────────
const l1BySlot = new Map<string, Set<string>>();
for (const m of M) {
  if (m.levelCode !== "LEVEL1" || !m.eventType) continue;
  if (!l1BySlot.has(slotKey(m))) l1BySlot.set(slotKey(m), new Set());
  l1BySlot.get(slotKey(m))!.add(m.eventType);
}
const xdClash = [...l1BySlot.entries()].filter(([, ev]) => ev.has("XD") && ev.size > 1);
check(
  "มือใหม่: คู่ผสมไม่แข่งพร้อมกับชายคู่/หญิงคู่",
  xdClash.length === 0,
  xdClash.map(([k, ev]) => `${k}: ${[...ev].join("+")}`).slice(0, 3).join(" · "),
);
check(
  `มือใหม่ใช้ ${l1BySlot.size} ช่วงเวลา (เดิม 16 ช่วงที่ชนกันหมด)`,
  l1BySlot.size >= 16,
  `ได้ ${l1BySlot.size}`,
);

// ───────── ข้อ 2: มือทั่วไป ─────────
const l4SlotOwner = new Map<string, string>();
const l4Overlap: string[] = [];
for (const m of M) {
  if (!m.tieId) continue;
  const prev = l4SlotOwner.get(slotKey(m));
  if (prev && prev !== m.tieId) {
    // อนุญาตเฉพาะสองคู่สีของรอบพบกันหมดรอบเดียวกัน (สีไม่ซ้ำกัน)
    const a = tieById.get(prev)!;
    const b = tieById.get(m.tieId)!;
    const sameRound =
      a.phase === "ROUND_ROBIN" && b.phase === "ROUND_ROBIN" && Math.ceil(a.tieNo / 2) === Math.ceil(b.tieNo / 2);
    if (!sameRound) l4Overlap.push(`${prev} + ${m.tieId} @ ${slotKey(m)}`);
  }
  l4SlotOwner.set(slotKey(m), m.tieId);
}
check("มือทั่วไป: ไม่มีคู่สีที่ใช้สีซ้ำกันแข่งพร้อมกัน", l4Overlap.length === 0, l4Overlap.slice(0, 3).join(" · "));

for (const tie of seed.ties) {
  const ms = tie.matchNos.map((n) => byNo.get(n)!);
  const uniqueSlots = new Set(ms.map(slotKey));
  const sameDay = new Set(ms.map((m) => m.dayNo)).size === 1;
  if (tie.phase === "ROUND_ROBIN") {
    check(
      `${tie.tieId} รอบพบกันหมด: 3 แมตช์อยู่คนละช่วงเวลา ในวันเดียวกัน`,
      uniqueSlots.size === 3 && sameDay,
      `${uniqueSlots.size} ช่วง · ${[...uniqueSlots].join(" ")}`,
    );
  } else {
    check(
      `${tie.tieId} Page Playoff: 3 แมตช์พร้อมกัน 3 คอร์ต (คงรูปแบบเดิม)`,
      uniqueSlots.size === 1 && new Set(ms.map((m) => m.courtNo)).size === 3,
      [...uniqueSlots].join(" "),
    );
  }
}

// ───────── ลำดับตามสาย + เวลาพัก ─────────
const LEVEL_OF: Record<string, string> = { L1: "LEVEL1", L2: "LEVEL2", L3: "LEVEL3", L4: "LEVEL4" };
function predsOf(m: (typeof M)[number]): Set<number> {
  const out = new Set<number>();
  for (const src of [m.sideASource, m.sideBSource]) {
    const p = src.split(":");
    if (p[0] === "WINNER" || p[0] === "LOSER") {
      const prev = byCode.get(src.slice(p[0].length + 1));
      if (prev) out.add(prev.matchNo);
    } else if (p[0] === "GROUP_RANK") {
      for (const x of M) if (x.levelCode === LEVEL_OF[p[1]] && x.groupKey === p[2]) out.add(x.matchNo);
    } else if (p[0] === "LINEUP") {
      const ts = p[3];
      if (/^RANK[1-4]$/.test(ts)) {
        for (const t of seed.ties) if (t.phase === "ROUND_ROBIN") t.matchNos.forEach((n) => out.add(n));
      } else if (/^(WINNER|LOSER)_T\d+$/.test(ts)) {
        tieById.get(`L4-${ts.split("_")[1]}`)?.matchNos.forEach((n) => out.add(n));
      }
    }
  }
  out.delete(m.matchNo);
  return out;
}

const orderViolations: string[] = [];
const restViolations: string[] = [];
for (const m of M) {
  for (const p of predsOf(m)) {
    const prev = byNo.get(p)!;
    const gap = idx(m) - idx(prev);
    if (gap <= 0) orderViolations.push(`#${m.matchNo} ต้องอยู่หลัง #${p}`);
    else if (gap < 2) restViolations.push(`#${p} → #${m.matchNo} ห่างแค่ ${gap} ช่วง`);
  }
}
check("ทุกแมตช์อยู่หลังแมตช์ที่ผลต่อกัน", orderViolations.length === 0, orderViolations.slice(0, 3).join(" · "));
check("มีเวลาพักอย่างน้อย 1 ช่วง (30 นาที) ก่อนลงรอบถัดไป", restViolations.length === 0, restViolations.slice(0, 3).join(" · "));

// ───────── กรอบเวลา ─────────
const days = [...new Set(M.map((m) => m.dayNo))].sort();
console.log("");
for (const d of days) {
  const inDay = M.filter((m) => m.dayNo === d);
  const times = [...new Set(inDay.map((m) => m.startTime))].sort();
  const last = inDay.reduce((a, b) => (a.endTime > b.endTime ? a : b));
  console.log(
    `  วันที่ ${d}: ${inDay.length} แมตช์ · ${times[0]}–${last.endTime} · ใช้ ${times.length} ช่วงเวลา`,
  );
}
check("แข่ง 3 วันเท่าเดิม", days.length === 3);
check(
  "ไม่มีวันไหนเลิกเกิน 16:30",
  M.every((m) => m.endTime <= "16:30"),
  M.filter((m) => m.endTime > "16:30").map((m) => `#${m.matchNo} ${m.endTime}`).slice(0, 3).join(" · "),
);

console.log("\n" + "─".repeat(72));
if (failures === 0) console.log("ตารางผ่านการตรวจทั้งหมด ✓\n");
else {
  console.log(`ไม่ผ่าน ${failures} ข้อ\n`);
  process.exitCode = 1;
}
