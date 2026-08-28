/**
 * นำเข้า "ตารางแข่ง" จากไฟล์ตั้งต้นเข้าฐานข้อมูล
 *
 * ทำไมต้องมี: ตารางแข่งเก็บอยู่ในฐานข้อมูล ไม่ได้อยู่ในโค้ด การ deploy โค้ดใหม่
 * จึงไม่ทำให้ตารางเปลี่ยน ต้องนำเข้าอีกทีหนึ่ง — และผู้ดูแลควรทำได้เองจากหน้าเว็บ
 * โดยไม่ต้องใช้เครื่องมือบรรทัดคำสั่งหรือรหัสฐานข้อมูล
 *
 * ขอบเขต: แตะเฉพาะ "เวลา/คอร์ต/ลำดับแมตช์" กับ "กติกาคะแนน" เท่านั้น
 *   - ไม่แตะรายชื่อนักกีฬา ประเภทคู่ ผลจับสลาก ซองรายชื่อ
 *   - ไม่แตะผลการแข่งขันที่กรอกไปแล้ว (สกอร์ยังอยู่กับแมตช์เดิมเพราะอ้างด้วย matchUid)
 * โครงสายไม่เปลี่ยน เพราะ sideASource/sideBSource ไม่ถูกแตะ — ผลที่กรอกไว้จึงยังตรง
 */

import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import seedJson from "../../data/seed-data.json";
import { scheduleFingerprint } from "./schedule-fingerprint";

interface FileMatch {
  matchNo: number;
  matchUid: string;
  sourceMatchCode: string;
  dayNo: number;
  startTime: string;
  endTime: string;
  courtNo: number;
  roundLabel: string;
  levelCode: string;
}
interface FileTie {
  tieId: string;
  dayNo: number;
  startTime: string;
  courts: string;
}
interface FileRule {
  levelCode: string;
  category: string;
  result: string;
  rankNo: number | null;
  points: number;
  medal: string | null;
  countsTowardTotal: boolean;
  note: string | null;
}

const fileMatches = seedJson.matches as FileMatch[];
const fileTies = seedJson.ties as FileTie[];
const fileRules = seedJson.scoring as FileRule[];

export interface MatchMove {
  matchUid: string;
  sourceMatchCode: string;
  label: string;
  fromNo: number;
  toNo: number;
  from: string;
  to: string;
  hasResult: boolean;
}

export interface SchedulePreview {
  /** รหัสตารางของไฟล์ตั้งต้นที่มากับเว็บเวอร์ชันนี้ */
  fileFingerprint: string;
  /** รหัสตารางที่เว็บใช้อยู่จริงตอนนี้ */
  dbFingerprint: string;
  /** ตารางในไฟล์ตรงกับในฐานข้อมูลอยู่แล้ว ไม่มีอะไรต้องทำ */
  upToDate: boolean;
  totalMatches: number;
  moves: MatchMove[];
  movesWithResult: number;
  tiesChanged: number;
  rulesAdded: FileRule[];
  rulesChanged: { result: string; fromPoints: number; toPoints: number }[];
  /** ปัญหาที่ทำให้นำเข้าไม่ได้ — ต้องว่างถึงจะกดนำเข้าได้ */
  blockers: string[];
}

/** ชื่อระดับมือที่คนอ่านเข้าใจ — ห้ามโชว์ "LEVEL2" หรือ "มือ 2" ให้ผู้ใช้เห็น */
const LEVEL_TH: Record<string, string> = {
  LEVEL1: "มือใหม่",
  LEVEL2: "มือ D",
  LEVEL3: "มือ C",
  LEVEL4: "มือทั่วไป",
};

function slotText(m: { dayNo: number; startTime: string; courtNo: number }): string {
  return `วันที่ ${m.dayNo} ${m.startTime} คอร์ต ${m.courtNo}`;
}

