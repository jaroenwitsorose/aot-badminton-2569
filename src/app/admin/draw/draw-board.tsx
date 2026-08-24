"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { assignDrawAction, clearDrawAction } from "../actions";
import { EVENT_TH } from "@/lib/labels";
import { TeamTag } from "@/components/ui";

interface Slot {
  token: string;
  levelCode: string;
  matchNo: number;
  started: boolean;
  pairUid: string | null;
}

interface PairOption {
  pairUid: string;
  levelCode: string;
  teamCode: string;
  teamNameTh: string;
  colorHex: string;
  slotNo: number;
  eventType: string | null;
  withdrawn: boolean;
  label: string;
}

/** SEED:L1:MD:01 -> "มือใหม่ ชายคู่ · สาย 1" ; GROUP:L2:A:SLOT1 -> "กลุ่ม A คู่ที่ 1" */
function describeToken(token: string): string {
  const parts = token.split(":");
  if (parts[0] === "SEED") {
    const ev = EVENT_TH[parts[2] as keyof typeof EVENT_TH] ?? parts[2];
    return `${ev} · สาย ${Number(parts[3])}`;
  }
  return `กลุ่ม ${parts[2]} · คู่ที่ ${parts[3].replace("SLOT", "")}`;
}

export function DrawBoard({
  slots,
  pairs,
  levels,
}: {
  slots: Slot[];
  pairs: PairOption[];
  levels: { levelCode: string; nameTh: string }[];
}) {
  const levelsWithSlots = levels.filter((l) => slots.some((s) => s.levelCode === l.levelCode));
  const [levelCode, setLevelCode] = useState(levelsWithSlots[0]?.levelCode ?? "LEVEL1");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const levelSlots = slots.filter((s) => s.levelCode === levelCode);
  const usedPairUids = useMemo(
    () => new Set(levelSlots.map((s) => s.pairUid).filter((x): x is string => Boolean(x))),
    [levelSlots],
  );

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => {
    startTransition(async () => {
      const res = await fn();
      setMessage(res.ok ? { ok: true, text: "บันทึกแล้ว" } : { ok: false, text: res.error ?? "ผิดพลาด" });
      if (res.ok) router.refresh();
    });
  };

  const assignedCount = levelSlots.filter((s) => s.pairUid).length;

  return (
    <div className="flex flex-col gap-3">
      <div className="panel flex flex-wrap items-center gap-x-4 gap-y-2 p-3 text-[13px]">
        <label className="flex items-center gap-2">
          ระดับมือ
          <select value={levelCode} onChange={(e) => setLevelCode(e.target.value)} style={{ width: "auto" }}>
            {levelsWithSlots.map((l) => (
              <option key={l.levelCode} value={l.levelCode}>
                {l.nameTh}
              </option>
            ))}
          </select>
        </label>
        <span style={{ color: "var(--muted)" }}>
          จับสลากแล้ว {assignedCount}/{levelSlots.length} ช่อง
        </span>
        {message ? (
          <span className="ml-auto" style={{ color: message.ok ? "#15803d" : "#b91c1c" }}>
            {message.text}
          </span>
        ) : null}
      </div>

      <div className="panel scroll-x">
        <table className="w-full border-collapse text-[14px]">
          <thead>
            <tr style={{ color: "var(--muted)", fontSize: 12 }}>
              <th className="whitespace-nowrap px-3 py-2 text-left font-medium">ช่องในสาย</th>
              <th className="whitespace-nowrap px-3 py-2 text-left font-medium">ลงแข่งครั้งแรก</th>
              <th className="px-3 py-2 text-left font-medium">คู่แข่งขัน</th>
              <th className="px-3 py-2 text-left font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {levelSlots.map((slot) => {
              const current = pairs.find((p) => p.pairUid === slot.pairUid) ?? null;
              const options = pairs.filter(
                (p) =>
                  p.levelCode === levelCode &&
                  !p.withdrawn &&
                  (!usedPairUids.has(p.pairUid) || p.pairUid === slot.pairUid) &&
                  // ช่องของมือใหม่ผูกกับประเภทอยู่แล้ว
                  (!slot.token.startsWith("SEED:") || p.eventType === slot.token.split(":")[2]),
              );

              return (
                <tr key={slot.token} className="border-t" style={{ borderColor: "var(--line)" }}>
                  <td className="whitespace-nowrap px-3 py-2">
                    <div className="font-medium">{describeToken(slot.token)}</div>
                    <div className="text-[11px]" style={{ color: "var(--faint)" }}>
                      {slot.token}
                    </div>
                  </td>
                  <td className="tabular whitespace-nowrap px-3 py-2" style={{ color: "var(--muted)" }}>
                    #{slot.matchNo}
                    {slot.started ? (
                      <span className="ml-2 text-[11px]" style={{ color: "#b45309" }}>
                        เริ่มแข่งแล้ว
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    <select
                      value={slot.pairUid ?? ""}
                      disabled={slot.started || pending}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (!value) run(() => clearDrawAction({ token: slot.token }));
                        else run(() => assignDrawAction({ token: slot.token, pairUid: value }));
                      }}
                      style={{ minWidth: 260 }}
                    >
                      <option value="">— ยังไม่จับสลาก —</option>
                      {options.map((p) => (
                        <option key={p.pairUid} value={p.pairUid}>
                          {p.teamNameTh} · {p.label}
                          {p.eventType ? ` (${p.eventType})` : ""}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    {current ? <TeamTag nameTh={current.teamNameTh} colorHex={current.colorHex} /> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
