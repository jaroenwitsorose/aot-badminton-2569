"use server";

/**
 * การทำรายการทั้งหมดของฝั่งผู้ดูแล
 *
 * กติกาที่ยึดทุกฟังก์ชัน:
 *   - ตรวจสิทธิ์ก่อนเสมอ (requireRole)
 *   - ตรวจความถูกต้องของข้อมูลก่อนเขียน
 *   - เขียนข้อมูลกับ audit log ในทรานแซกชันเดียวกัน เพื่อไม่ให้มีการแก้ไขที่ไม่มีร่องรอย
 */

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import type { EventType, Gender, MatchStatus, SkillRank } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  AuthError,
  createSession,
  destroySession,
  getSession,
  hashPassword,
  requireRole,
  validatePasswordStrength,
  verifyPassword,
} from "@/lib/auth";
import { writeAudit, type AuditAction } from "@/lib/audit";
import { simulateAllResults } from "@/lib/simulator";
import {
  validateEventGender,
  validateLineupOrder,
  validateMatchGames,
  validateSkillEligibility,
  type GameInput,
} from "@/lib/validation";

export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

const ok = (message?: string): ActionResult => ({ ok: true, message });
const fail = (error: string): ActionResult => ({ ok: false, error });

async function meta(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers();
  const forwarded = h.get("x-forwarded-for");
  return {
    ip: forwarded ? forwarded.split(",")[0].trim() : h.get("x-real-ip"),
    userAgent: h.get("user-agent"),
  };
}

/** ห่อ action ให้จัดการข้อผิดพลาดสิทธิ์เป็นข้อความอ่านง่ายแทนที่จะพัง */
async function guarded(fn: () => Promise<ActionResult>): Promise<ActionResult> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof AuthError) return fail(error.message);
    console.error(error);
    return fail(error instanceof Error ? error.message : "บันทึกไม่สำเร็จ");
  }
}

function refreshPublicPages(): void {
  for (const p of ["/", "/schedule", "/results", "/brackets", "/scores", "/teams", "/rules", "/admin"]) {
    revalidatePath(p);
  }
}

// ───────────────────────── บัญชีผู้ใช้ ─────────────────────────

export async function loginAction(_prev: ActionResult | null, formData: FormData): Promise<ActionResult> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!username || !password) return fail("กรอกชื่อผู้ใช้และรหัสผ่าน");

  const session = await verifyPassword(username, password);
  if (!session) {
    // ข้อความเดียวกันทั้งกรณีชื่อผิดและรหัสผิด เพื่อไม่ให้เดาว่ามีบัญชีนี้อยู่จริงหรือไม่
    return fail("ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง");
  }

  await createSession(session);
  await writeAudit({
    actorId: session.adminId,
    action: "LOGIN",
    entityType: "admin_user",
    entityId: session.adminId,
    ...(await meta()),
  });
  // เข้าหน้าภาพรวมเสมอ — การเปลี่ยนรหัสผ่านเป็นเรื่องที่ผู้ใช้เลือกทำเองที่เมนู
  redirect("/admin");
}

export async function logoutAction(): Promise<void> {
  const session = await getSession();
  if (session) {
    await writeAudit({
      actorId: session.adminId,
      action: "LOGOUT",
      entityType: "admin_user",
      entityId: session.adminId,
      ...(await meta()),
    });
  }
  await destroySession();
  redirect("/admin/login");
}

export async function changePasswordAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return guarded(async () => {
    const session = await requireRole("SCORER");
    const current = String(formData.get("current") ?? "");
    const next = String(formData.get("next") ?? "");
    const confirm = String(formData.get("confirm") ?? "");

    if (next !== confirm) return fail("รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน");
    const weak = validatePasswordStrength(next);
    if (weak) return fail(weak);
    if (!(await verifyPassword(session.username, current))) return fail("รหัสผ่านเดิมไม่ถูกต้อง");
    if (current === next) return fail("รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสผ่านเดิม");

    await prisma.$transaction(async (tx) => {
      await tx.adminUser.update({
        where: { adminId: session.adminId },
        data: { passwordHash: await hashPassword(next), mustChangePassword: false },
      });
      await writeAudit(
        {
          actorId: session.adminId,
          action: "PASSWORD_CHANGE",
          entityType: "admin_user",
          entityId: session.adminId,
          ...(await meta()),
        },
        tx,
      );
    });

    await createSession({ ...session, mustChangePassword: false });
    return ok("เปลี่ยนรหัสผ่านแล้ว");
  });
}

