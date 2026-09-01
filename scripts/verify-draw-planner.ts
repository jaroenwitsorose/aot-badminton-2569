/**
 * ตรวจตัวสุ่มจับสลากว่าไม่สร้างปัญหาเดิมซ้ำ
 *
 *   npx tsx scripts/verify-draw-planner.ts
 *
 * เคสที่ต้องกันให้ได้ มาจากของจริงที่เคยเจอตอนตรวจตารางด้วยรายชื่อ:
 *   - คนเดียวกันถูกจับไปอยู่กลุ่มเดียวกัน จนต้องลงแข่งกับตัวเอง (นัดที่ 4)
 *   - คนเดียวกันถูกจับให้ลงสองคอร์ตพร้อมกัน (13 จุด)
 *
 * รันซ้ำหลายรอบด้วยเมล็ดสุ่มต่างกัน เพราะบั๊กแบบนี้โผล่เป็นบางครั้ง
 * ถ้าทดสอบรอบเดียวอาจผ่านโดยบังเอิญ
 */

import { planRandomDraw, type DrawPair, type DrawSlot } from "../src/lib/draw-planner";

/** ตัวสุ่มที่ให้ผลซ้ำได้ เพื่อให้เวลาเจอบั๊กแล้วย้อนกลับมาดูรอบเดิมได้ */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * จำลองรอบแบ่งกลุ่มแบบมือ D: 4 กลุ่ม กลุ่มละ 4 คู่
 * กลุ่มหนึ่งแข่ง 3 รอบ รอบละ 2 นัดพร้อมกัน — ทุกช่องในกลุ่มจึงใช้เวลาชุดเดียวกัน
 */
function buildGroupSlots(level: string, groups: string[], perGroup: number, dayNo: number): DrawSlot[] {
  const slots: DrawSlot[] = [];
  groups.forEach((g, gi) => {
    for (let i = 1; i <= perGroup; i += 1) {
      slots.push({
        token: `GROUP:${level}:${g}:SLOT${i}`,
        levelCode: { L2: "LEVEL2", L3: "LEVEL3" }[level] ?? "LEVEL2",
        // แต่ละกลุ่มลงคนละช่วง แต่ภายในกลุ่มเดียวกันลงพร้อมกัน
        times: [`${dayNo}|${String(9 + gi).padStart(2, "0")}:00`],
      });
    }
  });
  return slots;
}

function makePairs(count: number, levelCode: string, sharedPeople: Map<number, string[]>): DrawPair[] {
  const teams = ["PUR", "GRN", "RED", "BLU"];
  return Array.from({ length: count }, (_, i) => ({
    pairUid: `${levelCode}-P${i + 1}`,
    levelCode,
    eventType: i % 2 === 0 ? "WD" : "XD",
    teamCode: teams[i % 4],
    withdrawn: false,
    playerKeys: sharedPeople.get(i) ?? [`คน${levelCode}-${i}a`, `คน${levelCode}-${i}b`],
  }));
}

let failures = 0;
const say = (ok: boolean, text: string, detail = "") => {
  if (!ok) failures += 1;
  console.log(`  ${ok ? "✓" : "✗"} ${text}${detail ? ` — ${detail}` : ""}`);
};

console.log("ตรวจตัวสุ่มจับสลาก\n" + "─".repeat(64));

// ── เคส 1: คนหนึ่งอยู่ 4 คู่ (เหมือน สายไหม/พลอยพยับ ของจริง) ──
{
  const shared = new Map<number, string[]>();
  const หญิง = "สายไหมข้างเนียม";
  shared.set(0, [หญิง, "คู่หูก"]);
  shared.set(1, [หญิง, "คู่หูข"]);
  shared.set(2, [หญิง, "คู่หูค"]);
  shared.set(5, ["ณัฐวดีวัยเจริญ", "คู่หูง"]);
  shared.set(6, ["ณัฐวดีวัยเจริญ", "คู่หูจ"]);

  const slots = buildGroupSlots("L2", ["A", "B", "C", "D"], 4, 1);
  const pairs = makePairs(16, "LEVEL2", shared);

  let allOk = true;
  let sameGroup = 0;
  let sameTime = 0;
  for (let seed = 1; seed <= 200; seed += 1) {
    const res = planRandomDraw(slots, pairs, [], seeded(seed));
    if (!res.ok) {
      allOk = false;
      continue;
    }
    const slotByToken = new Map(slots.map((s) => [s.token, s]));
    const pairByUid = new Map(pairs.map((p) => [p.pairUid, p]));
    const groupOfPerson = new Map<string, Set<string>>();
    const timeOfPerson = new Map<string, Set<string>>();
    for (const item of res.plan) {
      const grp = item.token.split(":")[2];
      for (const person of pairByUid.get(item.pairUid)!.playerKeys) {
        if (!groupOfPerson.has(person)) groupOfPerson.set(person, new Set());
        if (groupOfPerson.get(person)!.has(grp)) sameGroup += 1;
        groupOfPerson.get(person)!.add(grp);

        if (!timeOfPerson.has(person)) timeOfPerson.set(person, new Set());
        for (const t of slotByToken.get(item.token)!.times) {
          if (timeOfPerson.get(person)!.has(t)) sameTime += 1;
          timeOfPerson.get(person)!.add(t);
        }
      }
    }
    if (res.plan.length !== slots.length) allOk = false;
  }
  console.log("\nเคส 1 — คนเดียวลงหลายคู่ในระดับเดียวกัน (สุ่ม 200 รอบ)");
  say(allOk, "จัดครบทุกช่องได้ทุกรอบ");
  say(sameGroup === 0, "ไม่มีใครถูกจับไปอยู่กลุ่มเดียวกันสองครั้ง", sameGroup ? `พบ ${sameGroup} ครั้ง` : "");
  say(sameTime === 0, "ไม่มีใครถูกจับให้ลงสองคอร์ตพร้อมกัน", sameTime ? `พบ ${sameTime} ครั้ง` : "");
}

