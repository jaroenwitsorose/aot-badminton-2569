/**
 * ชนิดข้อมูลของเอนจินการแข่งขัน
 *
 * เอนจินทั้งหมดเป็น "ฟังก์ชันบริสุทธิ์" ทำงานบนโครงสร้างข้อมูลธรรมดา ไม่ผูกกับฐานข้อมูล
 * ทำให้จำลองครบ 158 แมตช์เพื่อทดสอบได้โดยไม่ต้องต่อ DB (ตรงกับ Checklist ข้อ "จำลองครบ 158 แมตช์")
 */

export type EventType = "MD" | "WD" | "XD";
export type LevelCode = "LEVEL1" | "LEVEL2" | "LEVEL3" | "LEVEL4";
export type TeamCode = "PUR" | "GRN" | "RED" | "BLU";

export type MatchStatus =
  | "WAITING"
  | "CALLED"
  | "PLAYING"
  | "COMPLETED"
  | "WALKOVER"
  | "CANCELLED";

export type Phase = "KNOCKOUT" | "GROUP_STAGE" | "ROUND_ROBIN" | "PAGE_PLAYOFF";
export type Bracket = "MAIN" | "GROUP" | "UPPER" | "LOWER" | "TEAM";
export type Side = "A" | "B";

export interface Game {
  gameNo: number;
  scoreA: number;
  scoreB: number;
}

export interface EnginePair {
  pairUid: string;
  levelCode: LevelCode;
  teamCode: TeamCode;
  slotNo: number;
  eventType: EventType | null;
  withdrawn?: boolean;
}

export interface EngineMatch {
  matchNo: number;
  matchUid: string;
  sourceMatchCode: string;
  dayNo: number;
  startTime: string;
  endTime: string;
  courtNo: number;
  levelCode: LevelCode;
  eventType: EventType | null;
  phase: Phase;
  bracket: Bracket;
  roundLabel: string;
  groupKey: string | null;
  tieId: string | null;
  tieOrderNo: number | null;
  sideASource: string;
  sideBSource: string;
  status: MatchStatus;
  walkover: boolean;
  /** ฝั่งที่ "ไม่มาแข่ง" (แพ้ walkover) */
  walkoverSide: Side | null;
  games: Game[];
}

export interface EngineTie {
  tieId: string;
  tieNo: number;
  phase: Phase;
  stage: string;
  dayNo: number;
  startTime: string;
  teamASource: string;
  teamBSource: string;
  matchNos: number[];
  requiredMatchWins: number;
  playAllThree: boolean;
}

/** ผลจับสลาก: token -> pair_uid */
export interface EngineDraw {
  token: string;
  pairUid: string;
}

/** ซองส่งรายชื่อของมือทั่วไป */
export interface EngineLineup {
  tieId: string;
  teamCode: TeamCode;
  orderNo: number;
  pairUid: string;
}

export interface EngineScoringRule {
  levelCode: LevelCode;
  category: string; // MD | WD | XD | UPPER | LOWER | TEAM
  result: string; // "อันดับ 1" ...
  points: number;
  medal: string | null;
  countsTowardTotal: boolean;
}

/**
 * คำตัดสินเสมอที่กรรมการชี้ขาดเอง (เกณฑ์อัตโนมัติแยกไม่ออกแล้ว)
 * ตรงกับรายการ Blocking "ยืนยันเกณฑ์เสมอขั้นสุดท้ายมือทั่วไป"
 */
export interface EngineTiebreak {
  /** "GROUP" = จัดอันดับในกลุ่ม L2/L3 , "L4_RR" = จัดอันดับสีของมือทั่วไป */
  scope: "GROUP" | "L4_RR";
  /** GROUP -> "LEVEL2:A" ; L4_RR -> "LEVEL4" */
  key: string;
  /** ลำดับที่กรรมการชี้ขาด (pairUid สำหรับ GROUP, teamCode สำหรับ L4_RR) */
  order: string[];
  note?: string;
}

export interface EngineState {
  pairs: EnginePair[];
  matches: EngineMatch[];
  ties: EngineTie[];
  draws: EngineDraw[];
  lineups: EngineLineup[];
  scoringRules: EngineScoringRule[];
  tiebreaks: EngineTiebreak[];
}

// ───────────────────────── ผลลัพธ์ ─────────────────────────

/** ที่มาของฝั่งหนึ่ง: ถ้ายังไม่รู้คู่ ให้ label อธิบายแทน เช่น "ผู้ชนะแมตช์ #12" */
export interface SideResolution {
  pairUid: string | null;
  /** ข้อความที่หน้าเว็บแสดงเมื่อยังไม่รู้คู่ */
  pendingLabel: string;
  /** สีที่รู้แล้วแม้ยังไม่รู้คู่ (มือทั่วไปรู้สีก่อนเปิดซอง) */
  teamCode: TeamCode | null;
}

export interface MatchResult {
  matchUid: string;
  matchNo: number;
  sideA: SideResolution;
  sideB: SideResolution;
  gamesWonA: number;
  gamesWonB: number;
  pointsForA: number;
  pointsForB: number;
  winnerSide: Side | null;
  winnerPairUid: string | null;
  loserPairUid: string | null;
  decided: boolean;
}

export interface StandingRow {
  /** pairUid (รอบแบ่งกลุ่ม) หรือ teamCode (มือทั่วไป) */
  key: string;
  teamCode: TeamCode | null;
  played: number;
  won: number;
  lost: number;
  gamesWon: number;
  gamesLost: number;
  pointsWon: number;
  pointsLost: number;
  gameDiff: number;
  pointDiff: number;
  rank: number | null;
  /** เกณฑ์ที่ใช้ตัดสินอันดับนี้ เอาไว้แสดงให้โปร่งใส */
  rankReason: string;
}

export interface TieResult {
  tieId: string;
  /** รอบพบกันหมด หรือ Page Playoff — โบนัสปลอบใจให้เฉพาะ Page Playoff */
  phase: Phase;
  teamACode: TeamCode | null;
  teamBCode: TeamCode | null;
  pendingLabelA: string;
  pendingLabelB: string;
  matchWinsA: number;
  matchWinsB: number;
  playedCount: number;
  status: "WAITING" | "PLAYING" | "COMPLETED";
  winnerTeamCode: TeamCode | null;
  loserTeamCode: TeamCode | null;
}

export interface ScoreEvent {
  levelCode: LevelCode;
  category: string;
  result: string;
  teamCode: TeamCode;
  pairUid: string | null;
  points: number;
  medal: string | null;
  countsTowardTotal: boolean;
  /** match_uid หรือ tie_id ที่ทำให้เกิดคะแนนนี้ */
  sourceRef: string;
}

export interface TeamTotal {
  teamCode: TeamCode;
  points: number;
  gold: number;
  silver: number;
  bronze: number;
  rank: number;
}

export interface EngineOutput {
  matches: Map<string, MatchResult>;
  /** key = "LEVEL2:A" */
  groupStandings: Map<string, StandingRow[]>;
  /** อันดับสีของมือทั่วไปหลังรอบพบกันหมด */
  level4Standings: StandingRow[];
  ties: Map<string, TieResult>;
  scoreEvents: ScoreEvent[];
  teamTotals: TeamTotal[];
  /** ปัญหาที่ต้องให้คนแก้ เช่น จับสลากไม่ครบ ซองไม่ครบ */
  warnings: string[];
}
