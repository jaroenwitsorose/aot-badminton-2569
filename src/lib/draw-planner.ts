/**
 * สุ่มจับสลากเข้าสาย โดยไม่สร้างปัญหาที่ต้องมาตามแก้ทีหลัง
 *
 * ทำไมสุ่มเฉย ๆ ไม่ได้: ตอนตรวจตารางด้วยรายชื่อจริงเคยเจอว่า
 *   - นัดที่ 4 น.ส.สายไหม ข้างเนียม ต้องแข่งกับตัวเอง เพราะคู่หญิงคู่กับคู่ผสมของเธอ
 *     ถูกจับไปอยู่กลุ่ม A เหมือนกัน
 *   - อีก 13 จุดที่คนเดียวกันถูกจับให้ลงสองคอร์ตพร้อมกัน
 * ทั้งสองอย่างเกิดจากการจับสลากที่มองเห็นแค่ "คู่" ไม่เห็นว่าเบื้องหลังเป็น "คน"
 *
 * ไฟล์นี้เป็นฟังก์ชันบริสุทธิ์ ไม่แตะฐานข้อมูล เพื่อให้ทดสอบซ้ำ ๆ ได้เร็ว
 */

export interface DrawSlot {
  token: string;
  levelCode: string;
  /** ช่วงเวลาที่ช่องนี้ต้องลงแข่ง (วัน|เวลา) — รอบแบ่งกลุ่มมีหลายช่วง */
  times: string[];
}

export interface DrawPair {
  pairUid: string;
  levelCode: string;
  eventType: string | null;
  teamCode: string;
  withdrawn: boolean;
  /** ชื่อผู้เล่นที่ตัดคำนำหน้าแล้ว ใช้ระบุว่าเป็นคนเดียวกันข้ามคู่ */
  playerKeys: string[];
}

export interface DrawPlanItem {
  token: string;
  pairUid: string;
}

export interface DrawPlanResult {
  ok: boolean;
  plan: DrawPlanItem[];
  attempts: number;
  /** เหตุผลที่จัดไม่ได้ ใช้บอกผู้ใช้ว่าติดตรงไหน */
  problem: string | null;
}

/** กลุ่มของช่อง เช่น GROUP:L2:A:SLOT1 -> "A" ; ช่องน็อกเอาต์ไม่มีกลุ่ม */
function groupOf(token: string): string | null {
  const p = token.split(":");
  return p[0] === "GROUP" ? `${p[1]}:${p[2]}` : null;
}

/** ช่อง SEED ผูกประเภทไว้แล้ว (SEED:L1:MD:01) ส่วนช่องกลุ่มรับได้ทุกประเภทในระดับนั้น */
function eventOf(token: string): string | null {
  const p = token.split(":");
  return p[0] === "SEED" ? p[2] : null;
}

function fits(slot: DrawSlot, pair: DrawPair): boolean {
  if (pair.withdrawn) return false;
  if (pair.levelCode !== slot.levelCode) return false;
  if (!pair.eventType) return false; // ต้องล็อกประเภทก่อนจับสลาก
  const need = eventOf(slot.token);
  return need === null || pair.eventType === need;
}

/**
 * สุ่มลำดับแบบ Fisher-Yates
 * รับตัวสุ่มมาจากข้างนอกเพื่อให้ทดสอบซ้ำด้วยผลเดิมได้
 */
function shuffled<T>(list: T[], rand: () => number): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * จัดคู่ให้ครบทุกช่อง โดยไม่ให้คนเดียวกันชนกันเอง
 *
 * @param slots ช่องที่ต้องจับในรอบนี้ (ปกติคือระดับมือเดียว)
 * @param pairs คู่ทั้งหมดที่เลือกได้
 * @param fixed ช่องที่จับไว้แล้วก่อนหน้า รวมระดับอื่นด้วย — ต้องนับเป็นข้อจำกัดด้วย
 *              ไม่งั้นจับมือใหม่เสร็จแล้วไปจับมือ D ก็ยังชนกันข้ามระดับได้
 */
