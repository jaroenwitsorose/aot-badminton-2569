import { requirePage } from "@/lib/page-guard";
import { prisma } from "@/lib/prisma";
import { ParticipantEditor } from "./participant-editor";

export const dynamic = "force-dynamic";

export default async function ParticipantsPage() {
  await requirePage("ADMIN");

  const [pairs, levels, teams] = await Promise.all([
    prisma.pair.findMany({
      include: { participants: { orderBy: { playerNo: "asc" } } },
      orderBy: [{ levelCode: "asc" }, { teamCode: "asc" }, { eventType: "asc" }, { slotNo: "asc" }],
    }),
    prisma.level.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.team.findMany({ orderBy: { displayOrder: "asc" } }),
  ]);

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="m-0 text-base font-semibold">รายชื่อนักกีฬา</h2>
        <p className="m-0 text-[13px]" style={{ color: "var(--muted)" }}>
          กรอกชื่อจริง รหัสพนักงาน ระดับมือ และเพศ · ระบบจะเตือนถ้ารหัสพนักงานซ้ำหรือระดับมือไม่ตรงเกณฑ์
        </p>
      </div>

      <ParticipantEditor
        levels={levels.map((l) => ({ levelCode: l.levelCode, nameTh: l.nameTh, eventTypes: l.eventTypes }))}
        teams={teams.map((t) => ({ teamCode: t.teamCode, nameTh: t.nameTh, colorHex: t.colorHex }))}
        pairs={pairs.map((p) => ({
          pairUid: p.pairUid,
          levelCode: p.levelCode,
          teamCode: p.teamCode,
          slotNo: p.slotNo,
          eventType: p.eventType,
          publicPairCode: p.publicPairCode,
          eventLocked: Boolean(p.eventLockedAt),
          players: p.participants.map((x) => ({
            participantUid: x.participantUid,
            playerNo: x.playerNo,
            displayCode: x.displayCode,
            actualName: x.actualName ?? "",
            employeeId: x.employeeId ?? "",
            skillRank: x.skillRank ?? "",
            gender: x.gender ?? "",
          })),
        }))}
      />
    </div>
  );
}
