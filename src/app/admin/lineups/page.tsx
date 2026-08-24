import { requirePage } from "@/lib/page-guard";
import { prisma } from "@/lib/prisma";
import { getTournamentSnapshot } from "@/lib/tournament";
import { LineupBoard } from "./lineup-board";

export const dynamic = "force-dynamic";

export default async function LineupsPage() {
  await requirePage("ADMIN");

  const [snapshot, lineups, pairs, teams] = await Promise.all([
    getTournamentSnapshot(),
    prisma.level4Lineup.findMany(),
    prisma.pair.findMany({
      where: { levelCode: "LEVEL4" },
      include: { participants: { orderBy: { playerNo: "asc" } } },
      orderBy: [{ teamCode: "asc" }, { slotNo: "asc" }],
    }),
    prisma.team.findMany({ orderBy: { displayOrder: "asc" } }),
  ]);

  const teamByCode = new Map(teams.map((t) => [t.teamCode, t]));

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="m-0 text-base font-semibold">ซองรายชื่อมือทั่วไป</h2>
        <p className="m-0 text-[13px]" style={{ color: "var(--muted)" }}>
          ส่งพร้อมกันทั้งสองสี · คู่ที่ 1 ต้องมีระดับมือไม่ต่ำกว่าคู่ที่ 2 และ 3 ·
          คู่สีที่เริ่มแข่งแล้วแก้ซองไม่ได้
        </p>
      </div>

      <LineupBoard
        ties={snapshot.ties.map((t) => ({
          tieId: t.tieId,
          stage: t.stage,
          dayLabel: t.dayLabel,
          startTime: t.startTime,
          status: t.status,
          teamACode: t.teamACode,
          teamBCode: t.teamBCode,
          pendingLabelA: t.pendingLabelA,
          pendingLabelB: t.pendingLabelB,
          started: snapshot.matches.some((m) => m.tieId === t.tieId && m.status !== "WAITING"),
        }))}
        lineups={lineups.map((l) => ({
          tieId: l.tieId,
          teamCode: l.teamCode,
          orderNo: l.orderNo,
          pairUid: l.pairUid,
        }))}
        pairs={pairs.map((p) => ({
          pairUid: p.pairUid,
          teamCode: p.teamCode,
          withdrawn: p.withdrawn,
          ranks: p.participants.map((x) => x.skillRank),
          label:
            p.participants
              .map((x) => x.actualName ?? x.displayCode ?? "")
              .filter(Boolean)
              .join(" / ") || `${teamByCode.get(p.teamCode)?.nameTh ?? p.teamCode} คู่ที่ ${p.slotNo}`,
        }))}
        teams={teams.map((t) => ({ teamCode: t.teamCode, nameTh: t.nameTh, colorHex: t.colorHex }))}
      />
    </div>
  );
}
