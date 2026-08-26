"use client";

/**
 * การ์ดเส้นทางการแข่งขันของคู่ที่ค้นหา
 * บอกว่าเล่นไปแล้วกี่แมตช์ แมตช์ถัดไปคือแมตช์ไหน และถ้าชนะไปเรื่อย ๆ จะไปจบที่ไหน
 */

import Link from "next/link";
import type { PairPath } from "@/lib/match-path";
import type { MatchView } from "@/lib/tournament";
import { TeamTag } from "./ui";

export function PairPathCard({ path, teamNameTh, colorHex }: { path: PairPath; teamNameTh?: string | null; colorHex?: string | null }) {
  return (
    <section className="panel path-card">
      <header className="path-head">
        <div>
          <p className="eyebrow blue" style={{ margin: 0 }}>
            เส้นทางการแข่งขัน
          </p>
          <h3 style={{ margin: "4px 0 0", fontSize: 18 }}>
            <Link href={`/pairs/${path.pairUid}`}>{path.label}</Link>
          </h3>
          {teamNameTh && colorHex ? (
            <div style={{ marginTop: 6 }}>
              <TeamTag nameTh={teamNameTh} colorHex={colorHex} />
            </div>
          ) : null}
        </div>

        <div className="path-summary">
          {path.champion ? (
            <span className="path-badge win">ชนะเลิศแล้ว</span>
          ) : path.notStarted ? (
            <span className="path-badge out">ยังไม่มีแมตช์</span>
          ) : path.finished ? (
            <span className="path-badge out">จบเส้นทางแล้ว</span>
          ) : (
            <>
              <span className="tabular path-big">{path.remainingIfWinning}</span>
              <span className="path-big-label">
                แมตช์ที่เหลือ
                <br />
                ถ้าชนะไปตลอด
              </span>
            </>
          )}
        </div>
      </header>

      {path.winsToTitle !== null && !path.finished ? (
        <p className="notice ok" style={{ margin: "12px 0 0" }}>
          ชนะอีก <b>{path.winsToTitle}</b> แมตช์ได้แชมป์ · แมตช์ชิงชนะเลิศคือ{" "}
          <Link href={`/results/${path.finalMatch!.matchUid}`}>
            #{path.finalMatch!.matchNo} {path.finalMatch!.dayLabel} {path.finalMatch!.startTime}
          </Link>
        </p>
      ) : null}

      {path.note ? (
        <p className="notice" style={{ margin: "12px 0 0" }}>
          {path.note}
        </p>
      ) : null}

      <ol className="path-list">
        {path.played.map(({ match, won }) => (
          <PathRow
            key={match.matchUid}
            match={match}
            tone={won ? "won" : "lost"}
            tag={won ? "ชนะ" : "แพ้"}
          />
        ))}
        {path.upcoming.map((match) => (
          <PathRow key={match.matchUid} match={match} tone="next" tag="ต้องลงเล่น" />
        ))}
        {path.projected.map((match) => (
          <PathRow key={match.matchUid} match={match} tone="projected" tag="ถ้าชนะ" />
        ))}
      </ol>
    </section>
  );
}

function PathRow({
  match,
  tone,
  tag,
}: {
  match: MatchView;
  tone: "won" | "lost" | "next" | "projected";
  tag: string;
}) {
  return (
    <li className={`path-row ${tone}`}>
      <span className="path-tag">{tag}</span>
      <span className="path-main">
        <Link href={`/results/${match.matchUid}`}>
          <b>#{match.matchNo}</b> {match.roundLabel}
        </Link>
        <small>
          {match.levelNameTh}
          {match.eventNameTh ? ` · ${match.eventNameTh}` : ""} · {match.dayLabel} {match.startTime} · คอร์ต{" "}
          {match.courtNo}
        </small>
      </span>
      {match.decided ? (
        <span className="tabular path-score">
          {match.gamesWonA}-{match.gamesWonB}
        </span>
      ) : null}
    </li>
  );
}
