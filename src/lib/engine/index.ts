/**
 * เอนจินการแข่งขัน — ฟังก์ชันบริสุทธิ์ล้วน
 *
 * หน้าที่:
 *   1. แปลง "ที่มาของคู่" (SEED / GROUP / GROUP_RANK / WINNER / LOSER / LINEUP) เป็น pair_uid จริง
 *   2. คิดอันดับรอบแบ่งกลุ่ม (มือ D / มือ C) และอันดับสีรอบพบกันหมด (มือทั่วไป)
 *   3. ตัดสินผลคู่สีของมือทั่วไป (ชนะ 2 ใน 3 และต้องแข่งครบ 3)
 *   4. ออกคะแนนสีตามกติกา (รวมสูงสุด 37 คะแนน)
 *
 * ลำดับ match_no เป็น topological order อยู่แล้ว (ตรวจแล้วว่าไม่มีแมตช์ไหนอ้างถึงแมตช์ที่ยังไม่แข่ง)
 * จึงคำนวณจบได้ใน pass เดียว
 */

import type {
  EngineLineup,
  EngineMatch,
  EngineOutput,
  EnginePair,
  EngineScoringRule,
  EngineState,
  EngineTie,
  EngineTiebreak,
  LevelCode,
  MatchResult,
  ScoreEvent,
  Side,
  SideResolution,
  StandingRow,
  TeamCode,
  TeamTotal,
  TieResult,
} from "./types";

const TEAM_CODES: TeamCode[] = ["PUR", "GRN", "RED", "BLU"];

const LEVEL_SHORT: Record<string, LevelCode> = {
  L1: "LEVEL1",
  L2: "LEVEL2",
  L3: "LEVEL3",
  L4: "LEVEL4",
};

const EVENT_TH: Record<string, string> = { MD: "ชายคู่", WD: "หญิงคู่", XD: "คู่ผสม" };

const unresolved = (label: string, teamCode: TeamCode | null = null): SideResolution => ({
  pairUid: null,
  pendingLabel: label,
  teamCode,
});

const resolved = (pairUid: string, teamCode: TeamCode | null): SideResolution => ({
  pairUid,
  pendingLabel: "",
  teamCode,
});

/** คะแนน walkover ตามกติกา: 21-0, 21-0 */
const WALKOVER_GAMES = [
  { gameNo: 1, scoreA: 21, scoreB: 0 },
  { gameNo: 2, scoreA: 21, scoreB: 0 },
];

// ───────────────────────── ผลของแมตช์เดี่ยว ─────────────────────────

interface RawResult {
  gamesWonA: number;
  gamesWonB: number;
  pointsForA: number;
  pointsForB: number;
  winnerSide: Side | null;
  decided: boolean;
}

/** อ่านผลจากสกอร์ ไม่สนใจว่าใครเป็นคู่ไหน */
export function computeRawResult(match: EngineMatch): RawResult {
  const empty: RawResult = {
    gamesWonA: 0,
    gamesWonB: 0,
    pointsForA: 0,
    pointsForB: 0,
    winnerSide: null,
    decided: false,
  };

  if (match.status === "CANCELLED") return empty;

  if (match.status === "WALKOVER") {
    // ฝั่งที่ไม่มาแข่งเป็นฝั่งแพ้ ได้ 0-21, 0-21
    const loser = match.walkoverSide ?? "B";
    const winner: Side = loser === "A" ? "B" : "A";
    const w = WALKOVER_GAMES.reduce((s, g) => s + g.scoreA, 0);
    return {
      gamesWonA: winner === "A" ? 2 : 0,
      gamesWonB: winner === "B" ? 2 : 0,
      pointsForA: winner === "A" ? w : 0,
      pointsForB: winner === "B" ? w : 0,
      winnerSide: winner,
      decided: true,
    };
  }

  let gamesWonA = 0;
  let gamesWonB = 0;
  let pointsForA = 0;
  let pointsForB = 0;
  for (const g of [...match.games].sort((a, b) => a.gameNo - b.gameNo)) {
    pointsForA += g.scoreA;
    pointsForB += g.scoreB;
    if (g.scoreA > g.scoreB) gamesWonA += 1;
    else if (g.scoreB > g.scoreA) gamesWonB += 1;
  }

  const decided = match.status === "COMPLETED" && (gamesWonA === 2 || gamesWonB === 2);
  return {
    gamesWonA,
    gamesWonB,
    pointsForA,
    pointsForB,
    winnerSide: decided ? (gamesWonA > gamesWonB ? "A" : "B") : null,
    decided,
  };
}