// ── เคส 2: ช่องที่จับไว้แล้วต้องถูกนับเป็นข้อจำกัดด้วย ──
{
  const shared = new Map<number, string[]>([
    [0, ["คนข้ามระดับ", "ก"]],
    [1, ["คนข้ามระดับ", "ข"]],
  ]);
  const slots = buildGroupSlots("L2", ["A", "B"], 4, 1);
  const pairs = makePairs(8, "LEVEL2", shared);

  // ตรึงคู่แรกไว้ที่กลุ่ม A แล้วดูว่าตัวสุ่มยอมเอาคู่ที่สองมาลงกลุ่ม A อีกไหม
  const fixed = [{ token: "GROUP:L2:A:SLOT1", pairUid: "LEVEL2-P1" }];
  const rest = slots.filter((s) => s.token !== "GROUP:L2:A:SLOT1");

  let violated = 0;
  let ok = true;
  for (let seed = 1; seed <= 200; seed += 1) {
    const res = planRandomDraw(rest, pairs, fixed, seeded(seed));
    if (!res.ok) {
      ok = false;
      continue;
    }
    const p2 = res.plan.find((x) => x.pairUid === "LEVEL2-P2");
    if (p2 && p2.token.split(":")[2] === "A") violated += 1;
  }
  console.log("\nเคส 2 — ต้องเคารพช่องที่จับไว้ก่อนหน้า (สุ่ม 200 รอบ)");
  say(ok, "จัดครบทุกช่องได้ทุกรอบ");
  say(violated === 0, "ไม่เอาคู่ที่มีคนซ้ำมาลงกลุ่มเดียวกับที่ตรึงไว้", violated ? `พบ ${violated} ครั้ง` : "");
}

// ── เคส 3: ช่อง SEED ต้องได้คู่ที่ประเภทตรงกัน ──
{
  const slots: DrawSlot[] = Array.from({ length: 8 }, (_, i) => ({
    token: `SEED:L1:WD:${String(i + 1).padStart(2, "0")}`,
    levelCode: "LEVEL1",
    times: [`1|${String(9 + Math.floor(i / 2)).padStart(2, "0")}:00`],
  }));
  const pairs = makePairs(16, "LEVEL1", new Map());

  let wrongEvent = 0;
  let ok = true;
  for (let seed = 1; seed <= 100; seed += 1) {
    const res = planRandomDraw(slots, pairs, [], seeded(seed));
    if (!res.ok) {
      ok = false;
      continue;
    }
    const byUid = new Map(pairs.map((p) => [p.pairUid, p]));
    for (const item of res.plan) if (byUid.get(item.pairUid)!.eventType !== "WD") wrongEvent += 1;
  }
  console.log("\nเคส 3 — ช่อง SEED ต้องได้ประเภทตรงกัน (สุ่ม 100 รอบ)");
  say(ok, "จัดครบทุกช่องได้ทุกรอบ");
  say(wrongEvent === 0, "ไม่มีคู่ผิดประเภทถูกจับลงช่อง", wrongEvent ? `พบ ${wrongEvent} ครั้ง` : "");
}

// ── เคส 4: จัดไม่ได้จริง ต้องบอกเหตุผล ไม่ใช่เงียบ ──
{
  const impossible = new Map<number, string[]>();
  // คนเดียวกันอยู่ทั้ง 4 คู่ ในขณะที่มีแค่ 4 ช่องและทุกช่องอยู่กลุ่มเดียวกัน
  for (let i = 0; i < 4; i += 1) impossible.set(i, ["คนคนเดียว", `เพื่อน${i}`]);
  const slots = buildGroupSlots("L2", ["A"], 4, 1);
  const pairs = makePairs(4, "LEVEL2", impossible);
  const res = planRandomDraw(slots, pairs, [], seeded(7), 30);

  console.log("\nเคส 4 — กรณีที่จัดไม่ได้จริง");
  say(!res.ok, "ตอบว่าจัดไม่ได้ ไม่ใช่คืนผลผิด ๆ");
  say(Boolean(res.problem), "บอกเหตุผลให้ผู้ใช้", res.problem ?? "");
}

console.log("\n" + "─".repeat(64));
if (failures > 0) {
  console.error(`ไม่ผ่าน ${failures} ข้อ`);
  process.exit(1);
}
console.log("ตัวสุ่มจับสลากผ่านการตรวจทั้งหมด ✓");