export async function previewScheduleImport(): Promise<SchedulePreview> {
  const [dbMatches, dbTies, dbRules] = await Promise.all([
    prisma.match.findMany({
      select: {
        matchUid: true,
        matchNo: true,
        dayNo: true,
        startTime: true,
        endTime: true,
        courtNo: true,
        status: true,
        sourceMatchCode: true,
        roundLabel: true,
        levelCode: true,
        _count: { select: { games: true } },
      },
    }),
    prisma.level4Tie.findMany({ select: { tieId: true, dayNo: true, startTime: true, courts: true } }),
    prisma.colorScoringRule.findMany(),
  ]);

  const blockers: string[] = [];
  const dbByUid = new Map(dbMatches.map((m) => [m.matchUid, m]));

  // โครงสร้างต้องตรงกันก่อน ถ้าจำนวนหรือรหัสไม่ตรง แปลว่าคนละชุดข้อมูล — ไม่ควรเขียนทับ
  const missing = fileMatches.filter((m) => !dbByUid.has(m.matchUid)).map((m) => m.matchUid);
  const extra = dbMatches.filter((m) => !fileMatches.some((f) => f.matchUid === m.matchUid));
  if (missing.length > 0) {
    blockers.push(`มีแมตช์ในไฟล์ ${missing.length} รายการที่ไม่มีในฐานข้อมูล (${missing.slice(0, 3).join(", ")}…)`);
  }
  if (extra.length > 0) {
    blockers.push(
      `มีแมตช์ในฐานข้อมูล ${extra.length} รายการที่ไม่มีในไฟล์ (${extra.slice(0, 3).map((m) => m.matchUid).join(", ")}…)`,
    );
  }

  const moves: MatchMove[] = [];
  for (const f of fileMatches) {
    const db = dbByUid.get(f.matchUid);
    if (!db) continue;
    const same =
      db.dayNo === f.dayNo &&
      db.startTime === f.startTime &&
      db.endTime === f.endTime &&
      db.courtNo === f.courtNo &&
      db.matchNo === f.matchNo;
    if (same) continue;
    moves.push({
      matchUid: f.matchUid,
      sourceMatchCode: f.sourceMatchCode,
      label: `${LEVEL_TH[f.levelCode] ?? f.levelCode} · ${f.roundLabel}`,
      fromNo: db.matchNo,
      toNo: f.matchNo,
      from: slotText(db),
      to: slotText(f),
      hasResult: db._count.games > 0 || db.status !== "WAITING",
    });
  }

  const dbTieById = new Map(dbTies.map((t) => [t.tieId, t]));
  const tiesChanged = fileTies.filter((f) => {
    const db = dbTieById.get(f.tieId);
    return db && (db.dayNo !== f.dayNo || db.startTime !== f.startTime || db.courts !== f.courts);
  }).length;

  const ruleKey = (r: { levelCode: string; category: string; result: string }) =>
    `${r.levelCode}|${r.category}|${r.result}`;
  const dbRuleMap = new Map(dbRules.map((r) => [ruleKey(r), r]));
  const rulesAdded = fileRules.filter((r) => !dbRuleMap.has(ruleKey(r)));
  const rulesChanged = fileRules
    .map((r) => ({ r, db: dbRuleMap.get(ruleKey(r)) }))
    .filter((x) => x.db && x.db.points !== x.r.points)
    .map((x) => ({ result: x.r.result, fromPoints: x.db!.points, toPoints: x.r.points }));

  return {
    fileFingerprint: scheduleFingerprint(fileMatches),
    dbFingerprint: scheduleFingerprint(dbMatches),
    upToDate:
      moves.length === 0 && tiesChanged === 0 && rulesAdded.length === 0 && rulesChanged.length === 0,
    totalMatches: fileMatches.length,
    moves,
    movesWithResult: moves.filter((m) => m.hasResult).length,
    tiesChanged,
    rulesAdded,
    rulesChanged,
    blockers,
  };
}

export interface ImportOutcome {
  matchesUpdated: number;
  tiesUpdated: number;
  rulesUpserted: number;
}

export async function applyScheduleImport(): Promise<ImportOutcome> {
  const preview = await previewScheduleImport();
  if (preview.blockers.length > 0) {
    throw new Error(preview.blockers.join(" · "));
  }

  await prisma.$transaction(
    async (tx) => {
      // match_no เป็นคอลัมน์ unique — ถ้าอัปเดตทีละแถวจะชนกันกลางคัน
      // (แมตช์ A ขอเลข 5 ที่แมตช์ B ยังถืออยู่) จึงพลิกเป็นค่าลบก่อนทั้งชุด
      await tx.$executeRaw`UPDATE "match" SET match_no = -match_no WHERE match_no > 0`;

      // ต้องเขียนเลขใหม่ให้ครบทุกแมตช์ ไม่ใช่เฉพาะที่ย้าย เพราะทุกตัวถูกพลิกเป็นลบไปแล้ว
      for (const f of fileMatches) {
        await tx.match.update({
          where: { matchUid: f.matchUid },
          data: {
            matchNo: f.matchNo,
            dayNo: f.dayNo,
            startTime: f.startTime,
            endTime: f.endTime,
            courtNo: f.courtNo,
          },
        });
      }

      for (const f of fileTies) {
        await tx.level4Tie.update({
          where: { tieId: f.tieId },
          data: { dayNo: f.dayNo, startTime: f.startTime, courts: f.courts },
        });
      }

      for (const r of fileRules) {
        await tx.colorScoringRule.upsert({
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
          create: { ...r },
        });
      }
    },
    { timeout: 120000, maxWait: 20000 },
  );

  const stray = await prisma.match.count({ where: { matchNo: { lt: 0 } } });
  if (stray > 0) {
    throw new Error(`นำเข้าไม่สมบูรณ์ — ยังมีแมตช์ ${stray} รายการที่เลขค้าง กดนำเข้าอีกครั้งเพื่อแก้`);
  }

  return {
    matchesUpdated: preview.moves.length,
    tiesUpdated: preview.tiesChanged,
    rulesUpserted: preview.rulesAdded.length + preview.rulesChanged.length,
  };
}

/** ใช้เขียน audit log ให้เห็นว่านำเข้าอะไรไปบ้าง */
export function summariseForAudit(p: SchedulePreview): Prisma.InputJsonValue {
  return {
    matchesMoved: p.moves.length,
    movesWithResult: p.movesWithResult,
    tiesChanged: p.tiesChanged,
    rulesAdded: p.rulesAdded.map((r) => r.result),
    rulesChanged: p.rulesChanged.map((r) => `${r.result}: ${r.fromPoints} → ${r.toPoints}`),
  };
}