// ───────────────────────── เอนจินหลัก ─────────────────────────

export function runEngine(state: EngineState): EngineOutput {
  const warnings: string[] = [];

  const pairByUid = new Map<string, EnginePair>(state.pairs.map((p) => [p.pairUid, p]));
  const drawByToken = new Map<string, string>(state.draws.map((d) => [d.token, d.pairUid]));
  const lineupByKey = new Map<string, EngineLineup>(
    state.lineups.map((l) => [`${l.tieId}|${l.teamCode}|${l.orderNo}`, l]),
  );
  const matches = [...state.matches].sort((a, b) => a.matchNo - b.matchNo);
  const matchByCode = new Map<string, EngineMatch>(matches.map((m) => [m.sourceMatchCode, m]));
  const tieById = new Map<string, EngineTie>(state.ties.map((t) => [t.tieId, t]));

  const results = new Map<string, MatchResult>();
  const resultByCode = new Map<string, MatchResult>();
  const tieResults = new Map<string, TieResult>();
  const groupStandings = new Map<string, StandingRow[]>();
  let level4Standings: StandingRow[] = [];
  let level4StandingsDone = false;

  const teamOf = (pairUid: string | null): TeamCode | null =>
    pairUid ? (pairByUid.get(pairUid)?.teamCode ?? null) : null;

  const matchRefLabel = (code: string): string => {
    const m = matchByCode.get(code);
    return m ? `แมตช์ #${m.matchNo}` : code;
  };

  // ── อันดับในกลุ่ม (มือ D / มือ C) ───────────────────────────
  function computeGroupStandings(levelCode: LevelCode, groupKey: string): StandingRow[] {
    const cacheKey = `${levelCode}:${groupKey}`;
    const cached = groupStandings.get(cacheKey);
    if (cached) return cached;

    const short = levelCode === "LEVEL2" ? "L2" : "L3";
    const slotTokens = [1, 2, 3, 4].map((n) => `GROUP:${short}:${groupKey}:SLOT${n}`);
    const pairUids = slotTokens
      .map((t) => drawByToken.get(t))
      .filter((x): x is string => Boolean(x));

    const rows = new Map<string, StandingRow>();
    for (const uid of pairUids) {
      rows.set(uid, blankRow(uid, teamOf(uid)));
    }

    const groupMatches = matches.filter(
      (m) =>
        m.levelCode === levelCode &&
        m.phase === "GROUP_STAGE" &&
        m.groupKey === groupKey,
    );

    const h2h = new Map<string, Set<string>>(); // ผู้ชนะ -> เซ็ตของผู้แพ้
    let allPlayed = groupMatches.length > 0;

    for (const m of groupMatches) {
      const r = results.get(m.matchUid);
      if (!r || !r.decided || !r.sideA.pairUid || !r.sideB.pairUid) {
        allPlayed = false;
        continue;
      }
      const a = rows.get(r.sideA.pairUid) ?? blankRow(r.sideA.pairUid, teamOf(r.sideA.pairUid));
      const b = rows.get(r.sideB.pairUid) ?? blankRow(r.sideB.pairUid, teamOf(r.sideB.pairUid));
      rows.set(a.key, a);
      rows.set(b.key, b);

      accumulate(a, r.gamesWonA, r.gamesWonB, r.pointsForA, r.pointsForB, r.winnerSide === "A");
      accumulate(b, r.gamesWonB, r.gamesWonA, r.pointsForB, r.pointsForA, r.winnerSide === "B");

      const winner = r.winnerSide === "A" ? r.sideA.pairUid : r.sideB.pairUid;
      const loser = r.winnerSide === "A" ? r.sideB.pairUid : r.sideA.pairUid;
      if (!h2h.has(winner)) h2h.set(winner, new Set());
      h2h.get(winner)!.add(loser);
    }

    const list = [...rows.values()];
    const ordered = rankRows(list, {
      h2h,
      tiebreak: findTiebreak(state.tiebreaks, "GROUP", cacheKey),
      fallbackOrder: (uid) => pairByUid.get(uid)?.slotNo ?? 99,
      onUnresolvedTie: (keys) =>
        warnings.push(
          `อันดับกลุ่ม ${groupKey} (${levelCode}) ยังเสมอกันแยกไม่ออก: ${keys.join(", ")} — ต้องให้กรรมการชี้ขาด`,
        ),
      final: allPlayed,
    });

    if (allPlayed) groupStandings.set(cacheKey, ordered);
    return ordered;
  }

  // ── อันดับสีของมือทั่วไป หลังรอบพบกันหมด ────────────────────
  function computeLevel4Standings(): StandingRow[] {
    if (level4StandingsDone) return level4Standings;

    const rrTies = state.ties.filter((t) => t.phase === "ROUND_ROBIN");
    const rows = new Map<string, StandingRow>(
      TEAM_CODES.map((tc) => [tc, blankRow(tc, tc)]),
    );
    const h2h = new Map<string, Set<string>>();
    let allDone = rrTies.length > 0;

    for (const t of rrTies) {
      const tr = tieResults.get(t.tieId);
      if (!tr || tr.status !== "COMPLETED" || !tr.teamACode || !tr.teamBCode) {
        allDone = false;
        continue;
      }
      const a = rows.get(tr.teamACode)!;
      const b = rows.get(tr.teamBCode)!;

      // "gamesWon" ระดับสี = จำนวนแมตช์ที่ชนะในคู่สีนั้น
      let ptsA = 0;
      let ptsB = 0;
      for (const no of t.matchNos) {
        const m = matches.find((x) => x.matchNo === no);
        const r = m ? results.get(m.matchUid) : undefined;
        if (r) {
          ptsA += r.pointsForA;
          ptsB += r.pointsForB;
        }
      }
      accumulate(a, tr.matchWinsA, tr.matchWinsB, ptsA, ptsB, tr.winnerTeamCode === tr.teamACode);
      accumulate(b, tr.matchWinsB, tr.matchWinsA, ptsB, ptsA, tr.winnerTeamCode === tr.teamBCode);

      if (tr.winnerTeamCode && tr.loserTeamCode) {
        if (!h2h.has(tr.winnerTeamCode)) h2h.set(tr.winnerTeamCode, new Set());
        h2h.get(tr.winnerTeamCode)!.add(tr.loserTeamCode);
      }
    }

    const ordered = rankRows([...rows.values()], {
      h2h,
      tiebreak: findTiebreak(state.tiebreaks, "L4_RR", "LEVEL4"),
      fallbackOrder: (tc) => TEAM_CODES.indexOf(tc as TeamCode),
      onUnresolvedTie: (keys) =>
        warnings.push(
          `อันดับสีมือทั่วไปยังเสมอกันแยกไม่ออก: ${keys.join(", ")} — ต้องใช้เกณฑ์ชี้ขาดของคณะกรรมการ`,
        ),
      final: allDone,
    });

    if (allDone) {
      level4Standings = ordered;
      level4StandingsDone = true;
    }
    return ordered;
  }

  /** แปลงชื่อสีปลายทางของคู่สี เช่น "PUR" / "RANK1" / "WINNER_T07" */
  function resolveTeamSource(source: string): { teamCode: TeamCode | null; label: string } {
    if ((TEAM_CODES as string[]).includes(source)) {
      return { teamCode: source as TeamCode, label: "" };
    }
    const rank = /^RANK([1-4])$/.exec(source);
    if (rank) {
      const n = Number(rank[1]);
      const st = computeLevel4Standings();
      const row = st.find((r) => r.rank === n);
      return level4StandingsDone && row
        ? { teamCode: row.key as TeamCode, label: "" }
        : { teamCode: null, label: `สีอันดับ ${n} รอบพบกันหมด` };
    }
    const ref = /^(WINNER|LOSER)_(T\d+)$/.exec(source);
    if (ref) {
      const tieId = `L4-${ref[2]}`;
      const tr = tieResults.get(tieId);
      const tie = tieById.get(tieId);
      const stage = tie ? tie.stage : tieId;
      const want = ref[1] === "WINNER" ? tr?.winnerTeamCode : tr?.loserTeamCode;
      return want
        ? { teamCode: want, label: "" }
        : { teamCode: null, label: `${ref[1] === "WINNER" ? "ผู้ชนะ" : "ผู้แพ้"} ${stage}` };
    }
    return { teamCode: null, label: source };
  }

  // ── ตัวแปลง token หลัก ─────────────────────────────────────
  function resolveSide(token: string, match: EngineMatch): SideResolution {
    // 1) จับสลากรอบแรกของมือใหม่
    if (token.startsWith("SEED:")) {
      const uid = drawByToken.get(token);
      if (uid) return resolved(uid, teamOf(uid));
      const [, , ev, no] = token.split(":");
      return unresolved(`รอจับสลาก · ${EVENT_TH[ev] ?? ev} สาย ${Number(no)}`);
    }

    // 2) ช่องในกลุ่ม
    if (token.startsWith("GROUP:")) {
      const uid = drawByToken.get(token);
      if (uid) return resolved(uid, teamOf(uid));
      const [, , g, slot] = token.split(":");
      return unresolved(`รอจับสลาก · กลุ่ม ${g} ${slot.replace("SLOT", "คู่ที่ ")}`);
    }

    // 3) อันดับจากรอบแบ่งกลุ่ม
    if (token.startsWith("GROUP_RANK:")) {
      const [, short, g, rankStr] = token.split(":");
      const levelCode = LEVEL_SHORT[short];
      const rank = Number(rankStr);
      const st = computeGroupStandings(levelCode, g);
      const isFinal = groupStandings.has(`${levelCode}:${g}`);
      const row = st.find((r) => r.rank === rank);
      if (isFinal && row) return resolved(row.key, row.teamCode);
      return unresolved(`อันดับ ${rank} กลุ่ม ${g}`);
    }

    // 4) ผู้ชนะ / ผู้แพ้ ของแมตช์ก่อนหน้า
    const ref = /^(WINNER|LOSER):(.+)$/.exec(token);
    if (ref) {
      const prev = resultByCode.get(ref[2]);
      const uid = ref[1] === "WINNER" ? prev?.winnerPairUid : prev?.loserPairUid;
      if (uid) return resolved(uid, teamOf(uid));
      const who = ref[1] === "WINNER" ? "ผู้ชนะ" : "ผู้แพ้";
      return unresolved(`${who}${matchRefLabel(ref[2])}`);
    }

    // 5) ซองส่งรายชื่อของมือทั่วไป
    if (token.startsWith("LINEUP:")) {
      const [, , tieShort, teamSource, orderStr] = token.split(":");
      const tieId = `L4-${tieShort}`;
      const orderNo = Number(orderStr.replace("ORDER", ""));
      const { teamCode, label } = resolveTeamSource(teamSource);
      if (!teamCode) return unresolved(`${label} · คู่ที่ ${orderNo}`);

      const lineup = lineupByKey.get(`${tieId}|${teamCode}|${orderNo}`);
      if (lineup) return resolved(lineup.pairUid, teamCode);
      return unresolved(`รอส่งซอง · คู่ที่ ${orderNo}`, teamCode);
    }

    return unresolved(token);
  }

  // ── pass เดียวตามลำดับ match_no ────────────────────────────
  for (const m of matches) {
    const sideA = resolveSide(m.sideASource, m);
    const sideB = resolveSide(m.sideBSource, m);
    const raw = computeRawResult(m);

    const winnerPairUid = raw.winnerSide === "A" ? sideA.pairUid : raw.winnerSide === "B" ? sideB.pairUid : null;
    const loserPairUid = raw.winnerSide === "A" ? sideB.pairUid : raw.winnerSide === "B" ? sideA.pairUid : null;

    const result: MatchResult = {
      matchUid: m.matchUid,
      matchNo: m.matchNo,
      sideA,
      sideB,
      gamesWonA: raw.gamesWonA,
      gamesWonB: raw.gamesWonB,
      pointsForA: raw.pointsForA,
      pointsForB: raw.pointsForB,
      winnerSide: raw.winnerSide,
      winnerPairUid,
      loserPairUid,
      decided: raw.decided,
    };
    results.set(m.matchUid, result);
    resultByCode.set(m.sourceMatchCode, result);

    if (raw.decided && !winnerPairUid) {
      warnings.push(
        `แมตช์ #${m.matchNo} มีผลแล้วแต่ยังไม่รู้ว่าเป็นคู่ไหน (${m.sideASource} / ${m.sideBSource}) — ตรวจการจับสลาก/ซองรายชื่อ`,
      );
    }

    // ปิดผลคู่สีทันทีที่แมตช์สุดท้ายของคู่สีนั้นถูกคำนวณ
    if (m.tieId) {
      const tie = tieById.get(m.tieId);
      if (tie && m.matchNo === Math.max(...tie.matchNos)) {
        tieResults.set(tie.tieId, buildTieResult(tie, matches, results, resolveTeamSource));
      }
    }
  }

  // คู่สีที่ยังไม่ครบ ก็ยังต้องมีสถานะให้หน้าเว็บแสดง
  for (const tie of state.ties) {
    if (!tieResults.has(tie.tieId)) {
      tieResults.set(tie.tieId, buildTieResult(tie, matches, results, resolveTeamSource));
    }
  }

  const l4 = computeLevel4Standings();

  // ── คะแนนสี ────────────────────────────────────────────────
  const scoreEvents = computeScoreEvents(
    matches,
    results,
    tieResults,
    state.scoringRules,
    pairByUid,
    warnings,
  );
  const teamTotals = computeTeamTotals(scoreEvents);

  // ── เตือนสิ่งที่ยังกรอกไม่ครบ ────────────────────────────────
  collectSetupWarnings(state, drawByToken, warnings);

  return {
    matches: results,
    groupStandings,
    level4Standings: l4,
    ties: tieResults,
    scoreEvents,
    teamTotals,
    warnings,
  };
}