// ───────────────────────── ผลการแข่งขัน ─────────────────────────

export async function saveScoreAction(input: {
  matchUid: string;
  games: GameInput[];
  adminNote?: string;
}): Promise<ActionResult> {
  return guarded(async () => {
    const session = await requireRole("SCORER");

    const match = await prisma.match.findUnique({
      where: { matchUid: input.matchUid },
      include: { games: true },
    });
    if (!match) return fail("ไม่พบแมตช์นี้");
    if (match.status === "CANCELLED") return fail("แมตช์นี้ถูกยกเลิกแล้ว");

    const games = input.games
      .filter((g) => Number.isFinite(g.scoreA) && Number.isFinite(g.scoreB))
      .map((g) => ({ gameNo: g.gameNo, scoreA: Number(g.scoreA), scoreB: Number(g.scoreB) }));

    const error = validateMatchGames(games);
    if (error) return fail(error);

    const before = {
      status: match.status,
      games: match.games.map((g) => ({ gameNo: g.gameNo, scoreA: g.scoreA, scoreB: g.scoreB })),
    };

    await prisma.$transaction(async (tx) => {
      await tx.matchGame.deleteMany({ where: { matchUid: match.matchUid } });
      await tx.matchGame.createMany({
        data: games.map((g) => ({ matchUid: match.matchUid, ...g })),
      });
      await tx.match.update({
        where: { matchUid: match.matchUid },
        data: {
          status: "COMPLETED",
          walkover: false,
          walkoverSide: null,
          adminNote: input.adminNote ?? match.adminNote,
          publicUpdatedAt: new Date(),
          updatedById: session.adminId,
        },
      });
      await writeAudit(
        {
          actorId: session.adminId,
          action: "MATCH_SCORE_UPDATE",
          entityType: "match",
          entityId: match.matchUid,
          before,
          after: { status: "COMPLETED", games },
          ...(await meta()),
        },
        tx,
      );
    });

    refreshPublicPages();
    return ok(`บันทึกผลแมตช์ #${match.matchNo} แล้ว`);
  });
}

export async function setMatchStatusAction(input: {
  matchUid: string;
  status: MatchStatus;
}): Promise<ActionResult> {
  return guarded(async () => {
    const session = await requireRole("SCORER");
    if (input.status === "COMPLETED") return fail("จบแมตช์ต้องกรอกสกอร์");
    if (input.status === "CANCELLED") await requireRole("ADMIN");

    const match = await prisma.match.findUnique({ where: { matchUid: input.matchUid } });
    if (!match) return fail("ไม่พบแมตช์นี้");

    await prisma.$transaction(async (tx) => {
      await tx.match.update({
        where: { matchUid: match.matchUid },
        data: {
          status: input.status,
          publicUpdatedAt: new Date(),
          updatedById: session.adminId,
        },
      });
      await writeAudit(
        {
          actorId: session.adminId,
          action: "MATCH_STATUS_UPDATE",
          entityType: "match",
          entityId: match.matchUid,
          before: { status: match.status },
          after: { status: input.status },
          ...(await meta()),
        },
        tx,
      );
    });

    refreshPublicPages();
    return ok();
  });
}

export async function setWalkoverAction(input: {
  matchUid: string;
  /** ฝั่งที่ไม่มาแข่ง */
  absentSide: "A" | "B";
  reason: string;
}): Promise<ActionResult> {
  return guarded(async () => {
    const session = await requireRole("SCORER");
    if (!input.reason.trim()) return fail("ต้องระบุเหตุผลของ Walkover");

    const match = await prisma.match.findUnique({ where: { matchUid: input.matchUid } });
    if (!match) return fail("ไม่พบแมตช์นี้");

    await prisma.$transaction(async (tx) => {
      await tx.matchGame.deleteMany({ where: { matchUid: match.matchUid } });
      await tx.match.update({
        where: { matchUid: match.matchUid },
        data: {
          status: "WALKOVER",
          walkover: true,
          walkoverSide: input.absentSide,
          adminNote: input.reason.trim(),
          publicUpdatedAt: new Date(),
          updatedById: session.adminId,
        },
      });
      await writeAudit(
        {
          actorId: session.adminId,
          action: "MATCH_WALKOVER",
          entityType: "match",
          entityId: match.matchUid,
          before: { status: match.status },
          after: { status: "WALKOVER", absentSide: input.absentSide, reason: input.reason },
          ...(await meta()),
        },
        tx,
      );
    });

    refreshPublicPages();
    return ok(`บันทึก Walkover แมตช์ #${match.matchNo} แล้ว`);
  });
}

