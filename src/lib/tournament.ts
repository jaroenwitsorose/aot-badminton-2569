/**
 * ชั้นเชื่อมฐานข้อมูลกับเอนจิน
 *
 * โหลดสถานะทั้งหมดจาก Postgres -> ส่งให้เอนจินคำนวณ -> แปลงเป็นข้อมูลที่หน้าเว็บใช้ได้ทันที
 * ข้อมูลทั้งชุดมีแค่ 158 แมตช์ / 92 คู่ จึงคำนวณสดทุกครั้งได้สบาย ไม่ต้องเก็บสถานะซ้ำซ้อน
 */

import { prisma } from "./prisma";
import { runEngine } from "./engine";
import type {
  EngineState,
  EventType,
  LevelCode,
  MatchStatus,
  ScoreEvent,
  StandingRow,
  TeamCode,
  TeamTotal,
  TieResult,
} from "./engine/types";
import { EVENT_TH, formatDayLabel } from "./labels";

// ───────────────────────── view types ─────────────────────────

export interface PlayerView {
  playerNo: number;
  name: string;
  hasRealName: boolean;
  employeeId: string | null;
  skillRank: string | null;
  gender: string | null;
}

export interface PairView {
  pairUid: string;
  publicPairCode: string | null;
  levelCode: LevelCode;
  levelNameTh: string;
  teamCode: TeamCode;
  teamNameTh: string;
  colorHex: string;
  eventType: EventType | null;
  eventNameTh: string | null;
  slotNo: number;
  withdrawn: boolean;
  players: PlayerView[];
  /** ข้อความหลักที่ใช้แสดงบนตาราง เช่น "สมชาย / สมหญิง" หรือรหัสชั่วคราว */
  label: string;
  /** true = ยังไม่ได้กรอกชื่อจริง หน้าเว็บควรแสดงเป็นสีจาง */
  isPlaceholder: boolean;
}

/**
 * ข้อมูลคู่แบบย่อที่ฝังในแต่ละฝั่งของแมตช์
 *
 * ตัด players ออกเพราะไม่มีหน้าไหนอ่านรายชื่อนักกีฬาจากตรงนี้ — หน้ารายชื่อและโปรไฟล์คู่
 * อ่านจาก snapshot.pairs แทน ถ้าฝังไว้จะกลายเป็นข้อมูลซ้ำ 632 ชุด (158 แมตช์ × 2 ฝั่ง × 2 คน)
 * ในก้อนข้อมูลที่หน้าสาธารณะโหลดใหม่ทุก 3 วินาที
 */
export type MatchSidePair = Omit<PairView, "players">;

export interface SideView {
  pair: MatchSidePair | null;
  pendingLabel: string;
  teamCode: TeamCode | null;
  teamNameTh: string | null;
  colorHex: string | null;
}

export interface MatchView {
  matchUid: string;
  matchNo: number;
  /** โค้ดสายจาก Excel มีภาษาไทย ใช้แสดง/อ้างอิงภายในเท่านั้น ห้ามใช้ใน URL */
  sourceMatchCode: string;
  sideASource: string;
  sideBSource: string;
  dayNo: number;
  dayLabel: string;
  startTime: string;
  endTime: string;
  courtNo: number;
  levelCode: LevelCode;
  levelNameTh: string;
  eventType: EventType | null;
  eventNameTh: string | null;
  phase: string;
  bracket: string;
  roundLabel: string;
  groupKey: string | null;
  tieId: string | null;
  tieOrderNo: number | null;
  sideA: SideView;
  sideB: SideView;
  games: { gameNo: number; scoreA: number; scoreB: number }[];
  gamesWonA: number;
  gamesWonB: number;
  status: MatchStatus;
  walkover: boolean;
  walkoverSide: string | null;
  winnerPairUid: string | null;
  loserPairUid: string | null;
  winnerSide: "A" | "B" | null;
  decided: boolean;
  publicUpdatedAt: string | null;
  adminNote: string | null;
  /** กรอกผลได้เมื่อรู้แล้วว่าเป็นคู่ไหนทั้งสองฝั่ง */
  scorable: boolean;
}

export interface TieView extends TieResult {
  tieNo: number;
  stage: string;
  // phase สืบทอดมาจาก TieResult แล้ว (ROUND_ROBIN | PAGE_PLAYOFF)
  dayNo: number;
  dayLabel: string;
  startTime: string;
  courts: string;
  requiredMatchWins: number;
  matchNos: number[];
  teamANameTh: string | null;
  teamBNameTh: string | null;
  colorHexA: string | null;
  colorHexB: string | null;
}

