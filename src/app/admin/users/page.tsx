import { requirePage } from "@/lib/page-guard";
import { prisma } from "@/lib/prisma";
import { UserManager } from "./user-manager";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const session = await requirePage("SUPERADMIN");
  const users = await prisma.adminUser.findMany({ orderBy: { adminId: "asc" } });

  return (
    <UserManager
      currentAdminId={session.adminId}
      users={users.map((u) => ({
        adminId: u.adminId,
        username: u.username,
        displayName: u.displayName,
        role: u.role,
        active: u.active,
        mustChangePassword: u.mustChangePassword,
        lastLoginAt: u.lastLoginAt ? u.lastLoginAt.toLocaleString("th-TH", { timeZone: "Asia/Bangkok" }) : null,
      }))}
    />
  );
}