export async function resetMatchAction(input: { matchUid: string; reason: string }): Promise<ActionResult> {
  return guarded(async () => {
    // ล้างผลที่บันทึกไปแล้วเป็นเรื่องใหญ่ ต้องเป็นระดับผู้ดูแลขึ้นไป
    const session = await requireRole("ADMIN");
    if (!input.reason.trim()) return fail("ต้องระบุเหตุผลของการล้างผล");

    const match = await prisma.match.findUnique({
      where: { matchUid: input.matchUid },
      include: { games: true },
    });
    if (!match) return fail("ไม่พบแมตช์นี้");

    await prisma.$transaction(async (tx) => {
      await tx.matchGame.deleteMany({ where: { matchUid: match.matchUid } });
      await tx.match.update({
        where: { matchUid: match.matchUid },
        data: {
          status: "WAITING",
          walkover: false,
          walkoverSide: null,
          adminNote: input.reason.trim(),
          publicUpdatedAt: new Date(),
          updatedById: session.adminId,
        },
      });
      await writeAudit(
        {
          actorId: session.adminId,
          action: "MATCH_RESET",
          entityType: "match",
          entityId: match.matchUid,
          before: {
            status: match.status,
            games: match.games.map((g) => ({ gameNo: g.gameNo, scoreA: g.scoreA, scoreB: g.scoreB })),
          },
          after: { status: "WAITING", reason: input.reason },
          ...(await meta()),
        },
        tx,
      );
    });

    refreshPublicPages();
    return ok(`ล้างผลแมตช์ #${match.matchNo} แล้ว`);
  });
}

// ───────────────────────── รายชื่อนักกีฬา ─────────────────────────

export async function saveParticipantAction(input: {
  participantUid: string;
  actualName: string;
  employeeId: string;
  skillRank: SkillRank | "";
  gender: Gender | "";
}): Promise<ActionResult> {
  return guarded(async () => {
    const session = await requireRole("ADMIN");

    const participant = await prisma.participant.findUnique({
      where: { participantUid: input.participantUid },
    });
    if (!participant) return fail("ไม่พบนักกีฬาคนนี้");

    const name = input.actualName.trim();
    const employeeId = input.employeeId.trim();
    const skillRank = input.skillRank || null;

    if (employeeId) {
      const duplicate = await prisma.participant.findFirst({
        where: { employeeId, participantUid: { not: input.participantUid } },
      });
      if (duplicate) {
        return fail(`รหัสพนักงาน ${employeeId} ถูกใช้แล้วใน ${duplicate.participantUid} — นักกีฬาห้ามซ้ำ`);
      }
    }

    const eligibilityError = validateSkillEligibility(participant.levelCode, skillRank);
    if (eligibilityError) return fail(eligibilityError);

    await prisma.$transaction(async (tx) => {
      await tx.participant.update({
        where: { participantUid: input.participantUid },
        data: {
          actualName: name || null,
          employeeId: employeeId || null,
          skillRank: skillRank as SkillRank | null,
          gender: (input.gender || null) as Gender | null,
          eligibilityChecked: Boolean(name && employeeId && skillRank && input.gender),
        },
      });
      await writeAudit(
        {
          actorId: session.adminId,
          action: "PARTICIPANT_UPDATE",
          entityType: "participant",
          entityId: input.participantUid,
          before: {
            actualName: participant.actualName,
            employeeId: participant.employeeId,
            skillRank: participant.skillRank,
            gender: participant.gender,
          },
          after: { actualName: name, employeeId, skillRank, gender: input.gender },
          ...(await meta()),
        },
        tx,
      );
    });

    refreshPublicPages();
    return ok("บันทึกแล้ว");
  });
}

