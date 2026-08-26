/**
 * ตรวจตัวคำนวณเส้นทางการแข่งขันกับโครงสายจริงทั้ง 158 แมตช์
 *
 *   npx tsx scripts/verify-path.ts
 *
 * ตรวจโดยไม่ต้องต่อฐานข้อมูล — จำลองผลทั้งทัวร์นาเมนต์ในหน่วยความจำ
 * แล้วเทียบเส้นทางที่คำนวณได้กับผลที่เกิดขึ้นจริง
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { runEngine } from "../src/lib/engine";
import type { EngineState, EventType, TeamCode } from "../src/lib/engine/types";
import { buildEngineStateFromSeed, loadSeedFile } from "../src/lib/seed-data";
import { buildPairPath } from "../src/lib/match-path";
import type { MatchView, SideView } from "../src/lib/tournament";

const here = path.dirname(fileURLToPath(import.meta.url));
const seed = loadSeedFile(readFileSync(path.join(here, "..", "data", "seed-data.json"), "utf-8"));

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${ok || !detail ? "" : ` — ${detail}`}`);
  if (!ok) failures += 1;
}

/** แปลงผลจากเอนจินเป็น MatchView เท่าที่ buildPairPath ต้องใช้ */
function toViews(state: EngineState): MatchView[] {
  const out = runEngine(state);
  const pairById = new Map(state.pairs.map((p) => [p.pairUid, p]));
  const side = (uid: string | null): SideView => {
    const p = uid ? pairById.get(uid) : null;
    return {
      pair: p
        ? ({
            pairUid: p.pairUid,
            label: p.pairUid,
            teamCode: p.teamCode,
            teamNameTh: p.teamCode,
            colorHex: "#000",
            levelCode: p.levelCode,
            levelNameTh: p.levelCode,
            eventType: p.eventType,
            eventNameTh: null,
            publicPairCode: null,
            slotNo: p.slotNo,
            withdrawn: false,
            isPlaceholder: true,
          } as MatchView["sideA"]["pair"])
        : null,
      pendingLabel: "",
      teamCode: (p?.teamCode as TeamCode) ?? null,
      teamNameTh: null,
      colorHex: null,
    };
  };

  return state.matches.map((m) => {
    const r = out.matches.get(m.matchUid)!;
    return {
      matchUid: m.matchUid,
      matchNo: m.matchNo,
      sourceMatchCode: m.sourceMatchCode,
      sideASource: m.sideASource,
      sideBSource: m.sideBSource,
      dayNo: m.dayNo,
      dayLabel: `วันที่ ${m.dayNo}`,
      startTime: m.startTime,
      endTime: m.endTime,
      courtNo: m.courtNo,
      levelCode: m.levelCode,
      levelNameTh: m.levelCode,
      eventType: m.eventType as EventType | null,
      eventNameTh: null,
      phase: m.phase,
      bracket: m.bracket,
      roundLabel: m.roundLabel,
      groupKey: m.groupKey,
      tieId: m.tieId,
      tieOrderNo: m.tieOrderNo,
      sideA: side(r.sideA.pairUid),
      sideB: side(r.sideB.pairUid),
      games: m.games,
      gamesWonA: r.gamesWonA,
      gamesWonB: r.gamesWonB,
      status: m.status,
      walkover: m.walkover,
      walkoverSide: m.walkoverSide,
      winnerPairUid: r.winnerPairUid,
      loserPairUid: r.loserPairUid,
      winnerSide: r.winnerSide,
      decided: r.decided,
      publicUpdatedAt: null,
      adminNote: null,
      scorable: Boolean(r.sideA.pairUid && r.sideB.pairUid),
    } satisfies MatchView;
  });
}