export function planRandomDraw(
  slots: DrawSlot[],
  pairs: DrawPair[],
  fixed: DrawPlanItem[],
  rand: () => number = Math.random,
  maxAttempts = 400,
): DrawPlanResult {
  const pairById = new Map(pairs.map((p) => [p.pairUid, p]));
  const slotByToken = new Map(slots.map((s) => [s.token, s]));
  const usable = pairs.filter((p) => slots.some((s) => fits(s, p)));

  if (usable.length < slots.length) {
    return {
      ok: false,
      plan: [],
      attempts: 0,
      problem: `มีช่อง ${slots.length} ช่อง แต่มีคู่ที่ลงได้แค่ ${usable.length} คู่ — ตรวจว่าล็อกประเภท MD/WD/XD ครบหรือยัง`,
    };
  }

  /** สร้างตารางว่าคนไหนติดเวลาไหน / อยู่กลุ่มไหน จากช่องที่จับไว้แล้ว */
  function seedContext() {
    const busy = new Map<string, Set<string>>(); // คน -> ช่วงเวลาที่ติดแล้ว
    const inGroup = new Map<string, Set<string>>(); // คน -> กลุ่มที่อยู่แล้ว
    for (const f of fixed) {
      const pair = pairById.get(f.pairUid);
      const slot = slotByToken.get(f.token);
      // ช่องที่จับไว้แล้วอาจอยู่คนละระดับ ซึ่งไม่อยู่ใน slots ของรอบนี้
      const times = slot?.times ?? [];
      const grp = groupOf(f.token);
      if (!pair) continue;
      for (const person of pair.playerKeys) {
        if (!busy.has(person)) busy.set(person, new Set());
        for (const t of times) busy.get(person)!.add(t);
        if (grp) {
          if (!inGroup.has(person)) inGroup.set(person, new Set());
          inGroup.get(person)!.add(grp);
        }
      }
    }
    return { busy, inGroup };
  }

  const takenPairs = new Set(fixed.map((f) => f.pairUid));
  let lastProblem: string | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const { busy, inGroup } = seedContext();
    const used = new Set(takenPairs);
    const plan: DrawPlanItem[] = [];
    // สุ่มทั้งลำดับช่องและลำดับคู่ เพื่อไม่ให้ผลเอียงไปทางเดิมทุกครั้ง
    const order = shuffled(slots, rand);
    let stuck: DrawSlot | null = null;

    for (const slot of order) {
      const grp = groupOf(slot.token);
      const candidates = shuffled(
        usable.filter((p) => !used.has(p.pairUid) && fits(slot, p)),
        rand,
      );

      const pick = candidates.find((p) =>
        p.playerKeys.every((person) => {
          if (grp && inGroup.get(person)?.has(grp)) return false; // กันแข่งกับตัวเองในกลุ่ม
          const times = busy.get(person);
          return !times || !slot.times.some((t) => times.has(t)); // กันลงสองคอร์ตพร้อมกัน
        }),
      );

      if (!pick) {
        stuck = slot;
        break;
      }

      used.add(pick.pairUid);
      plan.push({ token: slot.token, pairUid: pick.pairUid });
      for (const person of pick.playerKeys) {
        if (!busy.has(person)) busy.set(person, new Set());
        for (const t of slot.times) busy.get(person)!.add(t);
        if (grp) {
          if (!inGroup.has(person)) inGroup.set(person, new Set());
          inGroup.get(person)!.add(grp);
        }
      }
    }

    if (!stuck) {
      // เรียงตามช่องให้ผลออกมาอ่านง่าย ไม่ใช่ตามลำดับที่สุ่มได้
      plan.sort((a, b) => a.token.localeCompare(b.token));
      return { ok: true, plan, attempts: attempt, problem: null };
    }
    lastProblem = `ช่อง ${stuck.token} หาคู่ที่ไม่ชนกับใครไม่ได้`;
  }

  return {
    ok: false,
    plan: [],
    attempts: maxAttempts,
    problem: `${lastProblem ?? "จัดไม่ลงตัว"} — ลองแล้ว ${maxAttempts} ครั้ง อาจมีคนถูกใส่ไว้หลายคู่เกินกว่าตารางจะรับไหว`,
  };
}
