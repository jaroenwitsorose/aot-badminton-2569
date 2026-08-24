"use client";

import Link from "next/link";
import type { MatchView, SideView } from "@/lib/tournament";
import { STATUS_TH } from "@/lib/labels";

/** ป้ายสีของทีม — ใช้สีจริงจากตาราง teams */
export function TeamTag({ nameTh, colorHex }: { nameTh: string; colorHex: string }) {
  return (
    <span
      className="team-tag"
      style={{ background: `color-mix(in srgb, ${colorHex} 13%, transparent)`, color: colorHex }}
    >
      <i aria-hidden />
      {nameTh}
    </span>
  );
}

export function StatusChip({ status, walkover }: { status: MatchView["status"]; walkover?: boolean }) {
  const label = walkover && status !== "WALKOVER" ? `${STATUS_TH[status]} (Walkover)` : STATUS_TH[status];
  return <span className={`status status-${status.toLowerCase()}`}>{label}</span>;
}

export function LevelChip({ levelCode, nameTh }: { levelCode: string; nameTh: string }) {
  return <span className={`level-chip ${levelCode.toLowerCase()}`}>{nameTh}</span>;
}

/** ชื่อคู่ — ถ้ายังไม่รู้ว่าเป็นใคร แสดงที่มาแทน เช่น "ผู้ชนะแมตช์ #12" */
export function PairLine({
  side,
  win,
  score,
  linkPair = true,
}: {
  side: SideView;
  win: boolean;
  score?: React.ReactNode;
  linkPair?: boolean;
}) {
  const pair = side.pair;
  const name = pair ? (
    <b className={`${win ? "win" : ""} ${pair.isPlaceholder ? "placeholder-name" : ""}`.trim()}>{pair.label}</b>
  ) : (
    <b className="placeholder-name">{side.pendingLabel || "รอผลรอบก่อนหน้า"}</b>
  );

  return (
    <div className="pair-row">
      <div>
        {pair && linkPair ? <Link href={`/pairs/${pair.pairUid}`}>{name}</Link> : name}
        <small>
          {pair ? (
            <>
              <TeamTag nameTh={pair.teamNameTh} colorHex={pair.colorHex} />
              {pair.eventNameTh ? ` · ${pair.eventNameTh}` : ""}
              {pair.publicPairCode ? ` · ${pair.publicPairCode}` : ""}
            </>
          ) : side.teamNameTh && side.colorHex ? (
            <TeamTag nameTh={side.teamNameTh} colorHex={side.colorHex} />
          ) : (
            "ยังไม่ทราบคู่แข่งขัน"
          )}
        </small>
      </div>
      {score !== undefined ? <strong className={win ? "winner-score" : undefined}>{score}</strong> : null}
    </div>
  );
}

function sideScore(match: MatchView, side: "A" | "B"): React.ReactNode {
  if (match.status === "WALKOVER") {
    const won = match.walkoverSide !== side;
    return won ? "W/O" : "—";
  }
  if (match.games.length === 0) return "";
  return (
    <span className="tabular">
      {match.games.map((g) => (side === "A" ? g.scoreA : g.scoreB)).join("  ")}
    </span>
  );
}

/** การ์ดแมตช์ที่ใช้ร่วมกันทุกหน้า */
export function MatchCard({
  match,
  showWhen = true,
  showLink = true,
}: {
  match: MatchView;
  showWhen?: boolean;
  showLink?: boolean;
}) {
  return (
    <article className="match-card">
      {showWhen ? (
        <div className="match-when">
          <span>{match.dayLabel.replace(/ ·.*/, "")}</span>
          <strong className="tabular">{match.startTime}</strong>
          <span>คอร์ต {match.courtNo}</span>
        </div>
      ) : null}
      <div className="match-body">
        <div className="match-meta">
          <span className="match-number">#{match.matchNo}</span>
          <LevelChip levelCode={match.levelCode} nameTh={match.levelNameTh} />
          {match.eventNameTh ? <span>{match.eventNameTh}</span> : null}
          <span>{match.roundLabel}</span>
          <StatusChip status={match.status} walkover={match.walkover} />
        </div>

        <PairLine side={match.sideA} win={match.winnerSide === "A"} score={sideScore(match, "A")} />
        <PairLine side={match.sideB} win={match.winnerSide === "B"} score={sideScore(match, "B")} />

        <div className="match-footer">
          {match.decided ? (
            <span className="tabular">
              ชนะ {match.gamesWonA}-{match.gamesWonB} เกม
            </span>
          ) : (
            <span>
              {match.dayLabel} · {match.startTime}-{match.endTime} · คอร์ต {match.courtNo}
            </span>
          )}
          {match.bracket === "LOWER" && match.roundLabel === "ชิงอันดับ 3" ? (
            <span>ไม่มีคะแนนและไม่มีอันดับ</span>
          ) : null}
          {showLink ? <Link href={`/results/${match.matchUid}`}>รายละเอียด →</Link> : null}
        </div>
      </div>
    </article>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  sub,
  right,
}: {
  eyebrow?: string;
  title: string;
  sub?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="section-heading" style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
      <div>
        {eyebrow ? <p className="eyebrow blue">{eyebrow}</p> : null}
        <h2>{title}</h2>
        {sub ? <p className="sub">{sub}</p> : null}
      </div>
      {right}
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <div className="empty">{children}</div>;
}
