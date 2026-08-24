import { requirePage } from "@/lib/page-guard";
import { getTournamentSnapshot } from "@/lib/tournament";
import { ScoreBoard } from "./score-board";

export const dynamic = "force-dynamic";

export default async function ScoresPage() {
  const session = await requirePage("SCORER");
  const snapshot = await getTournamentSnapshot();

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="m-0 text-base font-semibold">กรอกผลการแข่งขัน</h2>
        <p className="m-0 text-[13px]" style={{ color: "var(--muted)" }}>
          Best of 3 · ชนะที่ 21 ต้องห่าง 2 แต้ม เพดาน 30 · Walkover บันทึกเป็น 21-0, 21-0
        </p>
      </div>
      <ScoreBoard
        matches={snapshot.matches}
        days={snapshot.days}
        levels={snapshot.levels}
        canReset={session.role !== "SCORER"}
      />
    </div>
  );
}