export interface StandingView extends StandingRow {
  displayName: string;
  colorHex: string | null;
  teamNameTh: string | null;
}

export interface TeamTotalView extends TeamTotal {
  nameTh: string;
  colorHex: string;
  breakdown: {
    levelCode: LevelCode;
    levelNameTh: string;
    category: string;
    categoryLabel: string;
    result: string;
    points: number;
    medal: string | null;
    countsTowardTotal: boolean;
    pairLabel: string | null;
    sourceRef: string;
  }[];
}

export interface TournamentSnapshot {
  generatedAt: string;
  tournament: {
    tournamentId: string;
    titleTh: string;
    yearBe: number;
    venue: string | null;
    startDate: string | null;
    endDate: string | null;
    datesConfirmed: boolean;
    venueConfirmed: boolean;
    publicRefreshMs: number;
    reportingMinutesBefore: number;
    walkoverGraceMinutes: number;
    walkoverScore: string;
    /** เปิดอยู่ = ผลที่แสดงเป็นผลซ้อม ไม่ใช่ผลจริง หน้าสาธารณะต้องบอกผู้ชมให้ชัด */
    simulationEnabled: boolean;
  };
  days: { dayNo: number; label: string; actualDate: string | null; confirmed: boolean }[];
  teams: { teamCode: TeamCode; nameTh: string; colorHex: string; displayOrder: number }[];
  levels: { levelCode: LevelCode; nameTh: string; format: string; eligibility: string; sortOrder: number; matchCount: number; pairSlots: number }[];
  pairs: PairView[];
  matches: MatchView[];
  ties: TieView[];
  groupStandings: { key: string; levelCode: LevelCode; groupKey: string; rows: StandingView[] }[];
  level4Standings: StandingView[];
  teamTotals: TeamTotalView[];
  readiness: {
    namesFilled: number;
    namesTotal: number;
    eventLocked: number;
    eventTotal: number;
    drawAssigned: number;
    drawTotal: number;
    matchesCompleted: number;
    matchesTotal: number;
    blockingOpen: number;
  };
  warnings: string[];
}

// ───────────────────────── loader ─────────────────────────

const CATEGORY_LABEL: Record<string, string> = {
  MD: "ชายคู่",
  WD: "หญิงคู่",
  XD: "คู่ผสม",
  UPPER: "สายบน",
  LOWER: "สายล่าง",
  TEAM: "ทีมสี",
};