export async function lockPairEventAction(input: {
  pairUid: string;
  eventType: EventType;
}): Promise<ActionResult> {
  return guarded(async () => {
    const session = await requireRole("ADMIN");

    const pair = await prisma.pair.findUnique({
      where: { pairUid: input.pairUid },
      include: { participants: { orderBy: { playerNo: "asc" } }, team: true },
    });
    if (!pair) return fail("ไม่พบคู่แข่งขันนี้");

    if (pair.levelCode === "LEVEL2" && input.eventType === "MD") {
      return fail("มือ D ไม่มีประเภทชายคู่");
    }

    const genderError = validateEventGender(
      input.eventType,
      pair.participants.map((p) => p.gender),
    );
    if (genderError) return fail(genderError);

    // public_pair_code สร้างหลังล็อกประเภทเท่านั้น
    const publicPairCode = `${pair.levelCode}-${pair.teamCode}-${input.eventType}-${String(pair.slotNo).padStart(2, "0")}`;
    const clash = await prisma.pair.findFirst({
      where: { publicPairCode, pairUid: { not: pair.pairUid } },
    });
    if (clash) return fail(`รหัสคู่ ${publicPairCode} ซ้ำกับคู่อื่น`);

    await prisma.$transaction(async (tx) => {
      await tx.pair.update({
        where: { pairUid: pair.pairUid },
        data: { eventType: input.eventType, publicPairCode, eventLockedAt: new Date() },
      });
      await tx.participant.updateMany({
        where: { pairUid: pair.pairUid },
        data: { eventType: input.eventType },
      });
      // เติม display_code ตามรูปแบบ สี_LEVEL_ประเภท_คู่-คน
      for (const p of pair.participants) {
        await tx.participant.update({
          where: { participantUid: p.participantUid },
          data: {
            displayCode: `${pair.team.nameTh}_${pair.levelCode}_${input.eventType}_${pair.slotNo}-${p.playerNo}`,
          },
        });
      }
      await writeAudit(
        {
          actorId: session.adminId,
          action: "PAIR_EVENT_LOCK",
          entityType: "pair",
          entityId: pair.pairUid,
          before: { eventType: pair.eventType, publicPairCode: pair.publicPairCode },
          after: { eventType: input.eventType, publicPairCode },
          ...(await meta()),
        },
        tx,
      );
    });

    refreshPublicPages();
    return ok(`ล็อกประเภทเป็น ${input.eventType} แล้ว`);
  });
}

// ───────────────────────── จับสลาก ─────────────────────────

export async function assignDrawAction(input: { token: string; pairUid: string }): Promise<ActionResult> {
  return guarded(async () => {
    const session = await requireRole("ADMIN");

    const pair = await prisma.pair.findUnique({ where: { pairUid: input.pairUid } });
    if (!pair) return fail("ไม่พบคู่แข่งขันนี้");

    const parts = input.token.split(":");
    const levelCode = { L1: "LEVEL1", L2: "LEVEL2", L3: "LEVEL3", L4: "LEVEL4" }[parts[1]];
    if (!levelCode) return fail("รหัสช่องไม่ถูกต้อง");
    if (pair.levelCode !== levelCode) return fail("คู่นี้ไม่ได้อยู่ในระดับมือเดียวกับช่องที่เลือก");
    if (parts[0] === "SEED" && pair.eventType !== parts[2]) {
      return fail(`ช่องนี้เป็นประเภท ${parts[2]} แต่คู่ที่เลือกเป็น ${pair.eventType ?? "ยังไม่ล็อกประเภท"}`);
    }
    if (pair.withdrawn) return fail("คู่นี้ถอนตัวแล้ว");

    const existingForPair = await prisma.drawAssignment.findFirst({
      where: { levelCode, pairUid: input.pairUid, token: { not: input.token } },
    });
    if (existingForPair) {
      return fail(`คู่นี้ถูกจัดไว้ที่ช่อง ${existingForPair.token} แล้ว — ต้องล้างช่องเดิมก่อน`);
    }

    const before = await prisma.drawAssignment.findUnique({ where: { token: input.token } });

    await prisma.$transaction(async (tx) => {
      await tx.drawAssignment.upsert({
        where: { token: input.token },
        update: { pairUid: input.pairUid, assignedBy: session.adminId, assignedAt: new Date() },
        create: {
          token: input.token,
          levelCode,
          groupKey: parts[0] === "GROUP" ? parts[2] : null,
          slotNo: parts[0] === "GROUP" ? Number(parts[3].replace("SLOT", "")) : Number(parts[3]),
          pairUid: input.pairUid,
          assignedBy: session.adminId,
        },
      });
      await writeAudit(
        {
          actorId: session.adminId,
          action: "DRAW_ASSIGN",
          entityType: "draw_assignment",
          entityId: input.token,
          before: before ? { pairUid: before.pairUid } : null,
          after: { pairUid: input.pairUid },
          ...(await meta()),
        },
        tx,
      );
    });

    refreshPublicPages();
    return ok();
  });
}

