"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { MatchView, TournamentSnapshot } from "@/lib/tournament";
import { STATUS_TH } from "@/lib/labels";
import { validateMatchGames } from "@/lib/validation";
import { resetMatchAction, saveScoreAction, setMatchStatusAction, setWalkoverAction } from "../actions";
import { PairLine, StatusChip } from "@/components/ui";
import { ShowMoreBar, useVisibleCount } from "@/components/show-more";

type Props = {
  matches: MatchView[];
  days: TournamentSnapshot["days"];
  levels: TournamentSnapshot["levels"];
  canReset: boolean;
};

export function ScoreBoard({ matches, days, levels, canReset }: Props) {
  const [dayNo, setDayNo] = useState<string>("ALL");
  const [levelCode, setLevelCode] = useState("ALL");
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return matches.filter((m) => {
      if (dayNo !== "ALL" && m.dayNo !== Number(dayNo)) return false;
      if (levelCode !== "ALL" && m.levelCode !== levelCode) return false;
      if (onlyOpen && m.decided) return false;
      if (!q) return true;
      const haystack = [
        String(m.matchNo),
        m.roundLabel,
        m.sideA.pair?.label ?? m.sideA.pendingLabel,
        m.sideB.pair?.label ?? m.sideB.pendingLabel,
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [matches, dayNo, levelCode, onlyOpen, query]);

  const page = useVisibleCount(filtered.length, 20);

  return (
    <div className="flex flex-col gap-3">
      <div className="panel flex flex-wrap items-center gap-x-4 gap-y-2 p-3 text-[13px]">
        <label className="flex items-center gap-2">
          วัน
          <select value={dayNo} onChange={(e) => setDayNo(e.target.value)} style={{ width: "auto" }}>
            <option value="ALL">ทุกวัน</option>
            {days.map((d) => (
              <option key={d.dayNo} value={d.dayNo}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          ระดับมือ
          <select value={levelCode} onChange={(e) => setLevelCode(e.target.value)} style={{ width: "auto" }}>
            <option value="ALL">ทุกระดับ</option>
            {levels.map((l) => (
              <option key={l.levelCode} value={l.levelCode}>
                {l.nameTh}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={onlyOpen}
            onChange={(e) => setOnlyOpen(e.target.checked)}
            style={{ width: "auto" }}
          />
          แสดงเฉพาะที่ยังไม่มีผล
        </label>
        <label className="flex items-center gap-2">
          ค้นหา
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="เลขแมตช์ หรือชื่อนักกีฬา"
            style={{ width: 200 }}
          />
        </label>
        <span className="ml-auto" style={{ color: "var(--muted)" }}>
          {filtered.length} แมตช์
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="panel p-6 text-center text-[14px]" style={{ color: "var(--muted)" }}>
          ไม่มีแมตช์ตามเงื่อนไขที่เลือก
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            {filtered.slice(0, page.visible).map((m) => (
              <MatchEditor key={m.matchUid} match={m} canReset={canReset} />
            ))}
          </div>
          <ShowMoreBar
            shown={page.visible}
            total={filtered.length}
            onMore={page.showMore}
            onAll={page.showAll}
            unit="แมตช์"
          />
        </>
      )}
    </div>
  );
}

function MatchEditor({ match, canReset }: { match: MatchView; canReset: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [expanded, setExpanded] = useState(false);

  const initial = [1, 2, 3].map((n) => {
    const g = match.games.find((x) => x.gameNo === n);
    return { a: g ? String(g.scoreA) : "", b: g ? String(g.scoreB) : "" };
  });
  const [scores, setScores] = useState(initial);

  const games = scores
    .map((s, i) => ({ gameNo: i + 1, scoreA: Number(s.a), scoreB: Number(s.b) }))
    .filter((g) => Number.isFinite(g.scoreA) && Number.isFinite(g.scoreB) && (g.scoreA > 0 || g.scoreB > 0));
  const localError = games.length > 0 ? validateMatchGames(games) : null;

  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) => {
    startTransition(async () => {
      const res = await fn();
      setMessage(res.ok ? { ok: true, text: res.message ?? "บันทึกแล้ว" } : { ok: false, text: res.error ?? "ผิดพลาด" });
      if (res.ok) router.refresh();
    });
  };

  return (
    <article className="panel p-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12px]" style={{ color: "var(--muted)" }}>
        <span className="tabular font-semibold" style={{ color: "var(--ink)" }}>
          #{match.matchNo}
        </span>
        <span>
          {match.dayLabel} {match.startTime}-{match.endTime} · คอร์ต {match.courtNo}
        </span>
        <span>
          {match.levelNameTh}
          {match.eventNameTh ? ` · ${match.eventNameTh}` : ""} · {match.roundLabel}
        </span>
        <span className="ml-auto">
          <StatusChip status={match.status} walkover={match.walkover} />
        </span>
      </div>

      {!match.scorable ? (
        <div className="mt-2 rounded-lg p-2 text-[13px]" style={{ background: "color-mix(in srgb, var(--muted) 10%, transparent)" }}>
          ยังกรอกผลไม่ได้ — ยังไม่รู้ว่าเป็นคู่ไหน ({match.sideA.pendingLabel || "พร้อม"} / {match.sideB.pendingLabel || "พร้อม"})
        </div>
      ) : null}

      <div className="score-entry-grid mt-2">
        <PairLine side={match.sideA} win={match.winnerSide === "A"} />
        <ScoreInputs
          disabled={!match.scorable || pending}
          side="a"
          scores={scores}
          onChange={setScores}
        />
        <PairLine side={match.sideB} win={match.winnerSide === "B"} />
        <ScoreInputs
          disabled={!match.scorable || pending}
          side="b"
          scores={scores}
          onChange={setScores}
        />
      </div>

      {localError && games.length > 0 ? (
        <p className="mb-0 mt-2 text-[13px]" style={{ color: "#b45309" }}>
          {localError}
        </p>
      ) : null}
      {message ? (
        <p className="mb-0 mt-2 text-[13px]" style={{ color: message.ok ? "#15803d" : "#b91c1c" }}>
          {message.text}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={!match.scorable || pending || Boolean(localError) || games.length === 0}
          onClick={() => run(() => saveScoreAction({ matchUid: match.matchUid, games }))}
          className="rounded-lg px-3 py-1.5 text-[13px] font-medium"
          style={{
            background: "var(--ink)",
            color: "#fff",
            border: "none",
            cursor: "pointer",
            opacity: !match.scorable || Boolean(localError) || games.length === 0 ? 0.45 : 1,
          }}
        >
          บันทึกผล
        </button>

        {(["CALLED", "PLAYING"] as const).map((s) => (
          <button
            key={s}
            type="button"
            disabled={!match.scorable || pending || match.status === s}
            onClick={() => run(() => setMatchStatusAction({ matchUid: match.matchUid, status: s }))}
            className="rounded-lg border px-3 py-1.5 text-[13px]"
            style={{ borderColor: "var(--line)", background: "transparent", cursor: "pointer" }}
          >
            {STATUS_TH[s]}
          </button>
        ))}

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="rounded-lg border px-3 py-1.5 text-[13px]"
          style={{ borderColor: "var(--line)", background: "transparent", cursor: "pointer" }}
        >
          {expanded ? "ซ่อน" : "Walkover / ล้างผล"}
        </button>
      </div>

      {expanded ? (
        <SpecialActions match={match} canReset={canReset} pending={pending} run={run} />
      ) : null}
    </article>
  );
}

function ScoreInputs({
  side,
  scores,
  onChange,
  disabled,
}: {
  side: "a" | "b";
  scores: { a: string; b: string }[];
  onChange: (v: { a: string; b: string }[]) => void;
  disabled: boolean;
}) {
  return (
    <div className="score-input-row">
      {scores.map((s, i) => (
        <input
          key={i}
          type="number"
          inputMode="numeric"
          min={0}
          max={30}
          disabled={disabled}
          aria-label={`เกมที่ ${i + 1} ฝั่ง ${side.toUpperCase()}`}
          value={s[side]}
          onChange={(e) => {
            const next = scores.map((x, idx) => (idx === i ? { ...x, [side]: e.target.value } : x));
            onChange(next);
          }}
          className="tabular score-input"
          placeholder={`G${i + 1}`}
        />
      ))}
    </div>
  );
}

function SpecialActions({
  match,
  canReset,
  pending,
  run,
}: {
  match: MatchView;
  canReset: boolean;
  pending: boolean;
  run: (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) => void;
}) {
  const [reason, setReason] = useState("");

  return (
    <div className="mt-3 rounded-lg border p-3" style={{ borderColor: "var(--line)" }}>
      <label className="flex flex-col gap-1 text-[13px]">
        เหตุผล (บันทึกลงประวัติการแก้ไข)
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="เช่น ไม่มารายงานตัวภายในเวลาที่กำหนด"
        />
      </label>

      <div className="mt-2 flex flex-wrap gap-2">
        {(["A", "B"] as const).map((s) => {
          // แสดงชื่อคู่จริงแทน "ฝั่ง A/B" ผู้กรอกผลจะได้ไม่ต้องเดาว่าฝั่งไหนคือใคร
          const side = s === "A" ? match.sideA : match.sideB;
          const who = side.pair?.label ?? side.pendingLabel ?? `ฝั่ง ${s}`;
          return (
            <button
              key={s}
              type="button"
              disabled={!match.scorable || pending || !reason.trim()}
              onClick={() => run(() => setWalkoverAction({ matchUid: match.matchUid, absentSide: s, reason }))}
              className="rounded-lg border px-3 py-1.5 text-[13px]"
              style={{ borderColor: "#f59e0b", color: "#b45309", background: "transparent", cursor: "pointer", textAlign: "left" }}
              title={`บันทึกว่า ${who} ไม่มาแข่ง อีกฝั่งชนะ Walkover`}
            >
              Walkover — <b>{who}</b> ไม่มาแข่ง
            </button>
          );
        })}

        {canReset ? (
          <button
            type="button"
            disabled={pending || !reason.trim()}
            onClick={() => run(() => resetMatchAction({ matchUid: match.matchUid, reason }))}
            className="rounded-lg border px-3 py-1.5 text-[13px]"
            style={{ borderColor: "#dc2626", color: "#b91c1c", background: "transparent", cursor: "pointer" }}
          >
            ล้างผลกลับเป็นรอแข่งขัน
          </button>
        ) : null}
      </div>
      {!canReset ? (
        <p className="mb-0 mt-2 text-[12px]" style={{ color: "var(--faint)" }}>
          การล้างผลต้องใช้สิทธิ์ระดับผู้ดูแลระบบขึ้นไป
        </p>
      ) : null}
    </div>
  );
}
