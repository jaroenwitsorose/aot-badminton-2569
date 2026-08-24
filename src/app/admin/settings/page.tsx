import { requirePage } from "@/lib/page-guard";
import { prisma } from "@/lib/prisma";
import { SettingsForm } from "./settings-form";
import { SystemFlags } from "./system-flags";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await requirePage("ADMIN");
  const [tournament, days] = await Promise.all([
    prisma.tournament.findFirst(),
    prisma.tournamentDay.findMany({ orderBy: { dayNo: "asc" } }),
  ]);
  if (!tournament) return <p>ยังไม่ได้นำเข้าข้อมูลตั้งต้น</p>;

  const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

  return (
    <div className="flex flex-col gap-4">
      <SettingsForm
        venue={tournament.venue ?? ""}
        venueConfirmed={tournament.venueConfirmed}
        startDate={iso(tournament.startDate)}
        endDate={iso(tournament.endDate)}
        publicRefreshMs={tournament.publicRefreshMs}
        days={days.map((d) => ({ dayNo: d.dayNo, labelTemp: d.labelTemp, actualDate: iso(d.actualDate) }))}
      />

      {session.role === "SUPERADMIN" ? (
        <SystemFlags
          simulationEnabled={tournament.simulationEnabled}
          publicAdminTestMode={tournament.publicAdminTestMode}
        />
      ) : (
        <div className="panel p-4 text-[13px]" style={{ color: "var(--muted)" }}>
          การเปิด/ปิดโหมดจำลองและการล้างผลทั้งหมด ต้องใช้สิทธิ์หัวหน้าผู้ดูแล
        </div>
      )}
    </div>
  );
}