// ───────────────────────── helpers ─────────────────────────

function blankRow(key: string, teamCode: TeamCode | null): StandingRow {
  return {
    key,
    teamCode,
    played: 0,
    won: 0,
    lost: 0,
    gamesWon: 0,
    gamesLost: 0,
    pointsWon: 0,
    pointsLost: 0,
    gameDiff: 0,
    pointDiff: 0,
    rank: null,
    rankReason: "",
  };
}

function accumulate(
  row: StandingRow,
  gamesWon: number,
  gamesLost: number,
  pointsWon: number,
  pointsLost: number,
  won: boolean,
): void {
  row.played += 1;
  row.won += won ? 1 : 0;
  row.lost += won ? 0 : 1;
  row.gamesWon += gamesWon;
  row.gamesLost += gamesLost;
  row.pointsWon += pointsWon;
  row.pointsLost += pointsLost;
  row.gameDiff = row.gamesWon - row.gamesLost;
  row.pointDiff = row.pointsWon - row.pointsLost;
}

function findTiebreak(
  tiebreaks: EngineTiebreak[],
  scope: EngineTiebreak["scope"],
  key: string,
): EngineTiebreak | undefined {
  return tiebreaks.find((t) => t.scope === scope && t.key === key);
}

interface RankOptions {
  h2h: Map<string, Set<string>>;
  tiebreak?: EngineTiebreak;
  fallbackOrder: (key: string) => number;
  onUnresolvedTie: (keys: string[]) => void;
  final: boolean;
}

