/**
 * ข้อกำหนดกลางของไฟล์ Excel สำหรับกรอกข้อมูล
 *
 * ทั้งฝั่ง export (สร้างไฟล์) และ import (อ่านไฟล์) อ้างจากไฟล์นี้ไฟล์เดียว
 * เพื่อไม่ให้หัวคอลัมน์หรือค่าที่ยอมรับหลุดจากกัน
 */

export const SHEET = {
  guide: "วิธีใช้",
  participants: "รายชื่อนักกีฬา",
  pairEvents: "ประเภทคู่",
  draw: "จับสลาก",
  lineups: "ซองมือทั่วไป",
  /** ชีตซ่อนสำหรับรายการตัวเลือก (ตั้งชื่อเป็นอังกฤษเพื่อให้อ้างในสูตร data validation ได้ปลอดภัย) */
  lists: "Lists",
} as const;

/** คอลัมน์ที่ผู้ใช้กรอก จะทำพื้นสีเหลืองตามธรรมเนียมไฟล์ต้นฉบับของ ทอท. */
export const FILL_HEADER = "FFFFF3C4";
export const READONLY_HEADER = "FFEDF1F7";
export const TITLE_FILL = "FF061F46";

export const PARTICIPANT_COLUMNS = [
  { key: "participantUid", header: "รหัสนักกีฬา (ห้ามแก้)", width: 26, editable: false },
  { key: "teamNameTh", header: "สี", width: 10, editable: false },
  { key: "levelNameTh", header: "ระดับที่ลงแข่ง", width: 14, editable: false },
  { key: "eventNameTh", header: "ประเภท", width: 10, editable: false },
  { key: "slotNo", header: "คู่ที่", width: 7, editable: false },
  { key: "playerNo", header: "คนที่", width: 7, editable: false },
  { key: "actualName", header: "ชื่อ-นามสกุล", width: 30, editable: true },
  { key: "employeeId", header: "รหัสพนักงาน", width: 16, editable: true },
  { key: "skillRank", header: "ระดับมือจริง", width: 14, editable: true },
  { key: "gender", header: "เพศ", width: 9, editable: true },
] as const;

export const PAIR_EVENT_COLUMNS = [
  { key: "pairUid", header: "รหัสคู่ (ห้ามแก้)", width: 26, editable: false },
  { key: "teamNameTh", header: "สี", width: 10, editable: false },
  { key: "levelNameTh", header: "ระดับที่ลงแข่ง", width: 14, editable: false },
  { key: "slotNo", header: "คู่ที่", width: 7, editable: false },
  { key: "players", header: "นักกีฬาในคู่", width: 36, editable: false },
  { key: "status", header: "สถานะ", width: 14, editable: false },
  { key: "eventTh", header: "ประเภทที่ต้องการล็อก", width: 22, editable: true },
] as const;

export const DRAW_COLUMNS = [
  { key: "token", header: "รหัสช่อง (ห้ามแก้)", width: 24, editable: false },
  { key: "levelNameTh", header: "ระดับที่ลงแข่ง", width: 14, editable: false },
  { key: "slotLabel", header: "ช่องในสาย", width: 26, editable: false },
  { key: "firstMatchNo", header: "ลงแข่งครั้งแรก", width: 15, editable: false },
  { key: "currentPair", header: "คู่ปัจจุบัน", width: 34, editable: false },
  { key: "pairChoice", header: "คู่ที่จะใส่ในช่องนี้", width: 46, editable: true },
] as const;

export const LINEUP_COLUMNS = [
  { key: "tieId", header: "รหัสคู่สี (ห้ามแก้)", width: 16, editable: false },
  { key: "stage", header: "รอบ", width: 24, editable: false },
  { key: "teamNameTh", header: "สี", width: 10, editable: false },
  { key: "orderNo", header: "ลำดับคู่ (ห้ามแก้)", width: 16, editable: false },
  { key: "currentPair", header: "คู่ปัจจุบัน", width: 30, editable: false },
  { key: "pairChoice", header: "คู่ที่ส่งลงในลำดับนี้", width: 46, editable: true },
] as const;

// ───────────────────────── การแปลงค่า ─────────────────────────

export const SKILL_RANK_OPTIONS = ["มือใหม่", "D", "C", "B-", "B+", "A", "S"] as const;

const SKILL_TH_TO_DB: Record<string, string> = {
  "มือใหม่": "NEW",
  NEW: "NEW",
  D: "D",
  C: "C",
  "B-": "B_MINUS",
  B_MINUS: "B_MINUS",
  "B+": "B_PLUS",
  B_PLUS: "B_PLUS",
  A: "A",
  S: "S",
};

export function skillRankToDb(value: string): string | null | undefined {
  const t = value.trim();
  if (!t) return null;
  return SKILL_TH_TO_DB[t] ?? undefined; // undefined = ค่าที่ไม่รู้จัก
}

export const GENDER_OPTIONS = ["ชาย", "หญิง"] as const;

export function genderToDb(value: string): string | null | undefined {
  const t = value.trim();
  if (!t) return null;
  if (t === "ชาย" || t.toUpperCase() === "M") return "M";
  if (t === "หญิง" || t.toUpperCase() === "F") return "F";
  return undefined;
}

export const EVENT_OPTIONS = ["ชายคู่", "หญิงคู่", "คู่ผสม"] as const;

export function eventToDb(value: string): string | null | undefined {
  const t = value.trim();
  if (!t) return null;
  if (t === "ชายคู่" || t.toUpperCase() === "MD") return "MD";
  if (t === "หญิงคู่" || t.toUpperCase() === "WD") return "WD";
  if (t === "คู่ผสม" || t.toUpperCase() === "XD") return "XD";
  return undefined;
}

/**
 * ป้ายเลือกคู่ที่ใช้ในช่องจับสลาก/ซอง — ต้องไม่ซ้ำกันและอ่านออก
 * รูปแบบ: "PAIR-L1-PUR-MD-01 | ม่วง · มือใหม่ ชายคู่ คู่ที่ 1"
 */
export function pairChoiceLabel(pair: {
  pairUid: string;
  teamNameTh: string;
  levelNameTh: string;
  eventNameTh: string | null;
  slotNo: number;
  playersLabel?: string;
}): string {
  const who = pair.playersLabel?.trim();
  const detail = [pair.teamNameTh, "·", pair.levelNameTh, pair.eventNameTh ?? "ยังไม่ล็อกประเภท", `คู่ที่ ${pair.slotNo}`]
    .filter(Boolean)
    .join(" ");
  return `${pair.pairUid} | ${detail}${who ? ` — ${who}` : ""}`;
}

/** ดึง pairUid กลับจากป้ายเลือกคู่ (ยอมรับกรณีผู้ใช้พิมพ์แค่ pairUid มาเองด้วย) */
export function pairUidFromChoice(value: string): string | null {
  const t = value.trim();
  if (!t) return null;
  const uid = t.split("|")[0].trim();
  return uid || null;
}
