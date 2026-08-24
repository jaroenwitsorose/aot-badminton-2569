import "server-only";
import { redirect } from "next/navigation";
import { getSession, type Session } from "./auth";
import { ROLE_RANK, type Role } from "./roles";

/**
 * ใช้บนหน้า Admin ทุกหน้า: ยังไม่ล็อกอินให้เด้งไปหน้าเข้าสู่ระบบ
 * และถ้ายังไม่เปลี่ยนรหัสผ่านครั้งแรก ให้บังคับเปลี่ยนก่อนใช้งาน
 */
export async function requirePage(minimum: Role = "SCORER"): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/admin/login");
  if (session.mustChangePassword) redirect("/admin/password");
  if (ROLE_RANK[session.role] < ROLE_RANK[minimum]) redirect("/admin?denied=1");
  return session;
}
