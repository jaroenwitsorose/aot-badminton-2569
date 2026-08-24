"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { submitLineupAction } from "../actions";
import { SKILL_RANK_TH } from "@/lib/labels";
import { validateLineupOrder } from "@/lib/validation";
import { TeamTag } from "@/components/ui";

interface TieRow {
  tieId: string;
  stage: string;
  dayLabel: string;
  startTime: string;
  status: string;
  teamACode: string | null;
  teamBCode: string | null;
  pendingLabelA: string;
  pendingLabelB: string;
  started: boolean;
}

interface LineupRow {
  tieId: string;
  teamCode: string;
  orderNo: number;
  pairUid: string;
}

interface PairOption {
  pairUid: string;
  teamCode: string;
  withdrawn: boolean;
  ranks: (string | null)[];
  label: string;
}

export function LineupBoard({
  ties,
  lineups,
  pairs,
  teams,
}: {
  ties: TieRow[];
  lineups: LineupRow[];
  pairs: PairOption[];
  teams: { teamCode: string; nameTh: string; colorHex: string }[];
}) {
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(400px, 1fr))" }}>
      {ties.map((tie) => (
        <div key={tie.tieId} className="panel p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="m-0 text-[15px] font-semibold">{tie.stage}</h3>
            <span className="text-[12px]" style={{ color: "var(--muted)" }}>
              {tie.dayLabel} {tie.startTime}
              {tie.started ? " · เริ่มแข่งแล้ว" : ""}
            </span>
          </div>

          <div className="mt-2 flex flex-col gap-3">
            {([
              [tie.teamACode, tie.pendingLabelA],
              [tie.teamBCode, tie.pendingLabelB],
            ] as const).map(([teamCode, pendingLabel], idx) =>
              teamCode ? (
                <TeamLineup
                  key={teamCode}
                  tieId={tie.tieId}
                  team={teams.find((t) => t.teamCode === teamCode)!}
                  pairs={pairs.filter((p) => p.teamCode === teamCode && !p.withdrawn)}
                  existing={lineups.filter((l) => l.tieId === tie.tieId && l.teamCode === teamCode)}
                  locked={tie.started}
                />
              ) : (
                <div key={idx} className="text-[13px]" style={{ color: "var(--faint)" }}>
                  {pendingLabel || "รอผลรอบก่อนหน้า"} — ส่งซองได้เมื่อรู้สีแล้ว
                </div>
              ),
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function TeamLineup({
  tieId,
  team,
  pairs,
  existing,
  locked,
}: {
  tieId: string;
  team: { teamCode: string; nameTh: string; colorHex: string };
  pairs: PairOption[];
  existing: LineupRow[];
  locked: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [selection, setSelection] = useState<string[]>(() =>
    [1, 2, 3].map((n) => existing.find((l) => l.orderNo === n)?.pairUid ?? ""),
  );

  const chosen = selection.filter(Boolean);
  const complete = chosen.length === 3 && new Set(chosen).size === 3;
  const localError = complete
    ? validateLineupOrder(
        selection.map((uid) => ({ pairUid: uid, ranks: pairs.find((p) => p.pairUid === uid)?.ranks ?? [] })),
      )
    : null;

  const submit = () => {
    startTransition(async () => {
      const res = await submitLineupAction({ tieId, teamCode: team.teamCode, pairUids: selection });
      setMessage(res.ok ? { ok: true, text: res.message ?? "บันทึกแล้ว" } : { ok: false, text: res.error });
      if (res.ok) router.refresh();
    });
  };

  return (
    <div className="rounded-lg border p-2" style={{ borderColor: "var(--line)" }}>
      <TeamTag nameTh={team.nameTh} colorHex={team.colorHex} />
      <div className="mt-2 flex flex-col gap-1.5">
        {[0, 1, 2].map((i) => (
          <label key={i} className="flex items-center gap-2 text-[13px]">
            <span className="w-16 flex-none" style={{ color: "var(--muted)" }}>
              คู่ที่ {i + 1}
            </span>
            <select
              value={selection[i]}
              disabled={locked || pending}
              onChange={(e) =>
                setSelection((prev) => prev.map((v, idx) => (idx === i ? e.target.value : v)))
              }
            >
              <option value="">—</option>
              {pairs
                .filter((p) => !selection.includes(p.pairUid) || selection[i] === p.pairUid)
                .map((p) => (
                  <option key={p.pairUid} value={p.pairUid}>
                    {p.label}
                    {p.ranks.some(Boolean)
                      ? ` (${p.ranks.map((r) => (r ? SKILL_RANK_TH[r] ?? r : "?")).join("/")})`
                      : ""}
                  </option>
                ))}
            </select>
          </label>
        ))}
      </div>

      {localError ? (
        <p className="mb-0 mt-1.5 text-[12px]" style={{ color: "#b45309" }}>
          {localError}
        </p>
      ) : null}
      {message ? (
        <p className="mb-0 mt-1.5 text-[12px]" style={{ color: message.ok ? "#15803d" : "#b91c1c" }}>
          {message.text}
        </p>
      ) : null}

      {!locked ? (
        <button
          type="button"
          onClick={submit}
          disabled={!complete || Boolean(localError) || pending}
          className="mt-2 rounded-lg px-3 py-1.5 text-[12px] font-medium"
          style={{
            background: "var(--ink)",
            color: "#fff",
            border: "none",
            cursor: "pointer",
            opacity: !complete || Boolean(localError) ? 0.45 : 1,
          }}
        >
          บันทึกซอง
        </button>
      ) : (
        <p className="mb-0 mt-1.5 text-[12px]" style={{ color: "var(--faint)" }}>
          คู่สีนี้เริ่มแข่งแล้ว แก้ซองไม่ได้
        </p>
      )}
    </div>
  );
}