function main() {
  console.log("\nตรวจตัวคำนวณเส้นทางการแข่งขัน");
  console.log("─".repeat(64));

  // ── สถานะก่อนแข่ง: จับสลากมือใหม่ครบ แต่ยังไม่มีผล ──
  const state = buildEngineStateFromSeed(seed);
  const evCycle: EventType[] = ["MD", "WD", "XD"];
  state.pairs.forEach((p, i) => {
    if (!p.eventType) p.eventType = evCycle[i % 3];
  });
  const l1md = state.pairs.filter((p) => p.levelCode === "LEVEL1" && p.eventType === "MD");
  l1md.forEach((p, i) =>
    state.draws.push({ token: `SEED:L1:MD:${String(i + 1).padStart(2, "0")}`, pairUid: p.pairUid }),
  );

  const before = toViews(state);
  const seedOne = l1md[0].pairUid;
  const p0 = buildPairPath(before, seedOne, seedOne);

  check("มือใหม่: ก่อนแข่ง มีแมตช์รออยู่ 1 แมตช์ (รอบ 16 คู่)", p0.upcoming.length === 1, `ได้ ${p0.upcoming.length}`);
  check(
    "คาดการณ์ต่อได้อีก 3 แมตช์ (QF → SF → ชิงชนะเลิศ)",
    p0.projected.length === 3,
    p0.projected.map((m) => m.roundLabel).join(" → "),
  );
  check("รวมเหลือ 4 แมตช์ถ้าชนะตลอด", p0.remainingIfWinning === 4, `ได้ ${p0.remainingIfWinning}`);
  check("ชนะอีก 4 แมตช์ได้แชมป์", p0.winsToTitle === 4, `ได้ ${p0.winsToTitle}`);
  check("ปลายทางเป็นแมตช์ชิงชนะเลิศ", p0.finalMatch?.roundLabel === "ชิงชนะเลิศ");
  check(
    "เส้นทางเรียงตามเลขแมตช์จากน้อยไปมาก",
    [...p0.upcoming, ...p0.projected].every((m, i, a) => i === 0 || a[i - 1].matchNo < m.matchNo),
  );

  // ── คู่ที่ยังไม่ถูกจับสลาก ต้องไม่ขึ้นว่า "จบเส้นทางแล้ว" ──
  const undrawn = state.pairs.find((p) => p.levelCode === "LEVEL2")!;
  const up = buildPairPath(before, undrawn.pairUid, undrawn.pairUid);
  check("ยังไม่จับสลาก: ต้องไม่ถือว่าจบเส้นทาง", up.notStarted && !up.finished);
  check("ยังไม่จับสลาก: ไม่นับว่าเป็นแชมป์", !up.champion);
  check("ยังไม่จับสลาก: มีข้อความบอกว่ารอจับสลาก", Boolean(up.note), up.note ?? "ไม่มี");

  // ── มือ D: อยู่รอบแบ่งกลุ่ม ต้องไม่เดาต่อ ──
  const l2 = state.pairs.filter((p) => p.levelCode === "LEVEL2");
  ["A", "B", "C", "D"].forEach((g, gi) =>
    [1, 2, 3, 4].forEach((slot, si) =>
      state.draws.push({ token: `GROUP:L2:${g}:SLOT${slot}`, pairUid: l2[gi * 4 + si].pairUid }),
    ),
  );
  const withGroups = toViews(state);
  const gp = buildPairPath(withGroups, l2[0].pairUid, l2[0].pairUid);
  check("มือ D: รอบแบ่งกลุ่มมี 3 แมตช์รออยู่", gp.upcoming.length === 3, `ได้ ${gp.upcoming.length}`);
  check("รอบแบ่งกลุ่มยังไม่คาดการณ์รอบน็อกเอาต์ให้", gp.projected.length === 0);
  check("มีข้อความอธิบายว่าทำไมยังคาดการณ์ต่อไม่ได้", Boolean(gp.note), gp.note ?? "ไม่มี");

  // ── เล่นจนจบทั้งทัวร์นาเมนต์ แล้วเทียบกับผลจริง ──
  let guard = 0;
  for (;;) {
    if (++guard > 50) throw new Error("วนไม่จบ");
    const cur = runEngine(state);
    const playable = state.matches.filter((m) => {
      const r = cur.matches.get(m.matchUid)!;
      return !r.decided && r.sideA.pairUid && r.sideB.pairUid;
    });
    if (playable.length === 0) break;
    for (const m of playable) {
      m.status = "COMPLETED";
      m.games = [
        { gameNo: 1, scoreA: 21, scoreB: 15 },
        { gameNo: 2, scoreA: 21, scoreB: 15 },
      ];
    }
  }

  const after = toViews(state);
  const finalMd = after.find((m) => m.levelCode === "LEVEL1" && m.eventType === "MD" && m.roundLabel === "ชิงชนะเลิศ")!;
  const championUid = finalMd.winnerPairUid!;
  const champPath = buildPairPath(after, championUid, championUid);

  check("แชมป์: ระบบรู้ว่าชนะเลิศแล้ว", champPath.champion);
  check("แชมป์: ไม่มีแมตช์เหลือ", champPath.remainingIfWinning === 0, `ได้ ${champPath.remainingIfWinning}`);
  check("แชมป์: ชนะครบ 4 แมตช์", champPath.played.length === 4 && champPath.played.every((p) => p.won), `ลง ${champPath.played.length} แมตช์`);

  const r16Loser = after.find(
    (m) => m.levelCode === "LEVEL1" && m.eventType === "MD" && m.roundLabel === "รอบ 16 คู่",
  )!.loserPairUid!;
  const outPath = buildPairPath(after, r16Loser, r16Loser);
  check("ตกรอบแรก: จบเส้นทางแล้ว", outPath.finished && !outPath.champion);
  check("ตกรอบแรก: ไม่มีแมตช์เหลือ", outPath.remainingIfWinning === 0, `ได้ ${outPath.remainingIfWinning}`);
  check("ตกรอบแรก: ลงเล่นแมตช์เดียว", outPath.played.length === 1, `ได้ ${outPath.played.length}`);

  // ผู้แพ้รองชนะเลิศต้องยังมีแมตช์ชิงอันดับ 3 รออยู่ ไม่ใช่ตกรอบ
  const sf = after.find(
    (m) => m.levelCode === "LEVEL1" && m.eventType === "MD" && m.roundLabel === "รองชนะเลิศ",
  )!;
  const sfLoserPath = buildPairPath(after, sf.loserPairUid!, "sfLoser");
  check(
    "ผู้แพ้รองชนะเลิศได้ลงชิงอันดับ 3 (ไม่นับว่าตกรอบทันที)",
    sfLoserPath.played.some((p) => p.match.roundLabel === "ชิงอันดับ 3"),
  );

  console.log("\n" + "─".repeat(64));
  if (failures === 0) {
    console.log("ผ่านทั้งหมด ✓  ตัวคำนวณเส้นทางตรงกับโครงสายจริง\n");
  } else {
    console.log(`ไม่ผ่าน ${failures} ข้อ\n`);
    process.exitCode = 1;
  }
}

main();
