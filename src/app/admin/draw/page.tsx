import { requirePage } from "@/lib/page-guard";
import { prisma } from "@/lib/prisma";
import { DrawBoard } from "./draw-board";

export const dynamic = "force-dynamic";

const LEVEL_OF_SHORT: Record<string, string> = {
  L1: "LEVEL1",
  L2: "LEVEL2",
  L3: "LEVEL3",
  L4: "LEVEL4",
};

export default async function DrawPage() {
  await requirePage("ADMIN");

  const [matches, draws, pairs, levels, teams] = await Promise.all([
    prisma.match.findMany({ orderBy: { matchNo: "asc" } }),
    prisma.drawAssignment.findMany(),
    prisma.pair.findMany({ include: { participants: { orderBy: { playerNo: "asc" } } } }),
    prisma.level.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.team.findMany({ orderBy: { displayOrder: "asc" } }),
  ]);

  // รวบรวมช่องที่ต้องจับสลากจากที่มาของทุกแมตช์
  const slotMap = new Map<string, { token: string; levelCode: string; matchNo: number; started: boolean }>();
  for (const m of matches) {
    for (const source of [m.sideASource, m.sideBSource]) {
      if (!source.startsWith("SEED:") && !source.startsWith("GROUP:")) continue;
      const levelCode = LEVEL_OF_SHORT[source.split(":")[1]];
      const existing = slotMap.get(source);
      slotMap.set(source, {
        token: source,
        levelCode,
        matchNo: existing ? Math.min(existing.matchNo, m.matchNo) : m.matchNo,
        started: (existing?.started ?? false) || m.status !== "WAITING",
      });
    }
  }

  const assignedByToken = new Map(draws.map((d) => [d.token, d.pairUid]));
  const teamByCode = new Map(teams.map((t) => [t.teamCode, t]));

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="m-0 text-base font-semibold">จับสลากเข้าสาย</h2>
        <p className="m-0 text-[13px]" style={{ color: "var(--muted)" }}>
          จับคู่ &quot;ช่องในสาย&quot; กับ &quot;คู่แข่งขัน&quot; · ระบบจะคลี่สายที่เหลือให้เองเมื่อผลออก ·
          ช่องที่มีแมตช์เริ่มแข่งแล้วจะแก้ไม่ได้
        </p>
        <p className="m-0 mt-1 text-[12px]" style={{ color: "var(--muted)" }}>
          กรอกทีเดียวหลายรายการได้ที่{" "}
          <a href="/admin/participants" style={{ textDecoration: "underline" }}>
            รายชื่อนักกีฬา → กรอกข้อมูลด้วยไฟล์ Excel
          </a>
        </p>
      </div>

      <DrawBoard
        levels={levels.map((l) => ({ levelCode: l.levelCode, nameTh: l.nameTh }))}
        slots={[...slotMap.values()].sort((a, b) => a.token.localeCompare(b.token)).map((s) => ({
          ...s,
          pairUid: assignedByToken.get(s.token) ?? null,
        }))}
        pairs={pairs.map((p) => ({
          pairUid: p.pairUid,
          levelCode: p.levelCode,
          teamCode: p.teamCode,
          teamNameTh: teamByCode.get(p.teamCode)?.nameTh ?? p.teamCode,
          colorHex: teamByCode.get(p.teamCode)?.colorHex ?? "#888",
          slotNo: p.slotNo,
          eventType: p.eventType,
          withdrawn: p.withdrawn,
          label:
            p.participants
              .map((x) => x.actualName ?? x.displayCode ?? "")
              .filter(Boolean)
              .join(" / ") || `${teamByCode.get(p.teamCode)?.nameTh ?? p.teamCode} คู่ที่ ${p.slotNo}`,
        }))}
      />
    </div>
  );
}