/**
 * เกณฑ์จัดอันดับ (ใช้ทั้งรอบแบ่งกลุ่มและอันดับสีมือทั่วไป):
 *   1. ชนะมากกว่า
 *   2. ผลการเจอกันเองในกลุ่มที่เสมอกัน
 *   3. ผลต่างเกม
 *   4. ผลต่างแต้ม
 *   5. คำชี้ขาดของกรรมการ (ถ้าบันทึกไว้)
 * ถ้ายังแยกไม่ออก จะเรียงตามลำดับตั้งต้นและแจ้งเตือนให้กรรมการตัดสิน
 */
function rankRows(rows: StandingRow[], opt: RankOptions): StandingRow[] {
  const manual = opt.tiebreak?.order ?? [];
  const manualIndex = (k: string) => {
    const i = manual.indexOf(k);
    return i === -1 ? Number.MAX_SAFE_INTEGER : i;
  };

  const sorted = [...rows].sort((a, b) => {
    if (a.won !== b.won) return b.won - a.won;
    // เจอกันเอง (เฉพาะกรณีเสมอกันสองคู่/สองสี)
    const aBeatB = opt.h2h.get(a.key)?.has(b.key) ?? false;
    const bBeatA = opt.h2h.get(b.key)?.has(a.key) ?? false;
    if (aBeatB !== bBeatA) return aBeatB ? -1 : 1;
    if (a.gameDiff !== b.gameDiff) return b.gameDiff - a.gameDiff;
    if (a.pointDiff !== b.pointDiff) return b.pointDiff - a.pointDiff;
    const mi = manualIndex(a.key) - manualIndex(b.key);
    if (mi !== 0) return mi;
    return opt.fallbackOrder(a.key) - opt.fallbackOrder(b.key);
  });

  sorted.forEach((row, i) => {
    row.rank = opt.final ? i + 1 : null;
  });

  // หาคู่ที่แยกไม่ออกจริง ๆ เพื่อเตือน
  if (opt.final) {
    for (let i = 0; i < sorted.length - 1; i += 1) {
      const a = sorted[i];
      const b = sorted[i + 1];
      const sameStats =
        a.won === b.won && a.gameDiff === b.gameDiff && a.pointDiff === b.pointDiff;
      const h2hDecided =
        (opt.h2h.get(a.key)?.has(b.key) ?? false) || (opt.h2h.get(b.key)?.has(a.key) ?? false);
      const manualDecided = manualIndex(a.key) !== manualIndex(b.key);
      if (sameStats && !h2hDecided && !manualDecided) {
        opt.onUnresolvedTie([a.key, b.key]);
        a.rankReason = "เสมอกันทุกเกณฑ์ รอคำชี้ขาด";
        b.rankReason = "เสมอกันทุกเกณฑ์ รอคำชี้ขาด";
      } else if (sameStats && h2hDecided) {
        a.rankReason = a.rankReason || "ตัดสินด้วยผลเจอกันเอง";
      }
    }
  }

  return sorted;
}

