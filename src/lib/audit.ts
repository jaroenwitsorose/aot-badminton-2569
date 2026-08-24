/**
 * Audit log — "ทุกการแก้ผลต้องตรวจย้อนหลังได้"
 *
 * เรียก writeAudit() ในทรานแซกชันเดียวกับการแก้ข้อมูลเสมอ เพื่อไม่ให้มีการแก้ไขที่ไม่มีร่องรอย
 */

import "server-only";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";

export type AuditAction =
  | "LOGIN"
  | "LOGOUT"
  | "PASSWORD_CHANGE"
  | "MATCH_SCORE_UPDATE"
  | "MATCH_STATUS_UPDATE"
  | "MATCH_WALKOVER"
  | "MATCH_RESET"
  | "DRAW_ASSIGN"
  | "DRAW_CLEAR"
  | "LINEUP_SUBMIT"
  | "PARTICIPANT_UPDATE"
  | "PAIR_EVENT_LOCK"
  | "TOURNAMENT_UPDATE"
  | "TIEBREAK_DECISION"
  | "CHECKLIST_UPDATE"
  | "SIMULATION_RUN"
  | "ADMIN_USER_UPDATE";

interface AuditInput {
  actorId: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  userAgent?: string | null;
}

type Client = PrismaClient | Prisma.TransactionClient;

export async function writeAudit(input: AuditInput, client: Client = prisma): Promise<void> {
  await client.auditLog.create({
    data: {
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      beforeJson: (input.before ?? null) as Prisma.InputJsonValue,
      afterJson: (input.after ?? null) as Prisma.InputJsonValue,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    },
  });
}

/** ดึงข้อมูลผู้เรียกจาก request เพื่อบันทึกลง audit log */
export function requestMeta(req: Request): { ip: string | null; userAgent: string | null } {
  const forwarded = req.headers.get("x-forwarded-for");
  return {
    ip: forwarded ? forwarded.split(",")[0].trim() : req.headers.get("x-real-ip"),
    userAgent: req.headers.get("user-agent"),
  };
}
