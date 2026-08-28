/**
 * นำเข้าข้อมูลตั้งต้นจาก data/seed-data.json ลงฐานข้อมูล
 *
 *   npm run db:seed
 *
 * ปลอดภัยต่อการรันซ้ำ (upsert ทั้งหมด) และ "ไม่แตะ" ข้อมูลที่กรอกหน้างานไปแล้ว:
 * ชื่อนักกีฬา ผลการแข่งขัน การจับสลาก และซองรายชื่อ จะไม่ถูกเขียนทับ
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";
import {
  PrismaClient,
  type AdminRole,
  type Bracket,
  type CheckStatus,
  type EventType,
  type Phase,
} from "@prisma/client";
import {
  BASE_TOTAL_POINTS,
  PLAYOFF_CONSOLATION_RESULT,
} from "../src/lib/engine/scoring-constants";
import { loadSeedFile } from "../src/lib/seed-data";

const prisma = new PrismaClient();
const seedPath = path.join(process.cwd(), "data", "seed-data.json");

const DAY_LABELS = ["วันที่ 1", "วันที่ 2", "วันที่ 3"];

async function main(): Promise<void> {
  const seed = loadSeedFile(readFileSync(seedPath, "utf-8"));
  console.log("นำเข้าข้อมูลตั้งต้นจาก data/seed-data.json");

  // ── ข้อมูลกิจกรรม ──────────────────────────────────────────
  const t = seed.tournament;
  await prisma.tournament.upsert({
    where: { tournamentId: t.tournamentId },
    // อัปเดตเฉพาะข้อมูลอ้างอิงจาก Excel — ไม่ทับวันจริง/สถานที่ที่แอดมินกรอกไว้
    update: {
      titleTh: t.titleTh,
      yearBe: t.yearBe,
      timezone: t.timezone,
      publicRefreshMs: t.publicRefreshMs,
      registrationMode: t.registrationMode,
      reportingMinutesBefore: t.reportingMinutesBefore,
      walkoverGraceMinutes: t.walkoverGraceMinutes,
      walkoverScore: t.walkoverScore,
    },
    create: {
      tournamentId: t.tournamentId,
      titleTh: t.titleTh,
      yearBe: t.yearBe,
      timezone: t.timezone,
      startDate: t.startDate ? new Date(t.startDate) : null,
      endDate: t.endDate ? new Date(t.endDate) : null,
      venue: t.venue,
      venueConfirmed: t.venueConfirmed,
      publicRefreshMs: t.publicRefreshMs,
      registrationMode: t.registrationMode,
      reportingMinutesBefore: t.reportingMinutesBefore,
      walkoverGraceMinutes: t.walkoverGraceMinutes,
      walkoverScore: t.walkoverScore,
      publicAdminTestMode: false,
      simulationEnabled: false,
    },
  });

  for (const [idx, label] of DAY_LABELS.entries()) {
    await prisma.tournamentDay.upsert({
      where: { tournamentId_dayNo: { tournamentId: t.tournamentId, dayNo: idx + 1 } },
      update: { labelTemp: label },
      create: { tournamentId: t.tournamentId, dayNo: idx + 1, labelTemp: label },
    });
  }

  // ── สี / ระดับมือ ──────────────────────────────────────────
  for (const team of seed.teams) {
    await prisma.team.upsert({
      where: { teamCode: team.teamCode },
      update: { nameTh: team.nameTh, displayOrder: team.displayOrder, colorHex: team.colorHex },
      create: team,
    });
  }

  for (const [idx, lv] of seed.levels.entries()) {
    await prisma.level.upsert({
      where: { levelCode: lv.levelCode },
      update: {
        nameTh: lv.nameTh,
        eligibility: lv.eligibility,
        pairSlots: lv.pairSlots,
        matchCount: lv.matchCount,
        format: lv.format,
        eventTypes: lv.eventTypes,
        teamTieSize: lv.teamTieSize,
        sortOrder: idx + 1,
      },
      create: { ...lv, sortOrder: idx + 1 },
    });
  }

  // ── คู่แข่งขัน ─────────────────────────────────────────────
  for (const p of seed.pairs) {
    await prisma.pair.upsert({
      where: { pairUid: p.pairUid },
      // ไม่ทับ eventType/publicPairCode ที่แอดมินล็อกไปแล้ว
      update: {
        levelCode: p.levelCode,
        teamCode: p.teamCode,
        slotNo: p.slotNo,
        player1Template: p.player1Template,
        player2Template: p.player2Template,
      },
      create: {
        pairUid: p.pairUid,
        levelCode: p.levelCode,
        teamCode: p.teamCode,
        slotNo: p.slotNo,
        eventType: (p.eventType as EventType | null) ?? undefined,
        publicPairCode: p.publicPairCode,
        player1Template: p.player1Template,
        player2Template: p.player2Template,
      },
    });
  }

  // ── นักกีฬา (ช่องชื่อจริงเว้นว่างรอกรอกหน้างาน) ──────────────
  for (const pt of seed.participants) {
    await prisma.participant.upsert({
      where: { participantUid: pt.participantUid },
      update: {
        pairUid: pt.pairUid,
        playerNo: pt.playerNo,
        teamCode: pt.teamCode,
        levelCode: pt.levelCode,
      },
      create: {
        participantUid: pt.participantUid,
        pairUid: pt.pairUid,
        playerNo: pt.playerNo,
        displayCode: pt.displayCode,
        teamCode: pt.teamCode,
        levelCode: pt.levelCode,
        eventType: (pt.eventType as EventType | null) ?? undefined,
      },
    });
  }

  // ── คู่สีของมือทั่วไป (ต้องมาก่อนแมตช์เพราะแมตช์อ้างถึง) ──────
  for (const tie of seed.ties) {
    const teamACode = /^(PUR|GRN|RED|BLU)$/.test(tie.teamASource) ? tie.teamASource : null;
    const teamBCode = /^(PUR|GRN|RED|BLU)$/.test(tie.teamBSource) ? tie.teamBSource : null;
    await prisma.level4Tie.upsert({
      where: { tieId: tie.tieId },
      update: {
        tieNo: tie.tieNo,
        phase: tie.phase as Phase,
        stage: tie.stage,
        dayNo: tie.dayNo,
        startTime: tie.startTime,
        courts: tie.courts,
        teamASource: tie.teamASource,
        teamBSource: tie.teamBSource,
        requiredMatchWins: tie.requiredMatchWins,
        playAllThree: tie.playAllThree,
      },
      create: {
        tieId: tie.tieId,
        tieNo: tie.tieNo,
        phase: tie.phase as Phase,
        stage: tie.stage,
        dayNo: tie.dayNo,
        startTime: tie.startTime,
        courts: tie.courts,
        teamASource: tie.teamASource,
        teamBSource: tie.teamBSource,
        teamACode,
        teamBCode,
        requiredMatchWins: tie.requiredMatchWins,
        playAllThree: tie.playAllThree,
      },
    });
  }

  // ── ตารางแมตช์ (ไม่ทับผลที่กรอกไปแล้ว) ──────────────────────
  //
  // match_no เป็นคอลัมน์ unique และเลขแมตช์เรียงใหม่ได้เมื่อจัดตารางใหม่
  // ถ้า upsert ตรง ๆ จะชนกันกลางคัน (แมตช์ A ขอเลข 5 ที่แมตช์ B ยังถืออยู่)
  // จึงพลิกเลขเดิมเป็นค่าลบก่อน เพื่อเปิดทางให้เลขใหม่ทั้งชุดลงได้
  //
  // ถ้าสคริปต์ตายกลางคัน จะเหลือแมตช์ที่ยังเป็นเลขลบ — รันซ้ำได้เลย
  // เพราะรอบถัดไปจะพลิกเฉพาะเลขบวก แล้ว upsert เขียนเลขที่ถูกต้องทับให้ทั้ง 158 รายการ
  const existingMatches = await prisma.match.count();
  if (existingMatches > 0) {
    await prisma.$executeRaw`UPDATE "match" SET match_no = -match_no WHERE match_no > 0`;
  }

  for (const m of seed.matches) {
    const common = {
      matchNo: m.matchNo,
      sourceMatchCode: m.sourceMatchCode,
      dayNo: m.dayNo,
      startTime: m.startTime,
      endTime: m.endTime,
      courtNo: m.courtNo,
      levelCode: m.levelCode,
      eventType: (m.eventType as EventType | null) ?? undefined,
      phase: m.phase as Phase,
      bracket: m.bracket as Bracket,
      roundLabel: m.roundLabel,
      groupKey: m.groupKey,
      tieId: m.tieId,
      tieOrderNo: m.tieOrderNo,
      sideASource: m.sideASource,
      sideBSource: m.sideBSource,
    };
    await prisma.match.upsert({
      where: { matchUid: m.matchUid },
      update: common,
      create: { matchUid: m.matchUid, ...common },
    });
  }

  const strayMatches = await prisma.match.count({ where: { matchNo: { lt: 0 } } });
  if (strayMatches > 0) {
    throw new Error(
      `มีแมตช์ ${strayMatches} รายการในฐานข้อมูลที่ไม่มีใน seed-data.json — ตรวจก่อนนำเข้าซ้ำ`,
    );
  }

  // ── กติกาคะแนนสี ───────────────────────────────────────────
  for (const r of seed.scoring) {
    await prisma.colorScoringRule.upsert({
      where: {
        levelCode_category_result: {
          levelCode: r.levelCode,
          category: r.category,
          result: r.result,
        },
      },
      update: {
        rankNo: r.rankNo,
        points: r.points,
        medal: r.medal,
        countsTowardTotal: r.countsTowardTotal,
        note: r.note,
      },
      create: {
        levelCode: r.levelCode,
        category: r.category,
        result: r.result,
        rankNo: r.rankNo,
        points: r.points,
        medal: r.medal,
        countsTowardTotal: r.countsTowardTotal,
        note: r.note,
      },
    });
  }

  // คะแนน "หลัก" (เหรียญของทุกระดับ) ต้องรวมได้ 37 พอดีเสมอ
  // โบนัสปลอบใจของ Page Playoff แจกตามผลการแข่ง จึงไม่นับรวมในการตรวจนี้
  const basePoints = seed.scoring
    .filter((r) => r.countsTowardTotal && r.result !== PLAYOFF_CONSOLATION_RESULT)
    .reduce((s, r) => s + r.points, 0);
  if (Math.abs(basePoints - BASE_TOTAL_POINTS) > 1e-9) {
    throw new Error(`กติกาคะแนนหลักรวมได้ ${basePoints} (ต้องเป็น ${BASE_TOTAL_POINTS})`);
  }
  if (!seed.scoring.some((r) => r.result === PLAYOFF_CONSOLATION_RESULT)) {
    throw new Error("ไม่พบกติกาโบนัสปลอบใจของรอบ Page Playoff ใน seed-data.json");
  }

  // ── Checklist ก่อน Go-live ─────────────────────────────────
  if ((await prisma.checklistItem.count()) === 0) {
    await prisma.checklistItem.createMany({
      data: seed.checklist.map((c) => ({
        area: c.area,
        item: c.item,
        owner: c.owner,
        status: c.status as CheckStatus,
        blocking: c.blocking,
        note: c.note,
      })),
    });
  }

  // ── บัญชีผู้ดูแลคนแรก ───────────────────────────────────────
  const username = process.env.SEED_SUPERADMIN_USERNAME;
  const password = process.env.SEED_SUPERADMIN_PASSWORD;
  if (username && password && (await prisma.adminUser.count()) === 0) {
    await prisma.adminUser.create({
      data: {
        adminId: "ADMIN-01",
        username,
        displayName: "หัวหน้าผู้ดูแลระบบ",
        passwordHash: await bcrypt.hash(password, 12),
        role: "SUPERADMIN" as AdminRole,
        mustChangePassword: true,
      },
    });
    console.log(`  สร้างบัญชี SUPERADMIN "${username}" แล้ว (แนะนำให้เปลี่ยนรหัสผ่านหลังเข้าใช้ครั้งแรก)`);
  }

  const counts = {
    สี: await prisma.team.count(),
    ระดับมือ: await prisma.level.count(),
    คู่แข่งขัน: await prisma.pair.count(),
    นักกีฬา: await prisma.participant.count(),
    แมตช์: await prisma.match.count(),
    คู่สีมือทั่วไป: await prisma.level4Tie.count(),
    กติกาคะแนน: await prisma.colorScoringRule.count(),
  };
  console.log("นำเข้าเสร็จ:", counts);

  if (counts.แมตช์ !== 158 || counts.คู่แข่งขัน !== 92 || counts.นักกีฬา !== 184) {
    throw new Error("จำนวนข้อมูลหลังนำเข้าไม่ตรงกับ Excel");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