function buildTieResult(
  tie: EngineTie,
  matches: EngineMatch[],
  results: Map<string, MatchResult>,
  resolveTeamSource: (s: string) => { teamCode: TeamCode | null; label: string },
): TieResult {
  const a = resolveTeamSource(tie.teamASource);
  const b = resolveTeamSource(tie.teamBSource);

  let matchWinsA = 0;
  let matchWinsB = 0;
  let played = 0;

  for (const no of tie.matchNos) {
    const m = matches.find((x) => x.matchNo === no);
    if (!m) continue;
    const r = results.get(m.matchUid);
    if (!r || !r.decided) continue;
    played += 1;
    if (r.winnerSide === "A") matchWinsA += 1;
    else if (r.winnerSide === "B") matchWinsB += 1;
  }

  const total = tie.matchNos.length;
  const status: TieResult["status"] = played === 0 ? "WAITING" : played < total ? "PLAYING" : "COMPLETED";

  // ชนะ 2 ใน 3 = รู้ผู้ชนะทันที แต่กติกาบังคับให้แข่งครบทั้ง 3 แมตช์
  let winnerTeamCode: TeamCode | null = null;
  let loserTeamCode: TeamCode | null = null;
  if (matchWinsA >= tie.requiredMatchWins) {
    winnerTeamCode = a.teamCode;
    loserTeamCode = b.teamCode;
  } else if (matchWinsB >= tie.requiredMatchWins) {
    winnerTeamCode = b.teamCode;
    loserTeamCode = a.teamCode;
  }

  return {
    tieId: tie.tieId,
    teamACode: a.teamCode,
    teamBCode: b.teamCode,
    pendingLabelA: a.label,
    pendingLabelB: b.label,
    matchWinsA,
    matchWinsB,
    playedCount: played,
    status,
    winnerTeamCode,
    loserTeamCode,
  };
}

