/**
 * ข้อความภาษาไทยที่ใช้ทั้งเว็บ
 *
 * กติกาการแสดงผลจาก README ของชุดข้อมูล:
 *   - หน้าเว็บแสดง "มือใหม่ / มือ D / มือ C / มือทั่วไป" ไม่ใช้คำว่า Level เป็นหัวข้อ
 *   - ใช้คำว่า "แมตช์" ให้สม่ำเสมอ
 */

import type { EventType, MatchStatus, TeamCode } from "./engine/types";

export const EVENT_TH: Record<EventType, string> = {
  MD: "ชายคู่",
  WD: "หญิงคู่",
  XD: "คู่ผสม",
};

export const STATUS_TH: Record<MatchStatus, string> = {
  WAITING: "รอแข่งขัน",
  CALLED: "เรียกลงคอร์ต",
  PLAYING: "กำลังแข่งขัน",
  COMPLETED: "จบแล้ว",
  WALKOVER: "Walkover",
  CANCELLED: "ยกเลิก",
};

export const STATUS_TONE: Record<MatchStatus, string> = {
  WAITING: "waiting",
  CALLED: "called",
  PLAYING: "playing",
  COMPLETED: "done",
  WALKOVER: "done",
  CANCELLED: "cancelled",
};

export const ROLE_TH: Record<string, string> = {
  SCORER: "ผู้กรอกผล",
  ADMIN: "ผู้ดูแลระบบ",
  SUPERADMIN: "หัวหน้าผู้ดูแล",
};

export const SKILL_RANK_TH: Record<string, string> = {
  NEW: "มือใหม่",
  D: "D",
  C: "C",
  B_MINUS: "B-",
  B_PLUS: "B+",
  A: "A",
  S: "S",
};

export const GENDER_TH: Record<string, string> = { M: "ชาย", F: "หญิง" };

export const TEAM_FALLBACK_TH: Record<TeamCode, string> = {
  PUR: "ม่วง",
  GRN: "เขียว",
  RED: "แดง",
  BLU: "น้ำเงิน",
};

export const CHECK_STATUS_TH: Record<string, string> = {
  NOT_STARTED: "ยังไม่เริ่ม",
  IN_PROGRESS: "กำลังดำเนินการ",
  READY: "พร้อม",
  BLOCKED: "ติดเงื่อนไข",
};

const THAI_MONTHS = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

/** วันจริงยังไม่กำหนด -> คืน label ชั่วคราว ("วันที่ 1") ห้ามเดาวันเอง */
export function formatDayLabel(labelTemp: string, actualDate: string | null): string {
  if (!actualDate) return labelTemp;
  const d = new Date(actualDate);
  const be = d.getFullYear() + 543;
  return `${labelTemp} · ${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${be}`;
}

export function formatScore(games: { gameNo: number; scoreA: number; scoreB: number }[]): string {
  if (games.length === 0) return "—";
  return games
    .slice()
    .sort((a, b) => a.gameNo - b.gameNo)
    .map((g) => `${g.scoreA}-${g.scoreB}`)
    .join("  ");
}