export async function clearDrawAction(input: { token: string }): Promise<ActionResult> {
  return guarded(async () => {
    const session = await requireRole("ADMIN");
    const before = await prisma.drawAssignment.findUnique({ where: { token: input.token } });
    if (!before) return ok();

    // ล้างการจับสลากหลังเริ่มแข่งแล้วจะทำให้ผลที่บันทึกไว้ไม่ตรงกับคู่
    const started = await prisma.match.count({
      where: {
        OR: [{ sideASource: input.token }, { sideBSource: input.token }],
        status: { not: "WAITING" },
      },
    });
    if (started > 0) return fail("ช่องนี้มีแมตช์ที่เริ่มแข่งแล้ว ล้างไม่ได้");

    await prisma.$transaction(async (tx) => {
      await tx.drawAssignment.delete({ where: { token: input.token } });
      await writeAudit(
        {
          actorId: session.adminId,
          action: "DRAW_CLEAR",
          entityType: "draw_assignment",
          entityId: input.token,
          before: { pairUid: before.pairUid },
          ...(await meta()),
        },
        tx,
      );
    });

    refreshPublicPages();
    return ok();
  });
}

// ───────────────────────── ซองรายชื่อมือทั่วไป ─────────────────────────

export async function submitLineupAction(input: {
  tieId: string;
  teamCode: string;
  /** เรียงตามลำดับคู่ที่ 1, 2, 3 */
  pairUids: string[];
}): Promise<ActionResult> {
  return guarded(async () => {
    const session = await requireRole("ADMIN");

    const tie = await prisma.level4Tie.findUnique({ where: { tieId: input.tieId } });
    if (!tie) return fail("ไม่พบคู่สีนี้");

    const existing = await prisma.level4Lineup.findMany({
      where: { tieId: input.tieId, teamCode: input.teamCode },
    });
    if (existing.length > 0 && existing.some((l) => l.sealedAt)) {
      return fail("ซองของสีนี้เปิดแล้ว แก้ไขไม่ได้");
    }

    const started = await prisma.match.count({
      where: { tieId: input.tieId, status: { not: "WAITING" } },
    });
    if (started > 0) return fail("คู่สีนี้เริ่มแข่งแล้ว แก้ซองไม่ได้");

    const pairs = await prisma.pair.findMany({
      where: { pairUid: { in: input.pairUids } },
      include: { participants: true },
    });
    if (pairs.length !== 3) return fail("ต้องเลือกให้ครบ 3 คู่");
    if (pairs.some((p) => p.levelCode !== "LEVEL4")) return fail("ต้องเป็นคู่ของมือทั่วไปเท่านั้น");
    if (pairs.some((p) => p.teamCode !== input.teamCode)) return fail("ต้องเป็นคู่ของสีเดียวกันทั้งหมด");
    if (pairs.some((p) => p.withdrawn)) return fail("มีคู่ที่ถอนตัวอยู่ในรายชื่อ");

    const orderError = validateLineupOrder(
      input.pairUids.map((uid) => ({
        pairUid: uid,
        ranks: pairs.find((p) => p.pairUid === uid)!.participants.map((x) => x.skillRank),
      })),
    );
    if (orderError) return fail(orderError);

    await prisma.$transaction(async (tx) => {
      await tx.level4Lineup.deleteMany({ where: { tieId: input.tieId, teamCode: input.teamCode } });
      await tx.level4Lineup.createMany({
        data: input.pairUids.map((pairUid, idx) => ({
          tieId: input.tieId,
          teamCode: input.teamCode,
          orderNo: idx + 1,
          pairUid,
        })),
      });
      await writeAudit(
        {
          actorId: session.adminId,
          action: "LINEUP_SUBMIT",
          entityType: "level4_lineup",
          entityId: `${input.tieId}|${input.teamCode}`,
          before: existing.map((l) => ({ orderNo: l.orderNo, pairUid: l.pairUid })),
          after: input.pairUids.map((pairUid, idx) => ({ orderNo: idx + 1, pairUid })),
          ...(await meta()),
        },
        tx,
      );
    });

    refreshPublicPages();
    return ok("บันทึกซองรายชื่อแล้ว");
  });
}