// ───────────────────────── คะแนนสี ─────────────────────────

function computeScoreEvents(
  matches: EngineMatch[],
  results: Map<string, MatchResult>,
  ties: Map<string, TieResult>,
  rules: EngineScoringRule[],
  pairByUid: Map<string, EnginePair>,
  warnings: string[],
): ScoreEvent[] {
  const events: ScoreEvent[] = [];
  const ruleOf = (levelCode: string, category: string, result: string) =>
    rules.find((r) => r.levelCode === levelCode && r.category === category && r.result === result);

  const push = (
    levelCode: LevelCode,
    category: string,
    resultText: string,
    pairUid: string | null,
    sourceRef: string,
  ) => {
    if (!pairUid) return;
    const rule = ruleOf(levelCode, category, resultText);
    if (!rule) {
      warnings.push(`ไม่พบกติกาคะแนน: ${levelCode}/${category}/${resultText}`);
      return;
    }
    const teamCode = pairByUid.get(pairUid)?.teamCode;
    if (!teamCode) return;
    events.push({
      levelCode,
      category,
      result: resultText,
      teamCode,
      pairUid,
      points: rule.points,
      medal: rule.medal,
      countsTowardTotal: rule.countsTowardTotal,
      sourceRef,
    });
  };

  for (const m of matches) {
    const r = results.get(m.matchUid);
    if (!r || !r.decided) continue;

    const isFinal = m.roundLabel === "ชิงชนะเลิศ";
    const isThird = m.roundLabel === "ชิงอันดับ 3";
    if (!isFinal && !isThird) continue;

    if (m.levelCode === "LEVEL1" && m.eventType) {
      if (isFinal) {
        push("LEVEL1", m.eventType, "อันดับ 1", r.winnerPairUid, m.matchUid);
        push("LEVEL1", m.eventType, "อันดับ 2", r.loserPairUid, m.matchUid);
      } else {
        push("LEVEL1", m.eventType, "อันดับ 3", r.winnerPairUid, m.matchUid);
      }
      continue;
    }

    if (m.levelCode === "LEVEL2" || m.levelCode === "LEVEL3") {
      if (m.bracket === "UPPER") {
        if (isFinal) {
          push(m.levelCode, "UPPER", "อันดับ 1", r.winnerPairUid, m.matchUid);
          push(m.levelCode, "UPPER", "อันดับ 2", r.loserPairUid, m.matchUid);
        } else {
          push(m.levelCode, "UPPER", "อันดับ 3", r.winnerPairUid, m.matchUid);
        }
      } else if (m.bracket === "LOWER") {
        if (isFinal) {
          push(m.levelCode, "LOWER", "ชนะเลิศสายล่าง", r.winnerPairUid, m.matchUid);
        } else {
          // คงแมตช์ไว้ แต่ 0 คะแนนและไม่มีอันดับ — บันทึกไว้เพื่อความโปร่งใส
          push(m.levelCode, "LOWER", "ชิงอันดับ 3 สายล่าง", r.winnerPairUid, m.matchUid);
        }
      }
    }
  }

  // มือทั่วไป: อันดับ 1/2 จากคู่สีชิงชนะเลิศ, อันดับ 3 = ผู้แพ้ Qualifier 2
  const finalTie = [...ties.values()].find((t) => t.tieId === "L4-T10");
  if (finalTie?.status === "COMPLETED" && finalTie.winnerTeamCode && finalTie.loserTeamCode) {
    pushTeam(events, rules, warnings, "LEVEL4", "TEAM", "อันดับ 1", finalTie.winnerTeamCode, finalTie.tieId);
    pushTeam(events, rules, warnings, "LEVEL4", "TEAM", "อันดับ 2", finalTie.loserTeamCode, finalTie.tieId);
  }
  const q2 = [...ties.values()].find((t) => t.tieId === "L4-T09");
  if (q2?.status === "COMPLETED" && q2.loserTeamCode) {
    pushTeam(events, rules, warnings, "LEVEL4", "TEAM", "อันดับ 3", q2.loserTeamCode, q2.tieId);
  }

  return events;
}

