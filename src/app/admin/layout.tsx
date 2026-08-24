import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ROLE_TH } from "@/lib/labels";
import { AdminNav } from "./admin-nav";
import { LogoutButton } from "./logout-button";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  const tournament = await prisma.tournament.findFirst();

  return (
    <main className="admin-shell shell">
      {tournament?.publicAdminTestMode ? (
        <div className="admin-banner danger">
          เปิด Public Admin Test Mode อยู่ — ต้องปิดก่อนเปิดใช้งานจริง
        </div>
      ) : null}
      {tournament?.simulationEnabled ? (
        <div className="admin-banner">
          โหมดจำลองเปิดอยู่ — ผลที่เห็นอาจเป็นผลซ้อม ต้องล้างและปิดโหมดก่อนแข่งจริง
        </div>
      ) : null}

      <div className="admin-topbar">
        <div>
          <h1 style={{ margin: 0, fontSize: 20 }}>ระบบผู้ดูแล</h1>
          <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>
            ทุกการแก้ไขถูกบันทึกไว้ตรวจย้อนหลังได้
          </p>
        </div>
        {session ? (
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12, fontSize: 13 }}>
            <span style={{ color: "var(--muted)" }}>
              {session.displayName} · {ROLE_TH[session.role]}
            </span>
            <LogoutButton />
          </div>
        ) : null}
      </div>

      {session ? <AdminNav role={session.role} /> : null}

      <div style={{ marginTop: 18 }}>{children}</div>
    </main>
  );
}