// ───────────────────────── ตั้งค่าการแข่งขัน ─────────────────────────

export async function saveTournamentAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return guarded(async () => {
    const session = await requireRole("ADMIN");
    const tournament = await prisma.tournament.findFirst();
    if (!tournament) return fail("ยังไม่ได้นำเข้าข้อมูลตั้งต้น");

    const venue = String(formData.get("venue") ?? "").trim();
    const venueConfirmed = formData.get("venueConfirmed") === "on" && venue.length > 0;
    const startDate = String(formData.get("startDate") ?? "");
    const endDate = String(formData.get("endDate") ?? "");
    const refreshMs = Number(formData.get("publicRefreshMs") ?? tournament.publicRefreshMs);

    if (startDate && endDate && new Date(startDate) > new Date(endDate)) {
      return fail("วันเริ่มต้องไม่หลังวันสิ้นสุด");
    }
    if (!Number.isFinite(refreshMs) || refreshMs < 1000 || refreshMs > 60000) {
      return fail("รอบรีเฟรชต้องอยู่ระหว่าง 1000-60000 มิลลิวินาที");
    }

    const dayDates = [1, 2, 3].map((n) => String(formData.get(`day${n}`) ?? ""));

    await prisma.$transaction(async (tx) => {
      await tx.tournament.update({
        where: { tournamentId: tournament.tournamentId },
        data: {
          venue: venue || null,
          venueConfirmed,
          startDate: startDate ? new Date(startDate) : null,
          endDate: endDate ? new Date(endDate) : null,
          publicRefreshMs: Math.round(refreshMs),
        },
      });
      for (const [idx, value] of dayDates.entries()) {
        await tx.tournamentDay.update({
          where: { tournamentId_dayNo: { tournamentId: tournament.tournamentId, dayNo: idx + 1 } },
          data: { actualDate: value ? new Date(value) : null },
        });
      }
      await writeAudit(
        {
          actorId: session.adminId,
          action: "TOURNAMENT_UPDATE",
          entityType: "tournament",
          entityId: tournament.tournamentId,
          before: {
            venue: tournament.venue,
            startDate: tournament.startDate,
            endDate: tournament.endDate,
          },
          after: { venue, venueConfirmed, startDate, endDate, dayDates },
          ...(await meta()),
        },
        tx,
      );
    });

    refreshPublicPages();
    return ok("บันทึกการตั้งค่าแล้ว");
  });
}

export async function saveTiebreakAction(input: {
  scope: "GROUP" | "L4_RR";
  key: string;
  orderedKeys: string[];
  note: string;
}): Promise<ActionResult> {
  return guarded(async () => {
    const session = await requireRole("ADMIN");
    if (input.orderedKeys.length < 2) return fail("ต้องระบุลำดับอย่างน้อย 2 รายการ");
    if (new Set(input.orderedKeys).size !== input.orderedKeys.length) return fail("มีรายการซ้ำในลำดับ");
    if (!input.note.trim()) return fail("ต้องระบุเหตุผลของคำชี้ขาด");

    await prisma.$transaction(async (tx) => {
      await tx.tiebreakDecision.upsert({
        where: { scope_key: { scope: input.scope, key: input.key } },
        update: { orderedKeys: input.orderedKeys, note: input.note, decidedBy: session.adminId },
        create: {
          scope: input.scope,
          key: input.key,
          orderedKeys: input.orderedKeys,
          note: input.note,
          decidedBy: session.adminId,
        },
      });
      await writeAudit(
        {
          actorId: session.adminId,
          action: "TIEBREAK_DECISION",
          entityType: "tiebreak_decision",
          entityId: `${input.scope}:${input.key}`,
          after: { orderedKeys: input.orderedKeys, note: input.note },
          ...(await meta()),
        },
        tx,
      );
    });

    refreshPublicPages();
    return ok("บันทึกคำชี้ขาดแล้ว");
  });
}

