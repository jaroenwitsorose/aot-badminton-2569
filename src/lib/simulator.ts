/**
 * โหมดจำลอง — สุ่มผลให้ครบทั้ง 158 แมตช์เพื่อซ้อมระบบก่อนแข่งจริง
 *
 * ตรงกับรายการ Checklist "จำลองครบ 158 แมตช์แล้วคืนค่าก่อนแข่ง"
 * ใช้เอนจินตัวเดียวกับหน้าเว็บจริง จึงเป็นการทดสอบเส้นทางเดียวกับการแข่งจริงทั้งหมด
 *
 * ทำงานได้เฉพาะเมื่อเปิด simulation_enabled และผู้เรียกเป็นหัวหน้าผู้ดูแลเท่านั้น
 * ตรวจสิทธิ์ที่ฝั่ง action ก่อนเรียกฟังก์ชันนี้เสมอ — ฟังก์ชันนี้ไม่ตรวจเอง
 */

import { prisma } from "./prisma";
import { runEngine } from "./engine";
import type {
  EngineDraw,
  EngineLineup,
  EngineMatch,
  EngineState,
  EventType,
  LevelCode,
  TeamCode,
} from "./engine/types";

const RANK_ORDER: Record<string, number> = { NEW: 0, D: 1, C: 2, B_MINUS: 3, B_PLUS: 4, A: 5, S: 6 };

export interface SimulationOutcome {
  matchesFilled: number;
  drawsCreated: number;
  lineupsCreated: number;
  walkovers: number;
}

/** สกอร์ Best of 3 ที่ถูกกติกา: ชนะที่ 21 ต้องห่าง 2 แต้ม */
function randomBestOfThree(): { gameNo: number; scoreA: number; scoreB: number }[] {
  const games: { gameNo: number; scoreA: number; scoreB: number }[] = [];
  let winsA = 0;
  let winsB = 0;
  let gameNo = 1;
  while (winsA < 2 && winsB < 2) {
    const aWins = Math.random() < 0.5;
    const loserScore = Math.floor(Math.random() * 20); // 0..19 -> 21-x ห่างอย่างน้อย 2 เสมอ
    games.push({ gameNo, scoreA: aWins ? 21 : loserScore, scoreB: aWins ? loserScore : 21 });
    if (aWins) winsA += 1;
    else winsB += 1;
    gameNo += 1;
  }
  return games;
}

