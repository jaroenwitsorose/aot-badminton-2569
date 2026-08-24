import Link from "next/link";
import { requirePage } from "@/lib/page-guard";
import { prisma } from "@/lib/prisma";
import { getTournamentSnapshot } from "@/lib/tournament";
import { ChecklistTable } from "./checklist-table";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const session = await requirePage("SCORER");
  const [snapshot, checklist] = await Promise.all([
    getTournamentSnapshot(),
    prisma.checklistItem.findMany({ orderBy: [{ blocking: "desc" }, { id: "asc" }] }),
  ]);

  const r = snapshot.readiness;
  const cards = [
    { label: "แมตช์ที่แข่งจบ", value: `${r.matchesCompleted}/${r.matchesTotal}`, href: "/admin/scores" },
    { label: "กรอกชื่อนักกีฬา", value: `${r.namesFilled}/${r.namesTotal}`, href: "/admin/participants" },
    { label: "ล็อกประเภท MD/WD/XD", value: `${r.eventLocked}/${r.eventTotal}`, href: "/admin/participants" },
    { label: "จับสลากเข้าสาย", value: `${r.drawAssigned}/${r.drawTotal}`, href: "/admin/draw" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <section>
        <h2 className="mb-2 mt-0 text-base font-semibold">ความพร้อมของข้อมูล</h2>
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))" }}>
          {cards.map((c) => (
            <Link key={c.label} href={c.href} className="panel p-4 no-underline">
              <div className="text-[13px]" style={{ color: "var(--muted)" }}>
                {c.label}
              </div>
              <div className="tabular mt-1 text-2xl font-bold">{c.value}</div>
            </Link>
          ))}
        </div>
      </section>

      {snapshot.warnings.length > 0 ? (
        <section>
          <h2 className="mb-2 mt-0 text-base font-semibold">สิ่งที่ระบบตรวจพบ</h2>
          <ul className="panel m-0 list-none space-y-2 p-4 text-[14px]">
            {snapshot.warnings.map((w) => (
              <li key={w} className="flex gap-2">
                <span aria-hidden style={{ color: "#b45309" }}>
                  ●
                </span>
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2 className="mb-1 mt-0 text-base font-semibold">Checklist ก่อน Go-live</h2>
        <p className="mb-2 mt-0 text-[13px]" style={{ color: "var(--muted)" }}>
          รายการที่ทำเครื่องหมาย &quot;ต้องผ่าน&quot; ต้องเป็น &quot;พร้อม&quot; ทั้งหมดก่อนเปิดเว็บไซต์จริง ·
          ค้างอยู่ {r.blockingOpen} รายการ
        </p>
        <ChecklistTable
          items={checklist.map((c) => ({
            id: c.id,
            area: c.area,
            item: c.item,
            owner: c.owner,
            status: c.status,
            blocking: c.blocking,
            note: c.note,
          }))}
          canEdit={session.role !== "SCORER"}
        />
      </section>
    </div>
  );
}