export async function getTournamentSnapshot(): Promise<TournamentSnapshot> {
  const [tournament, days, teams, levels, pairs, matches, ties, draws, lineups, rules, tiebreaks, checklist] =
    await Promise.all([
      prisma.tournament.findFirst(),
      prisma.tournamentDay.findMany({ orderBy: { dayNo: "asc" } }),
      prisma.team.findMany({ orderBy: { displayOrder: "asc" } }),
      prisma.level.findMany({ orderBy: { sortOrder: "asc" } }),
      prisma.pair.findMany({ include: { participants: { orderBy: { playerNo: "asc" } } } }),
      prisma.match.findMany({ include: { games: true }, orderBy: { matchNo: "asc" } }),
      prisma.level4Tie.findMany({ orderBy: { tieNo: "asc" } }),
      prisma.drawAssignment.findMany(),
      prisma.level4Lineup.findMany(),
      prisma.colorScoringRule.findMany(),
      prisma.tiebreakDecision.findMany(),
      prisma.checklistItem.findMany(),
    ]);

  if (!tournament) throw new Error("ยังไม่ได้นำเข้าข้อมูลตั้งต้น — รัน npm run db:seed ก่อน");

  const teamByCode = new Map(teams.map((t) => [t.teamCode, t]));
  const levelByCode = new Map(levels.map((l) => [l.levelCode, l]));
  const dayLabelByNo = new Map(
    days.map((d) => [
      d.dayNo,
      formatDayLabel(d.labelTemp, d.actualDate ? d.actualDate.toISOString().slice(0, 10) : null),
    ]),
  );

  const state: EngineState = {
    pairs: pairs.map((p) => ({
      pairUid: p.pairUid,
      levelCode: p.levelCode as LevelCode,
      teamCode: p.teamCode as TeamCode,
      slotNo: p.slotNo,
      eventType: p.eventType as EventType | null,
      withdrawn: p.withdrawn,
    })),
    matches: matches.map((m) => ({
      matchNo: m.matchNo,
      matchUid: m.matchUid,
      sourceMatchCode: m.sourceMatchCode,
      dayNo: m.dayNo,
      startTime: m.startTime,
      endTime: m.endTime,
      courtNo: m.courtNo,
      levelCode: m.levelCode as LevelCode,
      eventType: m.eventType as EventType | null,
      phase: m.phase,
      bracket: m.bracket,
      roundLabel: m.roundLabel,
      groupKey: m.groupKey,
      tieId: m.tieId,
      tieOrderNo: m.tieOrderNo,
      sideASource: m.sideASource,
      sideBSource: m.sideBSource,
      status: m.status,
      walkover: m.walkover,
      walkoverSide: (m.walkoverSide as "A" | "B" | null) ?? null,
      games: m.games.map((g) => ({ gameNo: g.gameNo, scoreA: g.scoreA, scoreB: g.scoreB })),
    })),
    ties: ties.map((t) => ({
      tieId: t.tieId,
      tieNo: t.tieNo,
      phase: t.phase,
      stage: t.stage,
      dayNo: t.dayNo,
      startTime: t.startTime,
      teamASource: t.teamASource,
      teamBSource: t.teamBSource,
      matchNos: matches.filter((m) => m.tieId === t.tieId).map((m) => m.matchNo).sort((a, b) => a - b),
      requiredMatchWins: t.requiredMatchWins,
      playAllThree: t.playAllThree,
    })),
    draws: draws.map((d) => ({ token: d.token, pairUid: d.pairUid })),
    lineups: lineups.map((l) => ({
      tieId: l.tieId,
      teamCode: l.teamCode as TeamCode,
      orderNo: l.orderNo,
      pairUid: l.pairUid,
    })),
    scoringRules: rules.map((r) => ({
      levelCode: r.levelCode as LevelCode,
      category: r.category,
      result: r.result,
      points: r.points,
      medal: r.medal,
      countsTowardTotal: r.countsTowardTotal,
    })),
    tiebreaks: tiebreaks.map((t) => ({
      scope: t.scope as "GROUP" | "L4_RR",
      key: t.key,
      order: t.orderedKeys,
      note: t.note ?? undefined,
    })),
  };

  const out = runEngine(state);

  // ── แปลงคู่แข่งขันเป็น view ──────────────────────────────
  const pairViews = new Map<string, PairView>();
  for (const p of pairs) {
    const team = teamByCode.get(p.teamCode)!;
    const level = levelByCode.get(p.levelCode)!;
    const templates = [p.player1Template, p.player2Template];
    const players: PlayerView[] = p.participants.map((pt, idx) => ({
      playerNo: pt.playerNo,
      name: pt.actualName ?? pt.displayCode ?? templates[idx] ?? `${team.nameTh} ${p.slotNo}-${pt.playerNo}`,
      hasRealName: Boolean(pt.actualName),
      employeeId: pt.employeeId,
      skillRank: pt.skillRank,
      gender: pt.gender,
    }));
    const isPlaceholder = players.some((pl) => !pl.hasRealName);
    pairViews.set(p.pairUid, {
      pairUid: p.pairUid,
      publicPairCode: p.publicPairCode,
      levelCode: p.levelCode as LevelCode,
      levelNameTh: level.nameTh,
      teamCode: p.teamCode as TeamCode,
      teamNameTh: team.nameTh,
      colorHex: team.colorHex,
      eventType: p.eventType as EventType | null,
      eventNameTh: p.eventType ? EVENT_TH[p.eventType as EventType] : null,
      slotNo: p.slotNo,
      withdrawn: p.withdrawn,
      players,
      label: players.map((pl) => pl.name).join(" / "),
      isPlaceholder,
    });
  }

  const sideView = (
    res: { pairUid: string | null; pendingLabel: string; teamCode: TeamCode | null },
  ): SideView => {
    const full = res.pairUid ? pairViews.get(res.pairUid) ?? null : null;
    // ตัด players ทิ้งตรงนี้ ดู MatchSidePair
    const pair: MatchSidePair | null = full ? (({ players: _players, ...rest }) => rest)(full) : null;
    const teamCode = pair?.teamCode ?? res.teamCode;
    const team = teamCode ? teamByCode.get(teamCode) : undefined;
    return {
      pair,
      pendingLabel: res.pendingLabel,
      teamCode: (teamCode as TeamCode | null) ?? null,
      teamNameTh: team?.nameTh ?? null,
      colorHex: team?.colorHex ?? null,
    };
  };

  const matchViews: MatchView[] = matches.map((m) => {
    const r = out.matches.get(m.matchUid)!;
    const level = levelByCode.get(m.levelCode)!;
    const sideA = sideView(r.sideA);
    const sideB = sideView(r.sideB);
    return {
      matchUid: m.matchUid,
      matchNo: m.matchNo,
      sourceMatchCode: m.sourceMatchCode,
      sideASource: m.sideASource,
      sideBSource: m.sideBSource,
      dayNo: m.dayNo,
      dayLabel: dayLabelByNo.get(m.dayNo) ?? `วันที่ ${m.dayNo}`,
      startTime: m.startTime,
      endTime: m.endTime,
      courtNo: m.courtNo,
      levelCode: m.levelCode as LevelCode,
      levelNameTh: level.nameTh,
      eventType: m.eventType as EventType | null,
      eventNameTh: m.eventType ? EVENT_TH[m.eventType as EventType] : null,
      phase: m.phase,
      bracket: m.bracket,
      roundLabel: m.roundLabel,
      groupKey: m.groupKey,
      tieId: m.tieId,
      tieOrderNo: m.tieOrderNo,
      sideA,
      sideB,
      games: r.decided || m.games.length > 0
        ? m.games.map((g) => ({ gameNo: g.gameNo, scoreA: g.scoreA, scoreB: g.scoreB })).sort((a, b) => a.gameNo - b.gameNo)
        : [],
      gamesWonA: r.gamesWonA,
      gamesWonB: r.gamesWonB,
      status: m.status,
      walkover: m.walkover,
      walkoverSide: m.walkoverSide,
      winnerPairUid: r.winnerPairUid,
      loserPairUid: r.loserPairUid,
      winnerSide: r.winnerSide,
      decided: r.decided,
      publicUpdatedAt: m.publicUpdatedAt ? m.publicUpdatedAt.toISOString() : null,
      adminNote: m.adminNote,
      scorable: Boolean(sideA.pair && sideB.pair),
    };
  });

  const tieViews: TieView[] = ties.map((t) => {
    const r = out.ties.get(t.tieId)!;
    const teamA = r.teamACode ? teamByCode.get(r.teamACode) : undefined;
    const teamB = r.teamBCode ? teamByCode.get(r.teamBCode) : undefined;
    return {
      ...r,
      tieNo: t.tieNo,
      stage: t.stage,
      phase: t.phase,
      dayNo: t.dayNo,
      dayLabel: dayLabelByNo.get(t.dayNo) ?? `วันที่ ${t.dayNo}`,
      startTime: t.startTime,
      courts: t.courts,
      requiredMatchWins: t.requiredMatchWins,
      matchNos: matches.filter((m) => m.tieId === t.tieId).map((m) => m.matchNo).sort((a, b) => a - b),
      teamANameTh: teamA?.nameTh ?? null,
      teamBNameTh: teamB?.nameTh ?? null,
      colorHexA: teamA?.colorHex ?? null,
      colorHexB: teamB?.colorHex ?? null,
    };
  });

  const toStandingView = (row: StandingRow, isTeamRow: boolean): StandingView => {
    if (isTeamRow) {
      const team = teamByCode.get(row.key);
      return {
        ...row,
        displayName: team?.nameTh ?? row.key,
        colorHex: team?.colorHex ?? null,
        teamNameTh: team?.nameTh ?? null,
      };
    }
    const pv = pairViews.get(row.key);
    const team = pv ? teamByCode.get(pv.teamCode) : undefined;
    return {
      ...row,
      displayName: pv?.label ?? row.key,
      colorHex: team?.colorHex ?? null,
      teamNameTh: team?.nameTh ?? null,
    };
  };

  const groupStandings = [...out.groupStandings.entries()]
    .map(([key, rows]) => {
      const [levelCode, groupKey] = key.split(":");
      return {
        key,
        levelCode: levelCode as LevelCode,
        groupKey,
        rows: rows.map((r) => toStandingView(r, false)),
      };
    })
    .sort((a, b) => a.key.localeCompare(b.key));

  // ── คะแนนสี + ที่มา ─────────────────────────────────────
  const eventsByTeam = new Map<string, ScoreEvent[]>();
  for (const e of out.scoreEvents) {
    if (!eventsByTeam.has(e.teamCode)) eventsByTeam.set(e.teamCode, []);
    eventsByTeam.get(e.teamCode)!.push(e);
  }
  const teamTotals: TeamTotalView[] = out.teamTotals.map((t) => {
    const team = teamByCode.get(t.teamCode)!;
    return {
      ...t,
      nameTh: team.nameTh,
      colorHex: team.colorHex,
      breakdown: (eventsByTeam.get(t.teamCode) ?? []).map((e) => ({
        levelCode: e.levelCode,
        levelNameTh: levelByCode.get(e.levelCode)?.nameTh ?? e.levelCode,
        category: e.category,
        categoryLabel: CATEGORY_LABEL[e.category] ?? e.category,
        result: e.result,
        points: e.points,
        medal: e.medal,
        countsTowardTotal: e.countsTowardTotal,
        pairLabel: e.pairUid ? pairViews.get(e.pairUid)?.label ?? null : null,
        sourceRef: e.sourceRef,
      })),
    };
  });

  // ── ความพร้อมของข้อมูล ───────────────────────────────────
  const allParticipants = pairs.flatMap((p) => p.participants);
  const drawTokensNeeded = new Set<string>();
  for (const m of matches) {
    for (const s of [m.sideASource, m.sideBSource]) {
      if (s.startsWith("SEED:") || s.startsWith("GROUP:")) drawTokensNeeded.add(s);
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    tournament: {
      tournamentId: tournament.tournamentId,
      titleTh: tournament.titleTh,
      yearBe: tournament.yearBe,
      venue: tournament.venue,
      startDate: tournament.startDate ? tournament.startDate.toISOString().slice(0, 10) : null,
      endDate: tournament.endDate ? tournament.endDate.toISOString().slice(0, 10) : null,
      datesConfirmed: Boolean(tournament.startDate && tournament.endDate),
      venueConfirmed: tournament.venueConfirmed && Boolean(tournament.venue),
      publicRefreshMs: tournament.publicRefreshMs,
      reportingMinutesBefore: tournament.reportingMinutesBefore,
      walkoverGraceMinutes: tournament.walkoverGraceMinutes,
      walkoverScore: tournament.walkoverScore,
      simulationEnabled: tournament.simulationEnabled,
    },
    days: days.map((d) => ({
      dayNo: d.dayNo,
      label: dayLabelByNo.get(d.dayNo) ?? d.labelTemp,
      actualDate: d.actualDate ? d.actualDate.toISOString().slice(0, 10) : null,
      confirmed: Boolean(d.actualDate),
    })),
    teams: teams.map((t) => ({
      teamCode: t.teamCode as TeamCode,
      nameTh: t.nameTh,
      colorHex: t.colorHex,
      displayOrder: t.displayOrder,
    })),
    levels: levels.map((l) => ({
      levelCode: l.levelCode as LevelCode,
      nameTh: l.nameTh,
      format: l.format,
      eligibility: l.eligibility,
      sortOrder: l.sortOrder,
      matchCount: l.matchCount,
      pairSlots: l.pairSlots,
    })),
    pairs: [...pairViews.values()].sort(
      (a, b) =>
        (levelByCode.get(a.levelCode)?.sortOrder ?? 0) - (levelByCode.get(b.levelCode)?.sortOrder ?? 0) ||
        (teamByCode.get(a.teamCode)?.displayOrder ?? 0) - (teamByCode.get(b.teamCode)?.displayOrder ?? 0) ||
        (a.eventType ?? "").localeCompare(b.eventType ?? "") ||
        a.slotNo - b.slotNo,
    ),
    matches: matchViews,
    ties: tieViews,
    groupStandings,
    level4Standings: out.level4Standings.map((r) => toStandingView(r, true)),
    teamTotals,
    readiness: {
      namesFilled: allParticipants.filter((p) => p.actualName).length,
      namesTotal: allParticipants.length,
      eventLocked: pairs.filter((p) => p.eventType).length,
      eventTotal: pairs.length,
      drawAssigned: draws.length,
      drawTotal: drawTokensNeeded.size,
      matchesCompleted: matchViews.filter((m) => m.decided).length,
      matchesTotal: matchViews.length,
      blockingOpen: checklist.filter((c) => c.blocking && c.status !== "READY").length,
    },
    warnings: out.warnings,
  };
}
