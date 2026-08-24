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

export async function verifyPassword(username: string, password: string): Promise<Session | null> {
  const user = await prisma.adminUser.findUnique({ where: { username } });
  if (!user || !user.active) return null;
  if (!(await bcrypt.compare(password, user.passwordHash))) return null;

  await prisma.adminUser.update({
    where: { adminId: user.adminId },
    data: { lastLoginAt: new Date() },
  });

  return {
    adminId: user.adminId,
    username: user.username,
    displayName: user.displayName,
    role: user.role as Role,
    mustChangePassword: user.mustChangePassword,
  };
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
