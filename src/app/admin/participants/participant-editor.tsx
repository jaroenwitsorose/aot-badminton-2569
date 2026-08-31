"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { EventType, Gender, SkillRank } from "@prisma/client";
import { lockPairEventAction, saveParticipantAction } from "../actions";
import { GENDER_TH, SKILL_RANK_TH } from "@/lib/labels";
import { TeamTag } from "@/components/ui";

interface PlayerRow {
  participantUid: string;
  playerNo: number;
  displayCode: string | null;
  actualName: string;
  skillRank: string;
  gender: string;
}

interface PairRow {
  pairUid: string;
  levelCode: string;
  teamCode: string;
  slotNo: number;
  eventType: string | null;
  publicPairCode: string | null;
  eventLocked: boolean;
  players: PlayerRow[];
}

const RANKS = ["NEW", "D", "C", "B_MINUS", "B_PLUS", "A", "S"];

export function ParticipantEditor({
  pairs,
  levels,
  teams,
}: {
  pairs: PairRow[];
  levels: { levelCode: string; nameTh: string; eventTypes: string }[];
  teams: { teamCode: string; nameTh: string; colorHex: string }[];
}) {
  const [levelCode, setLevelCode] = useState(levels[0]?.levelCode ?? "LEVEL1");
  const [teamCode, setTeamCode] = useState("ALL");
  const [onlyMissing, setOnlyMissing] = useState(false);

  const visible = useMemo(
    () =>
      pairs.filter(
        (p) =>
          p.levelCode === levelCode &&
          (teamCode === "ALL" || p.teamCode === teamCode) &&
          (!onlyMissing || p.players.some((pl) => !pl.actualName)),
      ),
    [pairs, levelCode, teamCode, onlyMissing],
  );

  const level = levels.find((l) => l.levelCode === levelCode);

  return (
    <div className="flex flex-col gap-3">
      <div className="panel flex flex-wrap items-center gap-x-4 gap-y-2 p-3 text-[13px]">
        <label className="flex items-center gap-2">
          ระดับมือ
          <select value={levelCode} onChange={(e) => setLevelCode(e.target.value)} style={{ width: "auto" }}>
            {levels.map((l) => (
              <option key={l.levelCode} value={l.levelCode}>
                {l.nameTh}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          สี
          <select value={teamCode} onChange={(e) => setTeamCode(e.target.value)} style={{ width: "auto" }}>
            <option value="ALL">ทุกสี</option>
            {teams.map((t) => (
              <option key={t.teamCode} value={t.teamCode}>
                {t.nameTh}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={onlyMissing}
            onChange={(e) => setOnlyMissing(e.target.checked)}
            style={{ width: "auto" }}
          />
          เฉพาะที่ยังกรอกชื่อไม่ครบ
        </label>
        <span className="ml-auto" style={{ color: "var(--muted)" }}>
          {visible.length} คู่ · ประเภทที่อนุญาต: {level?.eventTypes}
        </span>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(min(370px, 100%), 1fr))" }}>
        {visible.map((pair) => (
          <PairCard key={pair.pairUid} pair={pair} teams={teams} allowedEvents={level?.eventTypes ?? ""} />
        ))}
      </div>
    </div>
  );
}

function PairCard({
  pair,
  teams,
  allowedEvents,
}: {
  pair: PairRow;
  teams: { teamCode: string; nameTh: string; colorHex: string }[];
  allowedEvents: string;
}) {
  const router = useRouter();
  const team = teams.find((t) => t.teamCode === pair.teamCode)!;
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [rows, setRows] = useState(pair.players);
  const [eventType, setEventType] = useState(pair.eventType ?? "");

  // มือ D ไม่มีชายคู่ (ตามชีต Levels)
  const events = (["MD", "WD", "XD"] as const).filter((e) =>
    pair.levelCode === "LEVEL2" ? e !== "MD" : allowedEvents.includes(e),
  );

  const savePlayer = (row: PlayerRow) => {
    startTransition(async () => {
      const res = await saveParticipantAction({
        participantUid: row.participantUid,
        actualName: row.actualName,
        skillRank: row.skillRank as SkillRank | "",
        gender: row.gender as Gender | "",
      });
      setMessage(res.ok ? { ok: true, text: "บันทึกแล้ว" } : { ok: false, text: res.error });
      if (res.ok) router.refresh();
    });
  };

  const lockEvent = () => {
    if (!eventType) return;
    startTransition(async () => {
      const res = await lockPairEventAction({ pairUid: pair.pairUid, eventType: eventType as EventType });
      setMessage(res.ok ? { ok: true, text: res.message ?? "ล็อกแล้ว" } : { ok: false, text: res.error });
      if (res.ok) router.refresh();
    });
  };

  return (
    <div className="panel p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TeamTag nameTh={team.nameTh} colorHex={team.colorHex} />
        <span className="text-[12px]" style={{ color: "var(--muted)" }}>
          {pair.publicPairCode ?? `คู่ที่ ${pair.slotNo}`}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px]">
        <span style={{ color: "var(--muted)" }}>ประเภท</span>
        <select
          value={eventType}
          onChange={(e) => setEventType(e.target.value)}
          disabled={pair.eventLocked || pending}
          style={{ width: "auto" }}
        >
          <option value="">— ยังไม่เลือก —</option>
          {events.map((e) => (
            <option key={e} value={e}>
              {e === "MD" ? "ชายคู่" : e === "WD" ? "หญิงคู่" : "คู่ผสม"}
            </option>
          ))}
        </select>
        {pair.eventLocked ? (
          <span className="text-[12px]" style={{ color: "#15803d" }}>
            ล็อกแล้ว
          </span>
        ) : (
          <button
            type="button"
            onClick={lockEvent}
            disabled={!eventType || pending}
            className="rounded-lg border px-2.5 py-1 text-[12px]"
            style={{ borderColor: "var(--line)", background: "transparent", cursor: "pointer" }}
          >
            ล็อกประเภท
          </button>
        )}
      </div>

      <div className="mt-2 flex flex-col gap-3">
        {rows.map((row, idx) => (
          <div key={row.participantUid} className="rounded-lg border p-2" style={{ borderColor: "var(--line)" }}>
            <div className="text-[11px]" style={{ color: "var(--faint)" }}>
              คนที่ {row.playerNo} · {row.displayCode ?? "รอรหัสแสดงผล"}
            </div>
            <div className="mt-1 grid gap-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <label className="flex flex-col gap-1 text-[12px]" style={{ gridColumn: "1 / -1" }}>
                ชื่อ-นามสกุล
                <input
                  type="text"
                  value={row.actualName}
                  disabled={pending}
                  onChange={(e) =>
                    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, actualName: e.target.value } : r)))
                  }
                />
              </label>
              <label className="flex flex-col gap-1 text-[12px]">
                ระดับมือ
                <select
                  value={row.skillRank}
                  disabled={pending}
                  onChange={(e) =>
                    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, skillRank: e.target.value } : r)))
                  }
                >
                  <option value="">—</option>
                  {RANKS.map((r) => (
                    <option key={r} value={r}>
                      {SKILL_RANK_TH[r]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-[12px]">
                เพศ
                <select
                  value={row.gender}
                  disabled={pending}
                  onChange={(e) =>
                    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, gender: e.target.value } : r)))
                  }
                >
                  <option value="">—</option>
                  {["M", "F"].map((g) => (
                    <option key={g} value={g}>
                      {GENDER_TH[g]}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => savePlayer(row)}
                  disabled={pending}
                  className="rounded-lg px-3 py-1.5 text-[12px] font-medium"
                  style={{ background: "var(--ink)", color: "#fff", border: "none", cursor: "pointer" }}
                >
                  บันทึก
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {message ? (
        <p className="mb-0 mt-2 text-[12px]" style={{ color: message.ok ? "#15803d" : "#b91c1c" }}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
