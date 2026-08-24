/**
 * กฎการตรวจข้อมูลก่อนบันทึก — ใช้ร่วมกันทั้งฝั่ง server action และหน้าจอกรอกผล
 * ทุกฟังก์ชันคืนข้อความภาษาไทยเมื่อไม่ผ่าน และคืน null เมื่อผ่าน
 */

export interface GameInput {
  gameNo: number;
  scoreA: number;
  scoreB: number;
}

/** ตรวจสกอร์ 1 เกมตามกติกาแบดมินตัน: ชนะที่ 21 ต้องห่าง 2 แต้ม เพดาน 30 */
export function validateGame(game: GameInput): string | null {
  const { scoreA, scoreB, gameNo } = game;
  if (!Number.isInteger(scoreA) || !Number.isInteger(scoreB)) return `เกมที่ ${gameNo}: สกอร์ต้องเป็นจำนวนเต็ม`;
  if (scoreA < 0 || scoreB < 0) return `เกมที่ ${gameNo}: สกอร์ติดลบไม่ได้`;
  if (scoreA > 30 || scoreB > 30) return `เกมที่ ${gameNo}: สกอร์เกิน 30 ไม่ได้`;
  if (scoreA === scoreB) return `เกมที่ ${gameNo}: สกอร์เท่ากันไม่ได้`;

  const hi = Math.max(scoreA, scoreB);
  const lo = Math.min(scoreA, scoreB);
  if (hi < 21) return `เกมที่ ${gameNo}: ฝ่ายชนะต้องได้อย่างน้อย 21 แต้ม`;
  if (hi === 30) {
    if (lo !== 29) return `เกมที่ ${gameNo}: สกอร์ 30 ใช้ได้เฉพาะกรณี 30-29`;
    return null;
  }
  if (hi > 21 && hi - lo !== 2) return `เกมที่ ${gameNo}: หลัง 21 ต้องชนะห่าง 2 แต้ม (หรือจบที่ 30-29)`;
  if (hi === 21 && lo > 19) return `เกมที่ ${gameNo}: 21-${lo} ไม่ถูกต้อง ต้องเล่นต่อจนห่าง 2 แต้ม`;
  return null;
}

/** ตรวจทั้งแมตช์ (Best of 3) */
export function validateMatchGames(games: GameInput[]): string | null {
  if (games.length < 2) return "ต้องกรอกอย่างน้อย 2 เกม";
  if (games.length > 3) return "แมตช์หนึ่งมีได้ไม่เกิน 3 เกม";

  const sorted = [...games].sort((a, b) => a.gameNo - b.gameNo);
  for (const [i, g] of sorted.entries()) {
    if (g.gameNo !== i + 1) return "ลำดับเกมต้องเป็น 1, 2, 3 ตามลำดับ";
    const err = validateGame(g);
    if (err) return err;
  }

  let winsA = 0;
  let winsB = 0;
  for (const g of sorted) {
    if (g.scoreA > g.scoreB) winsA += 1;
    else winsB += 1;
  }
  if (Math.max(winsA, winsB) !== 2) return "ต้องมีฝ่ายที่ชนะครบ 2 เกม";
  if (sorted.length === 2 && Math.min(winsA, winsB) !== 0) return "ถ้าจบใน 2 เกม ต้องชนะรวด 2-0";
  if (sorted.length === 3 && Math.min(winsA, winsB) !== 1) return "เกมที่ 3 จะมีได้ต่อเมื่อเสมอกัน 1-1";
  return null;
}

/** ประเภทคู่ต้องสอดคล้องกับเพศของนักกีฬาทั้งสองคน */
export function validateEventGender(
  eventType: "MD" | "WD" | "XD",
  genders: (string | null)[],
): string | null {
  if (genders.some((g) => !g)) return null; // ยังไม่กรอกเพศ ตรวจตอนกรอกครบ
  const males = genders.filter((g) => g === "M").length;
  const females = genders.filter((g) => g === "F").length;
  if (eventType === "MD" && males !== 2) return "ชายคู่ต้องเป็นผู้ชายทั้งสองคน";
  if (eventType === "WD" && females !== 2) return "หญิงคู่ต้องเป็นผู้หญิงทั้งสองคน";
  if (eventType === "XD" && !(males === 1 && females === 1)) return "คู่ผสมต้องเป็นชาย 1 คน หญิง 1 คน";
  return null;
}

const RANK_ORDER: Record<string, number> = {
  NEW: 0,
  D: 1,
  C: 2,
  B_MINUS: 3,
  B_PLUS: 4,
  A: 5,
  S: 6,
};

/**
 * กติกาส่งซองมือทั่วไป: คู่ 1 ระดับไม่ต่ำกว่าคู่ 2 และ 3
 * ใช้ระดับมือที่สูงที่สุดของคู่นั้นเป็นตัวแทน
 */
export function validateLineupOrder(
  pairsInOrder: { pairUid: string; ranks: (string | null)[] }[],
): string | null {
  if (pairsInOrder.length !== 3) return "ต้องส่งครบ 3 คู่";
  const uids = new Set(pairsInOrder.map((p) => p.pairUid));
  if (uids.size !== 3) return "ห้ามส่งคู่ซ้ำในคู่สีเดียวกัน";

  const strength = pairsInOrder.map((p) => {
    const known = p.ranks.filter((r): r is string => Boolean(r)).map((r) => RANK_ORDER[r] ?? -1);
    return known.length === 0 ? null : Math.max(...known);
  });
  if (strength.some((s) => s === null)) return null; // ยังไม่กรอกระดับมือครบ ข้ามการตรวจ

  const [first, second, third] = strength as number[];
  if (first < second || first < third) {
    return "คู่ที่ 1 ต้องมีระดับมือไม่ต่ำกว่าคู่ที่ 2 และคู่ที่ 3";
  }
  return null;
}

/** ระดับมือของนักกีฬาต้องอยู่ในเกณฑ์ของระดับที่ลงแข่ง */
const LEVEL_ALLOWED_RANKS: Record<string, string[]> = {
  LEVEL1: ["NEW"],
  LEVEL2: ["D", "NEW"],
  LEVEL3: ["C", "D", "NEW"],
  LEVEL4: ["S", "A", "B_PLUS", "B_MINUS", "C", "D", "NEW"],
};

export function validateSkillEligibility(levelCode: string, skillRank: string | null): string | null {
  if (!skillRank) return null;
  const allowed = LEVEL_ALLOWED_RANKS[levelCode];
  if (!allowed) return null;
  if (!allowed.includes(skillRank)) {
    return `ระดับมือ ${skillRank.replace("_MINUS", "-").replace("_PLUS", "+")} ลงแข่งในระดับนี้ไม่ได้`;
  }
  return null;
}

export function isBlank(value: string | null | undefined): boolean {
  return !value || value.trim() === "";
}