function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export async function simulateAllResults(actorId: string): Promise<SimulationOutcome> {
  const [pairsRaw, matchesRaw, tiesRaw, drawsRaw, lineupsRaw, rulesRaw, tiebreaksRaw] = await Promise.all([
    prisma.pair.findMany({ include: { participants: true } }),
    prisma.match.findMany({ include: { games: true }, orderBy: { matchNo: "asc" } }),
    prisma.level4Tie.findMany({ orderBy: { tieNo: "asc" } }),
    prisma.drawAssignment.findMany(),
    prisma.level4Lineup.findMany(),
    prisma.colorScoringRule.findMany(),
    prisma.tiebreakDecision.findMany(),
  ]);

  const state: EngineState = {
    pairs: pairsRaw.map((p) => ({
      pairUid: p.pairUid,
      levelCode: p.levelCode as LevelCode,
      teamCode: p.teamCode as TeamCode,
      slotNo: p.slotNo,
      eventType: p.eventType as EventType | null,
      withdrawn: p.withdrawn,
    })),
    matches: matchesRaw.map((m) => ({
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
    ties: tiesRaw.map((t) => ({
      tieId: t.tieId,
      tieNo: t.tieNo,
      phase: t.phase,
      stage: t.stage,
      dayNo: t.dayNo,
      startTime: t.startTime,
      teamASource: t.teamASource,
      teamBSource: t.teamBSource,
      matchNos: matchesRaw.filter((m) => m.tieId === t.tieId).map((m) => m.matchNo).sort((a, b) => a - b),
      requiredMatchWins: t.requiredMatchWins,
      playAllThree: t.playAllThree,
    })),
    draws: drawsRaw.map((d) => ({ token: d.token, pairUid: d.pairUid })),
    lineups: lineupsRaw.map((l) => ({
      tieId: l.tieId,
      teamCode: l.teamCode as TeamCode,
      orderNo: l.orderNo,
      pairUid: l.pairUid,
    })),
    scoringRules: rulesRaw.map((r) => ({
      levelCode: r.levelCode as LevelCode,
      category: r.category,
      result: r.result,
      points: r.points,
      medal: r.medal,
      countsTowardTotal: r.countsTowardTotal,
    })),
    tiebreaks: tiebreaksRaw.map((t) => ({
      scope: t.scope as "GROUP" | "L4_RR",
      key: t.key,
      order: t.orderedKeys,
    })),
  };

  // ── 1. จับสลากอัตโนมัติเฉพาะช่องที่ยังว่าง ──────────────────
  const assignedTokens = new Set(state.draws.map((d) => d.token));
  const assignedPairs = new Set(state.draws.map((d) => d.pairUid));
  const neededTokens = new Set<string>();
  for (const m of state.matches) {
    for (const s of [m.sideASource, m.sideBSource]) {
      if (s.startsWith("SEED:") || s.startsWith("GROUP:")) neededTokens.add(s);
    }
  }

  const newDraws: EngineDraw[] = [];
  const pools = new Map<string, string[]>();
  const poolKey = (levelCode: string, eventType: string | null) =>
    levelCode === "LEVEL1" ? `LEVEL1:${eventType}` : levelCode;
  for (const p of state.pairs) {
    if (p.withdrawn || assignedPairs.has(p.pairUid)) continue;
    const key = poolKey(p.levelCode, p.eventType);
    if (!pools.has(key)) pools.set(key, []);
    pools.get(key)!.push(p.pairUid);
  }
  for (const [key, list] of pools) pools.set(key, shuffle(list));

  const LEVEL_OF_SHORT: Record<string, LevelCode> = { L1: "LEVEL1", L2: "LEVEL2", L3: "LEVEL3", L4: "LEVEL4" };
  for (const token of [...neededTokens].sort()) {
    if (assignedTokens.has(token)) continue;
    const parts = token.split(":");
    const levelCode = LEVEL_OF_SHORT[parts[1]];
    const key = levelCode === "LEVEL1" ? `LEVEL1:${parts[2]}` : levelCode;
    const pairUid = pools.get(key)?.pop();
    if (!pairUid) throw new Error(`คู่แข่งขันไม่พอสำหรับช่อง ${token} — ตรวจการล็อกประเภทและการถอนตัว`);
    newDraws.push({ token, pairUid });
    state.draws.push({ token, pairUid });
  }

  // ── 2. เดินการแข่งขันจนครบ ─────────────────────────────────
  const matchByUid = new Map<string, EngineMatch>(state.matches.map((m) => [m.matchUid, m]));
  const pairByUid = new Map(state.pairs.map((p) => [p.pairUid, p]));
  const rankOfPair = new Map<string, number>();
  for (const p of pairsRaw) {
    const known = p.participants
      .map((x) => (x.skillRank ? RANK_ORDER[x.skillRank] ?? -1 : -1))
      .filter((v) => v >= 0);
    rankOfPair.set(p.pairUid, known.length ? Math.max(...known) : 0);
  }

  const newLineups: EngineLineup[] = [];
  const touchedMatches = new Set<string>();
  let rounds = 0;

  for (;;) {
    rounds += 1;
    if (rounds > 200) throw new Error("จำลองไม่จบ — เอนจินคลี่สายไม่ได้ ตรวจข้อมูลตั้งต้น");

    let out = runEngine(state);

    // ส่งซองอัตโนมัติให้คู่สีที่รู้สีแล้วแต่ยังไม่มีซอง
    let added = false;
    for (const tie of state.ties) {
      const tr = out.ties.get(tie.tieId);
      for (const teamCode of [tr?.teamACode, tr?.teamBCode]) {
        if (!teamCode) continue;
        if (state.lineups.some((l) => l.tieId === tie.tieId && l.teamCode === teamCode)) continue;
        const teamPairs = state.pairs
          .filter((p) => p.levelCode === "LEVEL4" && p.teamCode === teamCode && !p.withdrawn)
          // คู่ที่ 1 ต้องระดับมือไม่ต่ำกว่าคู่ที่ 2 และ 3
          .sort((a, b) => (rankOfPair.get(b.pairUid) ?? 0) - (rankOfPair.get(a.pairUid) ?? 0))
          .slice(0, 3);
        if (teamPairs.length < 3) continue;
        teamPairs.forEach((p, idx) => {
          const row = { tieId: tie.tieId, teamCode, orderNo: idx + 1, pairUid: p.pairUid };
          state.lineups.push(row);
          newLineups.push(row);
        });
        added = true;
      }
    }
    if (added) out = runEngine(state);

    const playable = state.matches.filter((m) => {
      const r = out.matches.get(m.matchUid)!;
      return !r.decided && r.sideA.pairUid && r.sideB.pairUid && m.status !== "CANCELLED";
    });
    if (playable.length === 0) break;

    for (const m of playable) {
      const match = matchByUid.get(m.matchUid)!;
      match.status = "COMPLETED";
      match.walkover = false;
      match.walkoverSide = null;
      match.games = randomBestOfThree();
      touchedMatches.add(match.matchUid);
    }
  }

  const finalOut = runEngine(state);
  const stillOpen = state.matches.filter((m) => !finalOut.matches.get(m.matchUid)!.decided);
  if (stillOpen.length > 0) {
    throw new Error(
      `จำลองไม่ครบ เหลือ ${stillOpen.length} แมตช์ที่คลี่สายไม่ได้ (#${stillOpen.map((m) => m.matchNo).join(", #")})`,
    );
  }
  void pairByUid;

  // ── 3. เขียนลงฐานข้อมูลครั้งเดียว ───────────────────────────
  //
  // เดิมโค้ดนี้ลูปทีละแมตช์ (deleteMany + createMany + update ต่อแมตช์ = ได้ query ~470
  // ครั้งใน transaction เดียว) ซึ่งเกิน timeout เริ่มต้นของ Prisma interactive transaction
  // (5 วินาที) เกือบทุกครั้งเมื่อรันข้าม region จริง (Vercel -> Neon) ทำให้ "จำลองผลไม่ได้"
  // แก้โดยรวมเป็น query เดียวต่อชนิดการเขียน (payload ของทุกแมตช์ที่แก้เหมือนกันหมด
  // จึงใช้ updateMany ได้ ไม่จำเป็นต้อง update ทีละแถว)
  const now = new Date();
  const touchedIds = [...touchedMatches];
  const allGameRows = touchedIds.flatMap((uid) => {
    const m = matchByUid.get(uid)!;
    return m.games.map((g) => ({ matchUid: uid, gameNo: g.gameNo, scoreA: g.scoreA, scoreB: g.scoreB }));
  });

  await prisma.$transaction(
    async (tx) => {
      if (newDraws.length > 0) {
        await tx.drawAssignment.createMany({
          data: newDraws.map((d) => {
            const parts = d.token.split(":");
            return {
              token: d.token,
              levelCode: LEVEL_OF_SHORT[parts[1]],
              groupKey: parts[0] === "GROUP" ? parts[2] : null,
              slotNo: parts[0] === "GROUP" ? Number(parts[3].replace("SLOT", "")) : Number(parts[3]),
              pairUid: d.pairUid,
              assignedBy: actorId,
            };
          }),
        });
      }
      if (newLineups.length > 0) {
        await tx.level4Lineup.createMany({ data: newLineups });
      }

      if (touchedIds.length > 0) {
        await tx.matchGame.deleteMany({ where: { matchUid: { in: touchedIds } } });
        await tx.matchGame.createMany({ data: allGameRows });
        await tx.match.updateMany({
          where: { matchUid: { in: touchedIds } },
          data: {
            status: "COMPLETED",
            walkover: false,
            walkoverSide: null,
            publicUpdatedAt: now,
            updatedById: actorId,
            adminNote: "ผลจากโหมดจำลอง — ต้องล้างก่อนแข่งจริง",
          },
        });
      }

      await tx.auditLog.create({
        data: {
          actorId,
          action: "SIMULATION_RUN",
          entityType: "tournament",
          entityId: "ALL",
          afterJson: {
            matchesFilled: touchedMatches.size,
            drawsCreated: newDraws.length,
            lineupsCreated: newLineups.length,
          },
        },
      });
    },
    { timeout: 30000, maxWait: 10000 },
  );

  return {
    matchesFilled: touchedMatches.size,
    drawsCreated: newDraws.length,
    lineupsCreated: newLineups.length,
    walkovers: 0,
  };
}