function pushTeam(
  events: ScoreEvent[],
  rules: EngineScoringRule[],
  warnings: string[],
  levelCode: LevelCode,
  category: string,
  resultText: string,
  teamCode: TeamCode,
  sourceRef: string,
): void {
  const rule = rules.find(
    (r) => r.levelCode === levelCode && r.category === category && r.result === resultText,
  );
  if (!rule) {
    warnings.push(`ไม่พบกติกาคะแนน: ${levelCode}/${category}/${resultText}`);
    return;
  }
  events.push({
    levelCode,
    category,
    result: resultText,
    teamCode,
    pairUid: null,
    points: rule.points,
    medal: rule.medal,
    countsTowardTotal: rule.countsTowardTotal,
    sourceRef,
  });
}

/** เกณฑ์เสมอคะแนนสีรวม: เหรียญทอง > เหรียญเงิน > เหรียญทองแดง */
export function computeTeamTotals(events: ScoreEvent[]): TeamTotal[] {
  const totals = new Map<TeamCode, TeamTotal>(
    TEAM_CODES.map((tc) => [tc, { teamCode: tc, points: 0, gold: 0, silver: 0, bronze: 0, rank: 0 }]),
  );

  for (const e of events) {
    const t = totals.get(e.teamCode);
    if (!t) continue;
    if (e.countsTowardTotal) t.points += e.points;
    if (e.medal === "ทอง") t.gold += 1;
    else if (e.medal === "เงิน") t.silver += 1;
    else if (e.medal === "ทองแดง") t.bronze += 1;
  }

  const list = [...totals.values()].sort(
    (a, b) =>
      b.points - a.points ||
      b.gold - a.gold ||
      b.silver - a.silver ||
      b.bronze - a.bronze ||
      TEAM_CODES.indexOf(a.teamCode) - TEAM_CODES.indexOf(b.teamCode),
  );
  list.forEach((t, i) => {
    t.rank = i + 1;
  });
  return list;
}

function collectSetupWarnings(
  state: EngineState,
  drawByToken: Map<string, string>,
  warnings: string[],
): void {
  const needed = new Set<string>();
  for (const m of state.matches) {
    for (const s of [m.sideASource, m.sideBSource]) {
      if (s.startsWith("SEED:") || s.startsWith("GROUP:")) needed.add(s);
    }
  }
  const missing = [...needed].filter((t) => !drawByToken.has(t));
  if (missing.length > 0) {
    warnings.push(`ยังไม่ได้จับสลาก ${missing.length} ช่อง จากทั้งหมด ${needed.size} ช่อง`);
  }

  const pairsMissingEvent = state.pairs.filter((p) => !p.eventType);
  if (pairsMissingEvent.length > 0) {
    warnings.push(`ยังไม่ได้ล็อกประเภท MD/WD/XD อีก ${pairsMissingEvent.length} คู่`);
  }
}
