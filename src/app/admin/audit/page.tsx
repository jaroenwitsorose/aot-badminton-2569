import { requirePage } from "@/lib/page-guard";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const ACTION_TH: Record<string, string> = {
  LOGIN: "เข้าสู่ระบบ",
  LOGOUT: "ออกจากระบบ",
  PASSWORD_CHANGE: "เปลี่ยนรหัสผ่าน",
  MATCH_SCORE_UPDATE: "บันทึกผลแมตช์",
  MATCH_STATUS_UPDATE: "เปลี่ยนสถานะแมตช์",
  MATCH_WALKOVER: "บันทึก Walkover",
  MATCH_RESET: "ล้างผลแมตช์",
  DRAW_ASSIGN: "จับสลาก",
  DRAW_CLEAR: "ล้างการจับสลาก",
  LINEUP_SUBMIT: "ส่งซองรายชื่อ",
  PARTICIPANT_UPDATE: "แก้ข้อมูลนักกีฬา",
  PAIR_EVENT_LOCK: "ล็อกประเภทคู่",
  TOURNAMENT_UPDATE: "แก้ข้อมูลการแข่งขัน",
  TIEBREAK_DECISION: "คำชี้ขาดเสมอ",
  CHECKLIST_UPDATE: "อัปเดต Checklist",
  ADMIN_USER_UPDATE: "จัดการบัญชีผู้ดูแล",
};

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  await requirePage("ADMIN");
  const params = await searchParams;
  const page = Math.max(1, Number(params.page ?? 1));
  const pageSize = 100;

  const [logs, total] = await Promise.all([
    prisma.auditLog.findMany({
      include: { actor: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count(),
  ]);

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="m-0 text-base font-semibold">ประวัติการแก้ไข</h2>
        <p className="m-0 text-[13px]" style={{ color: "var(--muted)" }}>
          ทั้งหมด {total} รายการ · หน้า {page}/{pages}
        </p>
      </div>

      <div className="panel scroll-x">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr style={{ color: "var(--muted)", fontSize: 12 }}>
              <th className="whitespace-nowrap px-3 py-2 text-left font-medium">เวลา</th>
              <th className="whitespace-nowrap px-3 py-2 text-left font-medium">ผู้ทำรายการ</th>
              <th className="whitespace-nowrap px-3 py-2 text-left font-medium">การกระทำ</th>
              <th className="whitespace-nowrap px-3 py-2 text-left font-medium">รายการ</th>
              <th className="px-3 py-2 text-left font-medium">ก่อน → หลัง</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={String(log.id)} className="border-t align-top" style={{ borderColor: "var(--line)" }}>
                <td className="tabular whitespace-nowrap px-3 py-2" style={{ color: "var(--muted)" }}>
                  {log.createdAt.toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}
                </td>
                <td className="whitespace-nowrap px-3 py-2">{log.actor.displayName}</td>
                <td className="whitespace-nowrap px-3 py-2">{ACTION_TH[log.action] ?? log.action}</td>
                <td className="whitespace-nowrap px-3 py-2" style={{ color: "var(--muted)" }}>
                  {log.entityId}
                </td>
                <td className="px-3 py-2">
                  <code className="text-[11px]" style={{ color: "var(--faint)", wordBreak: "break-all" }}>
                    {log.beforeJson ? JSON.stringify(log.beforeJson) : "—"} →{" "}
                    {log.afterJson ? JSON.stringify(log.afterJson) : "—"}
                  </code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 ? (
        <div className="flex gap-2 text-[13px]">
          {page > 1 ? <a href={`/admin/audit?page=${page - 1}`}>← ก่อนหน้า</a> : null}
          {page < pages ? <a href={`/admin/audit?page=${page + 1}`}>ถัดไป →</a> : null}
        </div>
      ) : null}
    </div>
  );
}
