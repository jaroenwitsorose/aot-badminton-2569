/** บทบาทและลำดับสิทธิ์ — ใช้ได้ทั้งฝั่ง server และ client (ห้าม import อะไรที่เป็น server-only) */

export type Role = "SCORER" | "ADMIN" | "SUPERADMIN";

/** SUPERADMIN ทำได้ทุกอย่างที่ ADMIN ทำได้ และ ADMIN ทำได้ทุกอย่างที่ SCORER ทำได้ */
export const ROLE_RANK: Record<Role, number> = { SCORER: 1, ADMIN: 2, SUPERADMIN: 3 };

export function canAccess(role: Role, minimum: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minimum];
}