export async function updateChecklistAction(input: {
  id: number;
  status: "NOT_STARTED" | "IN_PROGRESS" | "READY" | "BLOCKED";
  note: string;
}): Promise<ActionResult> {
  return guarded(async () => {
    const session = await requireRole("ADMIN");
    const before = await prisma.checklistItem.findUnique({ where: { id: input.id } });
    if (!before) return fail("ไม่พบรายการนี้");

    await prisma.$transaction(async (tx) => {
      await tx.checklistItem.update({
        where: { id: input.id },
        data: { status: input.status, note: input.note || before.note },
      });
      await writeAudit(
        {
          actorId: session.adminId,
          action: "CHECKLIST_UPDATE",
          entityType: "checklist_item",
          entityId: String(input.id),
          before: { status: before.status },
          after: { status: input.status },
          ...(await meta()),
        },
        tx,
      );
    });

    revalidatePath("/admin");
    return ok();
  });
}

// ───────────────────────── ผู้ดูแลระบบ ─────────────────────────

export async function createAdminUserAction(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return guarded(async () => {
    const session = await requireRole("SUPERADMIN");
    const username = String(formData.get("username") ?? "").trim();
    const displayName = String(formData.get("displayName") ?? "").trim();
    const role = String(formData.get("role") ?? "SCORER") as "SCORER" | "ADMIN" | "SUPERADMIN";
    const password = String(formData.get("password") ?? "");

    if (!username || !displayName) return fail("กรอกชื่อผู้ใช้และชื่อที่แสดง");
    const weak = validatePasswordStrength(password);
    if (weak) return fail(weak);
    if (await prisma.adminUser.findUnique({ where: { username } })) {
      return fail("ชื่อผู้ใช้นี้ถูกใช้แล้ว");
    }

    const count = await prisma.adminUser.count();
    const adminId = `ADMIN-${String(count + 1).padStart(2, "0")}`;

    await prisma.$transaction(async (tx) => {
      await tx.adminUser.create({
        data: {
          adminId,
          username,
          displayName,
          role,
          passwordHash: await hashPassword(password),
          mustChangePassword: true,
        },
      });
      await writeAudit(
        {
          actorId: session.adminId,
          action: "ADMIN_USER_UPDATE",
          entityType: "admin_user",
          entityId: adminId,
          after: { username, displayName, role, created: true },
          ...(await meta()),
        },
        tx,
      );
    });

    revalidatePath("/admin/users");
    return ok(`สร้างบัญชี ${username} แล้ว — แจ้งให้เจ้าตัวเปลี่ยนรหัสผ่านเองที่เมนูเปลี่ยนรหัสผ่าน`);
  });
}

export async function setAdminActiveAction(input: {
  adminId: string;
  active: boolean;
}): Promise<ActionResult> {
  return guarded(async () => {
    const session = await requireRole("SUPERADMIN");
    if (input.adminId === session.adminId) return fail("ปิดบัญชีตัวเองไม่ได้");

    const before = await prisma.adminUser.findUnique({ where: { adminId: input.adminId } });
    if (!before) return fail("ไม่พบบัญชีนี้");

    if (!input.active && before.role === "SUPERADMIN") {
      const remaining = await prisma.adminUser.count({
        where: { role: "SUPERADMIN", active: true, adminId: { not: input.adminId } },
      });
      if (remaining === 0) return fail("ต้องเหลือหัวหน้าผู้ดูแลที่ใช้งานได้อย่างน้อย 1 บัญชี");
    }

    await prisma.$transaction(async (tx) => {
      await tx.adminUser.update({ where: { adminId: input.adminId }, data: { active: input.active } });
      await writeAudit(
        {
          actorId: session.adminId,
          action: "ADMIN_USER_UPDATE",
          entityType: "admin_user",
          entityId: input.adminId,
          before: { active: before.active },
          after: { active: input.active },
          ...(await meta()),
        },
        tx,
      );
    });

    revalidatePath("/admin/users");
    return ok();
  });
}

// ───────────────────────── โหมดทดสอบ ─────────────────────────

/**
 * ล้างผลทั้งหมดกลับสู่สถานะก่อนแข่ง
 * ใช้ตอนซ้อมระบบเท่านั้น และทำได้เฉพาะเมื่อเปิด simulation_enabled ไว้
 */
