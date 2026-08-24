/**
 * โครงสร้างของ data/seed-data.json (สร้างจาก Excel ด้วย data/extract_from_excel.py)
 * ใช้ร่วมกันระหว่างสคริปต์ seed ฐานข้อมูลและสคริปต์จำลองการแข่งขัน
 */

import type {
  Bracket,
  EnginePair,
  EngineState,
  EventType,
  LevelCode,
  Phase,
  TeamCode,
} from "./engine/types";

export interface SeedTournament {
  tournamentId: string;
  titleTh: string;
  yearBe: number;
  timezone: string;
  startDate: string | null;
  endDate: string | null;
  venue: string | null;
  venueConfirmed: boolean;
  publicRefreshMs: number;
  registrationMode: string;
  reportingMinutesBefore: number;
  walkoverGraceMinutes: number;
  walkoverScore: string;
}

export interface SeedTeam {
  teamCode: TeamCode;
  nameTh: string;
  displayOrder: number;
  colorHex: string;
}

export interface SeedLevel {
  levelCode: LevelCode;
  nameTh: string;
  eligibility: string;
  pairSlots: number;
  matchCount: number;
  format: string;
  eventTypes: string;
  teamTieSize: number;
}

export interface SeedPair {
  pairUid: string;
  levelCode: LevelCode;
  teamCode: TeamCode;
  slotNo: number;
  eventType: EventType | null;
  publicPairCode: string | null;
  player1Template: string | null;
  player2Template: string | null;
}

export interface SeedParticipant {
  participantUid: string;
  pairUid: string;
  playerNo: number;
  displayCode: string | null;
  actualName: string | null;
  employeeId: string | null;
  teamCode: TeamCode;
  levelCode: LevelCode;
  eventType: EventType | null;
  skillRank: string | null;
  gender: string | null;
}

export interface SeedMatch {
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
}

export interface SeedTie {
  tieId: string;
  tieNo: number;
  phase: Phase;
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

export interface SeedScoringRule {
  levelCode: LevelCode;
  category: string;
  result: string;
  rankNo: number | null;
  points: number;
  medal: string | null;
  countsTowardTotal: boolean;
  note: string | null;
}

export interface SeedChecklistItem {
  area: string;
  item: string;
  owner: string | null;
  status: string;
  blocking: boolean;
  note: string | null;
}

export interface SeedFile {
  tournament: SeedTournament;
  teams: SeedTeam[];
  levels: SeedLevel[];
  pairs: SeedPair[];
  participants: SeedParticipant[];
  matches: SeedMatch[];
  ties: SeedTie[];
  scoring: SeedScoringRule[];
  enums: Record<string, { code: string; displayTh: string; note: string | null }[]>;
  checklist: SeedChecklistItem[];
}

export function loadSeedFile(raw: string): SeedFile {
  const data = JSON.parse(raw) as SeedFile;
  const expect = (label: string, actual: number, want: number) => {
    if (actual !== want) throw new Error(`seed-data.json ผิดพลาด: ${label} = ${actual} (ต้องเป็น ${want})`);
  };
  expect("teams", data.teams.length, 4);
  expect("levels", data.levels.length, 4);
  expect("pairs", data.pairs.length, 92);
  expect("participants", data.participants.length, 184);
  expect("matches", data.matches.length, 158);
  expect("ties", data.ties.length, 10);
  return data;
}

/** แปลงข้อมูลตั้งต้นเป็นสถานะเริ่มต้นของเอนจิน (ยังไม่จับสลาก ยังไม่มีผล) */
export function buildEngineStateFromSeed(seed: SeedFile): EngineState {
  const pairs: EnginePair[] = seed.pairs.map((p) => ({
    pairUid: p.pairUid,
    levelCode: p.levelCode,
    teamCode: p.teamCode,
    slotNo: p.slotNo,
    eventType: p.eventType,
    withdrawn: false,
  }));

  return {
    pairs,
    matches: seed.matches.map((m) => ({
      ...m,
      status: "WAITING",
      walkover: false,
      walkoverSide: null,
      games: [],
    })),
    ties: seed.ties.map((t) => ({
      tieId: t.tieId,
      tieNo: t.tieNo,
      phase: t.phase,
      stage: t.stage,
      dayNo: t.dayNo,
      startTime: t.startTime,
      teamASource: t.teamASource,
      teamBSource: t.teamBSource,
      matchNos: t.matchNos,
      requiredMatchWins: t.requiredMatchWins,
      playAllThree: t.playAllThree,
    })),
    draws: [],
    lineups: [],
    scoringRules: seed.scoring.map((r) => ({
      levelCode: r.levelCode,
      category: r.category,
      result: r.result,
      points: r.points,
      medal: r.medal,
      countsTowardTotal: r.countsTowardTotal,
    })),
    tiebreaks: [],
  };
}
