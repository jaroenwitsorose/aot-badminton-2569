/**
 * การยืนยันตัวตนของผู้ดูแล
 *
 * - session เก็บใน cookie แบบ httpOnly + SameSite=Lax + Secure (บน production)
 * - หน้าสาธารณะอ่านอย่างเดียว ไม่ต้องล็อกอิน
 * - ทุก endpoint ที่แก้ข้อมูลต้องผ่าน requireRole() และบันทึก audit log
 */

import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

import { ROLE_RANK, type Role } from "./roles";

export type { Role };

const COOKIE_NAME = "aot_badminton_session";
const SESSION_HOURS = 12;

/**
 * โหมดปิดการล็อกอินชั่วคราว (ใช้ระหว่างพัฒนา/ทดสอบให้ระบบนิ่งก่อน)
 *
 * เปิดใช้โดยตั้ง env `ADMIN_AUTH_DISABLED=true` เท่านั้น — ค่าเริ่มต้นคือ "เปิดล็อกอินตามปกติ"
 * ระหว่างปิด ทุกคนที่เข้าถึง /admin ได้จะมีสิทธิ์ระดับหัวหน้าผู้ดูแลทันที
 *
 * ⚠️ ต้องลบ env นี้ออกก่อนกรอกรายชื่อนักกีฬาจริงและก่อนเปิดใช้งานวันแข่ง
 */
export function isAuthDisabled(): boolean {
  return process.env.ADMIN_AUTH_DISABLED === "true";
}

/** บัญชีที่ใช้แทนตัวตนระหว่างปิดล็อกอิน — ต้องมีอยู่จริงในฐานข้อมูล เพราะ audit log อ้างถึง */
async function fallbackAdminSession(): Promise<Session | null> {
  const user =
    (await prisma.adminUser.findFirst({
      where: { active: true, role: "SUPERADMIN" },
      orderBy: { adminId: "asc" },
    })) ?? (await prisma.adminUser.findFirst({ where: { active: true }, orderBy: { adminId: "asc" } }));
  if (!user) return null;
  return {
    adminId: user.adminId,
    username: user.username,
    displayName: user.displayName,
    role: user.role as Role,
    mustChangePassword: user.mustChangePassword,
  };
}

export interface Session {
  adminId: string;
  username: string;
  displayName: string;
  role: Role;
  mustChangePassword: boolean;
}

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("ต้องตั้งค่า AUTH_SECRET (อย่างน้อย 32 ตัวอักษร) ก่อนใช้งาน");
  }
  return new TextEncoder().encode(secret);
}

export async function createSession(session: Session): Promise<void> {
  const token = await new SignJWT({ ...session })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(secretKey());

  const store = await cookies();
  store.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

export async function getSession(): Promise<Session | null> {
  // ปิดล็อกอินชั่วคราว: ให้สิทธิ์หัวหน้าผู้ดูแลโดยไม่ต้องมี cookie
  if (isAuthDisabled()) return fallbackAdminSession();

  const store = await cookies();
  const token = store.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    const session = payload as unknown as Session;
    // ตรวจกับฐานข้อมูลทุกครั้ง เผื่อบัญชีถูกปิดระหว่างที่ session ยังไม่หมดอายุ
    const user = await prisma.adminUser.findUnique({ where: { adminId: session.adminId } });
    if (!user || !user.active) return null;
    return {
      adminId: user.adminId,
      username: user.username,
      displayName: user.displayName,
      role: user.role as Role,
      mustChangePassword: user.mustChangePassword,
    };
  } catch {
    return null;
  }
}

export class AuthError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/** คืน session ถ้าสิทธิ์ถึงระดับที่ต้องการ ไม่ถึงให้โยน AuthError */
export async function requireRole(minimum: Role): Promise<Session> {
  const session = await getSession();
  if (!session) throw new AuthError("ต้องเข้าสู่ระบบก่อน", 401);
  if (ROLE_RANK[session.role] < ROLE_RANK[minimum]) {
    throw new AuthError("สิทธิ์ไม่เพียงพอสำหรับการทำรายการนี้", 403);
  }
  return session;
}

/**
 * ตรวจรหัสผ่านอย่างเดียว ไม่มีผลข้างเคียง
 * ใช้ตอนยืนยันรหัสผ่านเดิมในหน้าเปลี่ยนรหัสผ่าน ซึ่งไม่ใช่การเข้าสู่ระบบใหม่
 */
export async function checkPassword(username: string, password: string): Promise<Session | null> {
  const user = await prisma.adminUser.findUnique({ where: { username } });
  if (!user || !user.active) return null;
  if (!(await bcrypt.compare(password, user.passwordHash))) return null;

  return {
    adminId: user.adminId,
    username: user.username,
    displayName: user.displayName,
    role: user.role as Role,
    mustChangePassword: user.mustChangePassword,
  };
}

/** ใช้ตอนเข้าสู่ระบบเท่านั้น — บันทึกเวลาเข้าใช้ล่าสุดด้วย */
export async function verifyPassword(username: string, password: string): Promise<Session | null> {
  const session = await checkPassword(username, password);
  if (!session) return null;

  await prisma.adminUser.update({
    where: { adminId: session.adminId },
    data: { lastLoginAt: new Date() },
  });

  return session;
}

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

/** เกณฑ์รหัสผ่านขั้นต่ำสำหรับระบบที่เปิดสาธารณะ */
export function validatePasswordStrength(plain: string): string | null {
  if (plain.length < 12) return "รหัสผ่านต้องยาวอย่างน้อย 12 ตัวอักษร";
  if (!/[a-z]/.test(plain)) return "ต้องมีตัวอักษรพิมพ์เล็กอย่างน้อย 1 ตัว";
  if (!/[A-Z]/.test(plain)) return "ต้องมีตัวอักษรพิมพ์ใหญ่อย่างน้อย 1 ตัว";
  if (!/[0-9]/.test(plain)) return "ต้องมีตัวเลขอย่างน้อย 1 ตัว";
  return null;
}
