import "server-only";
import { redirect } from "next/navigation";
import { getSession, type Session } from "./auth";
import { ROLE_RANK, type Role } from "./roles";

/**
 * ใช้บนหน้า Admin ทุกหน้า: ยังไม่ล็อกอินให้เด้งไปหน้าเข้าสู่ระบบ
 *
 * ไม่บังคับเปลี่ยนรหัสผ่าน — ผู้ใช้เปลี่ยนเองได้ที่เมนู "เปลี่ยนรหัสผ่าน" เมื่อต้องการ
 */
export async function requirePage(minimum: Role = "SCORER"): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/admin/login");
  if (ROLE_RANK[session.role] < ROLE_RANK[minimum]) redirect("/admin?denied=1");
  return session;
}
