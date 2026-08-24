"use client";

import { useState, useTransition } from "react";
import { updateChecklistAction } from "./actions";
import { CHECK_STATUS_TH } from "@/lib/labels";

interface Item {
  id: number;
  area: string;
  item: string;
  owner: string | null;
  status: string;
  blocking: boolean;
  note: string | null;
}

const STATUSES = ["NOT_STARTED", "IN_PROGRESS", "READY", "BLOCKED"] as const;

export function ChecklistTable({ items, canEdit }: { items: Item[]; canEdit: boolean }) {
  const [rows, setRows] = useState(items);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const update = (id: number, status: (typeof STATUSES)[number]) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    startTransition(async () => {
      const res = await updateChecklistAction({ id, status, note: "" });
      if (!res.ok) {
        setError(res.error);
        setRows(items);
      } else {
        setError(null);
      }
    });
  };

  return (
    <div className="panel scroll-x">
      {error ? (
        <p className="m-0 px-3 pt-3 text-[13px]" style={{ color: "#b91c1c" }}>
          {error}
        </p>
      ) : null}
      <table className="w-full border-collapse text-[14px]">
        <thead>
          <tr style={{ color: "var(--muted)", fontSize: 12 }}>
            <th className="px-3 py-2 text-left font-medium">ด้าน</th>
            <th className="px-3 py-2 text-left font-medium">รายการ</th>
            <th className="whitespace-nowrap px-3 py-2 text-left font-medium">ผู้รับผิดชอบ</th>
            <th className="whitespace-nowrap px-3 py-2 text-left font-medium">สถานะ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-t align-top" style={{ borderColor: "var(--line)" }}>
              <td className="whitespace-nowrap px-3 py-2" style={{ color: "var(--muted)" }}>
                {row.area}
              </td>
              <td className="px-3 py-2">
                {row.item}
                {row.blocking ? (
                  <span className="ml-2 text-[11px]" style={{ color: "#b91c1c" }}>
                    ต้องผ่าน
                  </span>
                ) : null}
                {row.note ? (
                  <div className="text-[12px]" style={{ color: "var(--faint)" }}>
                    {row.note}
                  </div>
                ) : null}
              </td>
              <td className="whitespace-nowrap px-3 py-2" style={{ color: "var(--muted)" }}>
                {row.owner ?? "—"}
              </td>
              <td className="whitespace-nowrap px-3 py-2">
                {canEdit ? (
                  <select
                    value={row.status}
                    disabled={pending}
                    onChange={(e) => update(row.id, e.target.value as (typeof STATUSES)[number])}
                    style={{ width: "auto", minWidth: 150 }}
                  >
                    {STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {CHECK_STATUS_TH[s]}
                      </option>
                    ))}
                  </select>
                ) : (
                  CHECK_STATUS_TH[row.status]
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