export async function simulateAllResultsAction(): Promise<ActionResult> {
  return guarded(async () => {
    const session = await requireRole("SUPERADMIN");
    const tournament = await prisma.tournament.findFirst();
    if (!tournament) return fail("ยังไม่ได้นำเข้าข้อมูลตั้งต้น");
    if (!tournament.simulationEnabled) {
      return fail("ต้องเปิดโหมดจำลองก่อน จึงจะสุ่มผลได้");
    }

    const outcome = await simulateAllResults(session.adminId);

    refreshPublicPages();
    return ok(
      `จำลองผลแล้ว ${outcome.matchesFilled} แมตช์` +
        (outcome.drawsCreated ? ` · จับสลากอัตโนมัติ ${outcome.drawsCreated} ช่อง` : "") +
        (outcome.lineupsCreated ? ` · ส่งซองอัตโนมัติ ${outcome.lineupsCreated} รายการ` : "") +
        " — อย่าลืมคืนค่าก่อนแข่งจริง",
    );
  });
}

export async function resetAllResultsAction(input: {
  confirmText: string;
  /** RESULTS = ล้างเฉพาะผล · ALL = ล้างผล + จับสลาก + ซองรายชื่อ */
  scope: "RESULTS" | "ALL";
}): Promise<ActionResult> {
  return guarded(async () => {
    const session = await requireRole("SUPERADMIN");
    const tournament = await prisma.tournament.findFirst();
    if (!tournament) return fail("ยังไม่ได้นำเข้าข้อมูลตั้งต้น");
    if (!tournament.simulationEnabled) {
      return fail("ต้องเปิดโหมดจำลองก่อน จึงจะล้างผลทั้งหมดได้");
    }
    if (input.confirmText !== "ล้างผลทั้งหมด") {
      return fail('พิมพ์ข้อความ "ล้างผลทั้งหมด" เพื่อยืนยัน');
    }

    const affected = await prisma.match.count({ where: { status: { not: "WAITING" } } });
    const wipeDraw = input.scope === "ALL";

    await prisma.$transaction(async (tx) => {
      await tx.matchGame.deleteMany({});
      await tx.match.updateMany({
        data: {
          status: "WAITING",
          walkover: false,
          walkoverSide: null,
          publicUpdatedAt: null,
          updatedById: null,
          adminNote: null,
        },
      });
      if (wipeDraw) {
        await tx.level4Lineup.deleteMany({});
        await tx.drawAssignment.deleteMany({});
        await tx.tiebreakDecision.deleteMany({});
        await tx.level4Tie.updateMany({ data: { status: "WAITING", winnerTeamCode: null } });
      }
      await writeAudit(
        {
          actorId: session.adminId,
          action: "MATCH_RESET",
          entityType: "tournament",
          entityId: tournament.tournamentId,
          before: { matchesWithResults: affected },
          after: { reset: true, scope: input.scope },
          ...(await meta()),
        },
        tx,
      );
    });

    refreshPublicPages();
    return ok(
      `ล้างผล ${affected} แมตช์กลับสู่สถานะรอแข่งขันแล้ว` +
        (wipeDraw ? " · ล้างผลจับสลากและซองรายชื่อด้วยแล้ว" : ""),
    );
  });
}

export async function setSystemFlagsAction(input: {
  simulationEnabled: boolean;
  publicAdminTestMode: boolean;
}): Promise<ActionResult> {
  return guarded(async () => {
    const session = await requireRole("SUPERADMIN");
    const tournament = await prisma.tournament.findFirst();
    if (!tournament) return fail("ยังไม่ได้นำเข้าข้อมูลตั้งต้น");

    await prisma.$transaction(async (tx) => {
      await tx.tournament.update({
        where: { tournamentId: tournament.tournamentId },
        data: {
          simulationEnabled: input.simulationEnabled,
          publicAdminTestMode: input.publicAdminTestMode,
        },
      });
      await writeAudit(
        {
          actorId: session.adminId,
          action: "TOURNAMENT_UPDATE" as AuditAction,
          entityType: "tournament",
          entityId: tournament.tournamentId,
          before: {
            simulationEnabled: tournament.simulationEnabled,
            publicAdminTestMode: tournament.publicAdminTestMode,
          },
          after: input,
          ...(await meta()),
        },
        tx,
      );
    });

    revalidatePath("/admin/settings");
    return ok("บันทึกแล้ว");
  });
}
