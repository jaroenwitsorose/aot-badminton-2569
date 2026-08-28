/**
 * จำลองการแข่งขันครบทั้ง 158 แมตช์แบบไม่ต้องต่อฐานข้อมูล
 *
 * ตรงกับรายการ Checklist: "จำลองครบ 158 แมตช์แล้วคืนค่าก่อนแข่ง"
 * ใช้ตรวจว่าเอนจินคลี่สายได้ครบทุกช่อง ออกคะแนนสีถูก และยอดรวมตรงกับกติกา
 *
 *   npm run simulate            # เมล็ดสุ่มค่าเริ่มต้น
 *   npm run simulate -- 12345   # กำหนดเมล็ดสุ่มเอง (ผลซ้ำได้)
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { runEngine } from "../src/lib/engine";
import type {
  EngineDraw,
  EngineLineup,
  EngineMatch,
  EngineState,
  EventType,
  TeamCode,
} from "../src/lib/engine/types";
import { buildEngineStateFromSeed, loadSeedFile } from "../src/lib/seed-data";
import {
  BASE_TOTAL_POINTS,
  PLAYOFF_CONSOLATION_POINTS,
  PLAYOFF_CONSOLATION_RESULT,
  PLAYOFF_TIE_COUNT,
} from "../src/lib/engine/scoring-constants";

const here = path.dirname(fileURLToPath(import.meta.url));
const seedPath = path.join(here, "..", "data", "seed-data.json");

// ── ตัวสุ่มแบบกำหนดเมล็ดได้ เพื่อให้ผลการทดสอบซ้ำได้ ──
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

let failures = 0;
function check(label: string, ok: boolean, detail = ""): void {
  if (ok) {
    console.log(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function main(): void {
  const seedArg = Number(process.argv[2] ?? 20569);
  const rng = makeRng(seedArg);
  const seed = loadSeedFile(readFileSync(seedPath, "utf-8"));
  const state: EngineState = buildEngineStateFromSeed(seed);

  console.log(`\nจำลองการแข่งขัน (เมล็ดสุ่ม = ${seedArg})`);
  console.log("─".repeat(64));

  // ── 1. จับสลากอัตโนมัติทุกช่อง ──────────────────────────────
  // มือ C / มือทั่วไป ยังไม่ล็อกประเภท จึงกำหนดให้ก่อนเพื่อให้ครบเงื่อนไข
  const eventCycle: EventType[] = ["MD", "WD", "XD"];
  state.pairs.forEach((p, i) => {
    if (!p.eventType) p.eventType = eventCycle[i % 3];
  });

  const draws: EngineDraw[] = [];
  const tokensNeeded = new Set<string>();
  for (const m of state.matches) {
    for (const s of [m.sideASource, m.sideBSource]) {
      if (s.startsWith("SEED:") || s.startsWith("GROUP:")) tokensNeeded.add(s);
    }
  }
  // จัดคู่เข้าช่องแบบสลับสีให้ไม่เจอสีเดียวกันเองมากเกินไป
  const poolByLevel = new Map<string, string[]>();
  for (const p of state.pairs) {
    const key = p.levelCode === "LEVEL1" ? `LEVEL1:${p.eventType}` : p.levelCode;
    if (!poolByLevel.has(key)) poolByLevel.set(key, []);
    poolByLevel.get(key)!.push(p.pairUid);
  }
  for (const list of poolByLevel.values()) shuffle(list, rng);

  for (const token of [...tokensNeeded].sort()) {
    const parts = token.split(":");
    const levelCode = { L1: "LEVEL1", L2: "LEVEL2", L3: "LEVEL3", L4: "LEVEL4" }[parts[1]]!;
    const key = levelCode === "LEVEL1" ? `LEVEL1:${parts[2]}` : levelCode;
    const pool = poolByLevel.get(key);
    const pairUid = pool?.pop();
    if (!pairUid) throw new Error(`คู่ไม่พอสำหรับช่อง ${token}`);
    draws.push({ token, pairUid });
  }
  state.draws = draws;
  check(`จับสลากครบทุกช่อง (${draws.length} ช่อง)`, draws.length === tokensNeeded.size);

  // ── 2. เดินการแข่งขัน ─────────────────────────────────────
  const matchByUid = new Map<string, EngineMatch>(state.matches.map((m) => [m.matchUid, m]));
  const l4PairsByTeam = new Map<TeamCode, string[]>();
  for (const p of state.pairs) {
    if (p.levelCode !== "LEVEL4") continue;
    if (!l4PairsByTeam.has(p.teamCode)) l4PairsByTeam.set(p.teamCode, []);
    l4PairsByTeam.get(p.teamCode)!.push(p.pairUid);
  }

  const lineups: EngineLineup[] = [];
  // ทดสอบเส้นทาง walkover หนึ่งแมตช์ — อ้างด้วย matchUid ซึ่งเป็นคีย์ถาวร
  // (เลขแมตช์เรียงใหม่ได้เมื่อจัดตารางใหม่ ใช้อ้างอิงในเทสต์ไม่ได้)
  const walkoverMatchUid = "MATCH-0060";
  let rounds = 0;

  for (;;) {
    rounds += 1;
    if (rounds > 200) throw new Error("วนไม่จบ — เอนจินอาจคลี่สายไม่ได้");

    let out = runEngine(state);

    // ส่งซองให้ทุกคู่สีที่รู้สีแล้วแต่ยังไม่มีซอง
    let addedLineup = false;
    for (const tie of state.ties) {
      const tr = out.ties.get(tie.tieId);
      for (const teamCode of [tr?.teamACode, tr?.teamBCode]) {
        if (!teamCode) continue;
        const already = lineups.some((l) => l.tieId === tie.tieId && l.teamCode === teamCode);
        if (already) continue;
        const pool = l4PairsByTeam.get(teamCode) ?? [];
        pool.forEach((pairUid, idx) => {
          lineups.push({ tieId: tie.tieId, teamCode, orderNo: idx + 1, pairUid });
        });
        addedLineup = true;
      }
    }
    if (addedLineup) {
      state.lineups = lineups;
      out = runEngine(state);
    }

    const playable = state.matches.filter((m) => {
      const r = out.matches.get(m.matchUid)!;
      return !r.decided && r.sideA.pairUid && r.sideB.pairUid;
    });
    if (playable.length === 0) break;

    for (const m of playable) {
      const match = matchByUid.get(m.matchUid)!;
      if (match.matchUid === walkoverMatchUid) {
        match.status = "WALKOVER";
        match.walkover = true;
        match.walkoverSide = "B";
        match.games = [];
      } else {
        match.status = "COMPLETED";
        match.games = randomBestOfThree(rng);
      }
    }
  }

  const out = runEngine(state);

  // ── 3. ตรวจผล ─────────────────────────────────────────────
  console.log("\nผลการตรวจ");
  console.log("─".repeat(64));

  const undecided = state.matches.filter((m) => !out.matches.get(m.matchUid)!.decided);
  check(
    "ทุกแมตช์ (158) แข่งจบและตัดสินได้",
    undecided.length === 0,
    undecided.length ? `ค้าง ${undecided.length} แมตช์: #${undecided.map((m) => m.matchNo).join(", #")}` : "",
  );

  const unresolved = state.matches.filter((m) => {
    const r = out.matches.get(m.matchUid)!;
    return !r.sideA.pairUid || !r.sideB.pairUid;
  });
  check(
    "คลี่สายได้ครบทุกช่อง (ทุกฝั่งรู้ว่าเป็นคู่ไหน)",
    unresolved.length === 0,
    unresolved.length ? `ค้าง #${unresolved.map((m) => m.matchNo).join(", #")}` : "",
  );

  const completedTies = [...out.ties.values()].filter((t) => t.status === "COMPLETED");
  check("คู่สีมือทั่วไปจบครบ 10 ชุด", completedTies.length === 10, `จบ ${completedTies.length}`);
  check(
    "ทุกคู่สีแข่งครบทั้ง 3 แมตช์",
    completedTies.every((t) => t.playedCount === 3),
  );
  check(
    "ทุกคู่สีมีผู้ชนะที่ชนะอย่างน้อย 2 ใน 3",
    completedTies.every(
      (t) => Math.max(t.matchWinsA, t.matchWinsB) >= 2 && t.winnerTeamCode !== null,
    ),
  );

  // โบนัสปลอบใจแจกตามผล จึงตรวจว่า "คะแนนหลัก 37 + โบนัสที่แจกจริง" ตรงกัน
  const totalPoints = out.teamTotals.reduce((s, t) => s + t.points, 0);
  const consolationAwards = out.scoreEvents.filter((e) => e.result === PLAYOFF_CONSOLATION_RESULT);
  const expected = BASE_TOTAL_POINTS + consolationAwards.length * PLAYOFF_CONSOLATION_POINTS;
  check(
    `คะแนนสีรวม = คะแนนหลัก ${BASE_TOTAL_POINTS} + โบนัสปลอบใจ ${consolationAwards.length} ครั้ง`,
    Math.abs(totalPoints - expected) < 1e-9,
    `ได้ ${totalPoints} ควรเป็น ${expected}`,
  );
  check(
    `โบนัสปลอบใจแจกไม่เกิน ${PLAYOFF_TIE_COUNT} ครั้ง (คู่สี Playoff มี ${PLAYOFF_TIE_COUNT} ชุด)`,
    consolationAwards.length <= PLAYOFF_TIE_COUNT,
    `แจก ${consolationAwards.length} ครั้ง`,
  );
  check(
    "โบนัสปลอบใจแจกให้สีที่แพ้คู่สีแต่ชนะได้อย่างน้อย 1 คู่เท่านั้น",
    consolationAwards.every((e) => {
      const tie = out.ties.get(e.sourceRef);
      if (!tie || tie.phase !== "PAGE_PLAYOFF" || tie.loserTeamCode !== e.teamCode) return false;
      const wins = tie.loserTeamCode === tie.teamACode ? tie.matchWinsA : tie.matchWinsB;
      return wins >= 1 && wins < 2;
    }),
    consolationAwards.map((e) => `${e.teamCode}@${e.sourceRef}`).join(", "),
  );

  const gold = out.teamTotals.reduce((s, t) => s + t.gold, 0);
  const silver = out.teamTotals.reduce((s, t) => s + t.silver, 0);
  const bronze = out.teamTotals.reduce((s, t) => s + t.bronze, 0);
  // เหรียญ: มือใหม่ 3 ประเภท + สายบนมือ D + สายบนมือ C + มือทั่วไป = 6 ชุด
  check("เหรียญทองครบ 6 ชุด", gold === 6, `ได้ ${gold}`);
  check("เหรียญเงินครบ 6 ชุด", silver === 6, `ได้ ${silver}`);
  check("เหรียญทองแดงครบ 6 ชุด", bronze === 6, `ได้ ${bronze}`);

  const lowerChampions = out.scoreEvents.filter((e) => e.result === "ชนะเลิศสายล่าง");
  check("ชนะเลิศสายล่างมี 2 รายการ (มือ D + มือ C) ได้สีละ 0.5", lowerChampions.length === 2);
  const lowerThird = out.scoreEvents.filter((e) => e.result === "ชิงอันดับ 3 สายล่าง");
  check(
    "ชิงอันดับ 3 สายล่างบันทึกไว้แต่ไม่นับคะแนน",
    lowerThird.length === 2 && lowerThird.every((e) => !e.countsTowardTotal && e.points === 0),
  );

  const groupsDone = [...out.groupStandings.keys()].sort();
  check("จัดอันดับรอบแบ่งกลุ่มครบ 8 กลุ่ม", groupsDone.length === 8, groupsDone.join(", "));
  check(
    "แต่ละกลุ่มมี 4 คู่ และแข่งคู่ละ 3 นัด",
    [...out.groupStandings.values()].every(
      (rows) => rows.length === 4 && rows.every((r) => r.played === 3),
    ),
  );

  check(
    "จัดอันดับสีของมือทั่วไปครบ 4 สี",
    out.level4Standings.length === 4 && out.level4Standings.every((r) => r.rank !== null),
  );

  const wo = out.matches.get(walkoverMatchUid)!;
  check(
    "แมตช์ walkover ตัดสินให้ฝั่งที่มาแข่งชนะ 21-0, 21-0",
    wo.decided && wo.winnerSide === "A" && wo.pointsForA === 42 && wo.pointsForB === 0,
  );

  const blockingWarnings = out.warnings.filter((w) => !w.includes("ล็อกประเภท"));
  check(
    "ไม่มีคำเตือนค้างหลังแข่งจบ",
    blockingWarnings.length === 0,
    blockingWarnings.join(" | "),
  );

  // ── 4. สรุปคะแนนสี ────────────────────────────────────────
  console.log("\nคะแนนสีเมื่อจบการแข่งขัน (ผลจากการสุ่ม)");
  console.log("─".repeat(64));
  const teamName: Record<string, string> = { PUR: "ม่วง", GRN: "เขียว", RED: "แดง", BLU: "น้ำเงิน" };
  for (const t of out.teamTotals) {
    console.log(
      `  ${t.rank}. ${teamName[t.teamCode].padEnd(8)} ${String(t.points).padStart(5)} คะแนน` +
        `   ทอง ${t.gold}  เงิน ${t.silver}  ทองแดง ${t.bronze}`,
    );
  }

  console.log("\n" + "─".repeat(64));
  if (failures === 0) {
    console.log("ผ่านทั้งหมด ✓  เอนจินรองรับการแข่งขันจริงได้ครบทั้ง 158 แมตช์\n");
  } else {
    console.log(`ไม่ผ่าน ${failures} ข้อ\n`);
    process.exitCode = 1;
  }
}

function shuffle<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/** สร้างสกอร์ Best of 3 ที่ถูกกติกา (ชนะที่ 21 ต้องห่าง 2 แต้ม เพดาน 30) */
function randomBestOfThree(rng: () => number) {
  const games: { gameNo: number; scoreA: number; scoreB: number }[] = [];
  let winsA = 0;
  let winsB = 0;
  let gameNo = 1;
  while (winsA < 2 && winsB < 2) {
    const aWins = rng() < 0.5;
    const loserScore = Math.floor(rng() * 20); // 0..19
    const winnerScore = 21;
    games.push({
      gameNo,
      scoreA: aWins ? winnerScore : loserScore,
      scoreB: aWins ? loserScore : winnerScore,
    });
    if (aWins) winsA += 1;
    else winsB += 1;
    gameNo += 1;
  }
  return games;
}

main();
