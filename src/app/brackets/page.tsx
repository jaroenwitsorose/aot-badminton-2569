"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSnapshot } from "@/components/snapshot-provider";
import { BracketTree } from "@/components/bracket-tree";
import { EmptyState, MatchCard, SectionHeading, StatusChip, TeamTag } from "@/components/ui";
import type { MatchView, SideView, StandingView, TieView } from "@/lib/tournament";

const L1_MAIN_ROUNDS = ["รอบ 16 คู่", "ก่อนรองชนะเลิศ", "รองชนะเลิศ", "ชิงชนะเลิศ"];
const KO_MAIN_ROUNDS = ["ก่อนรองชนะเลิศ", "รองชนะเลิศ", "ชิงชนะเลิศ"];

export default function BracketsPage() {
  return (
    <Suspense fallback={null}>
      <BracketsView />
    </Suspense>
  );
}

function BracketsView() {
  const { snapshot } = useSnapshot();
  const searchParams = useSearchParams();
  const [levelCode, setLevelCode] = useState<string>(
    searchParams.get("level") ?? snapshot.levels[0]?.levelCode ?? "LEVEL1",
  );
  const level = snapshot.levels.find((l) => l.levelCode === levelCode);

  return (
    <main>
      <section className="page-hero">
        <div className="shell">
          <p className="eyebrow">BRACKETS</p>
          <h1>สายการแข่งขัน</h1>
          <p>
            ช่องที่ยังไม่รู้คู่จะแสดงที่มาแทน เช่น “ผู้ชนะแมตช์ #12” หรือ “อันดับ 1 กลุ่ม A”
            และจะเปลี่ยนเป็นชื่อคู่จริงเองทันทีที่ผลออก
          </p>
        </div>
      </section>

      <div className="page-shell shell">
        <div className="tab-row" role="tablist" aria-label="เลือกระดับมือ">
          {snapshot.levels.map((l) => (
            <button
              key={l.levelCode}
              type="button"
              role="tab"
              aria-selected={l.levelCode === levelCode}
              className={l.levelCode === levelCode ? "active" : undefined}
              onClick={() => setLevelCode(l.levelCode)}
            >
              {l.nameTh}
            </button>
          ))}
        </div>

        {level ? (
          <div className="summary-strip">
            <span>
              <b>{level.nameTh}</b> — {level.format}
            </span>
            <span>
              {level.pairSlots} คู่ · {level.matchCount} แมตช์ · คุณสมบัติ {level.eligibility}
            </span>
          </div>
        ) : null}

        {levelCode === "LEVEL1" ? <Level1Bracket /> : null}
        {levelCode === "LEVEL2" || levelCode === "LEVEL3" ? <GroupLevel levelCode={levelCode} /> : null}
        {levelCode === "LEVEL4" ? <Level4View /> : null}
      </div>
    </main>
  );
}

// ───────────────────────── มือใหม่ ─────────────────────────

function Level1Bracket() {
  const { snapshot } = useSnapshot();

  return (
    <div style={{ display: "grid", gap: 34 }}>
      {(["MD", "WD", "XD"] as const).map((ev) => {
        const matches = snapshot.matches.filter((m) => m.levelCode === "LEVEL1" && m.eventType === ev);
        if (matches.length === 0) return null;
        const rounds = L1_MAIN_ROUNDS.map((title) => ({
          title,
          matches: matches.filter((m) => m.roundLabel === title),
        })).filter((r) => r.matches.length > 0);
        const thirdPlace = matches.find((m) => m.roundLabel === "ชิงอันดับ 3");
        return (
          <section key={ev}>
            <SectionHeading
              title={`มือใหม่ · ${matches[0].eventNameTh}`}
              sub="แพ้คัดออก 16 คู่ · เส้นสีคือทีมที่ชนะและไปต่อ · เลื่อนซ้าย-ขวาเพื่อดูทุกรอบ"
            />
            <BracketTree rounds={rounds} thirdPlace={thirdPlace} />
          </section>
        );
      })}
    </div>
  );
}

function BracketNode({ match }: { match: MatchView }) {
  const nameOf = (side: SideView) => side.pair?.label ?? side.pendingLabel;
  return (
    <Link
      href={`/results/${match.matchUid}`}
      className={`bracket-node ${match.decided ? "done" : ""}`}
      style={{ display: "block" }}
    >
      <header>
        <span>#{match.matchNo}</span>
        <span>
          {match.startTime} · คอร์ต {match.courtNo}
        </span>
      </header>
      <p className={match.winnerSide === "A" ? "win" : match.sideA.pair ? "" : "placeholder-name"}>
        {nameOf(match.sideA)}
        {match.decided ? ` (${match.gamesWonA})` : ""}
      </p>
      <p className={match.winnerSide === "B" ? "win" : match.sideB.pair ? "" : "placeholder-name"}>
        {nameOf(match.sideB)}
        {match.decided ? ` (${match.gamesWonB})` : ""}
      </p>
      <StatusChip status={match.status} walkover={match.walkover} />
    </Link>
  );
}

// ───────────────────────── มือ D / มือ C ─────────────────────────

function GroupLevel({ levelCode }: { levelCode: string }) {
  const { snapshot } = useSnapshot();
  const groups = snapshot.groupStandings.filter((g) => g.levelCode === levelCode);
  const koMatches = snapshot.matches.filter((m) => m.levelCode === levelCode && m.phase === "KNOCKOUT");

  return (
    <div style={{ display: "grid", gap: 34 }}>
      <section>
        <SectionHeading
          title="รอบแบ่งกลุ่ม"
          sub="4 กลุ่ม กลุ่มละ 4 คู่ · อันดับ 1-2 เข้าสายบน · อันดับ 3-4 เข้าสายล่าง"
        />
        <div className="level-grid">
          {["A", "B", "C", "D"].map((key) => (
            <GroupCard
              key={key}
              groupKey={key}
              rows={groups.find((g) => g.groupKey === key)?.rows ?? []}
              matches={snapshot.matches.filter((m) => m.levelCode === levelCode && m.groupKey === key)}
            />
          ))}
        </div>
      </section>

      {(["UPPER", "LOWER"] as const).map((bracket) => {
        const list = koMatches.filter((m) => m.bracket === bracket);
        if (list.length === 0) return null;
        const rounds = KO_MAIN_ROUNDS.map((title) => ({
          title,
          matches: list.filter((m) => m.roundLabel === title),
        })).filter((r) => r.matches.length > 0);
        const thirdPlace = list.find((m) => m.roundLabel === "ชิงอันดับ 3");
        return (
          <section key={bracket}>
            <SectionHeading
              title={bracket === "UPPER" ? "สายบน" : "สายล่าง"}
              sub={
                bracket === "UPPER"
                  ? "ชิงเหรียญ · ทอง 3 คะแนน · เงิน 2 คะแนน · ทองแดง 1 คะแนน · เลื่อนซ้าย-ขวาเพื่อดูทุกรอบ"
                  : "ชนะเลิศได้ 0.5 คะแนน · ชิงอันดับ 3 แข่งตามโปรแกรมแต่ไม่มีคะแนนและไม่มีอันดับ · เลื่อนซ้าย-ขวาเพื่อดูทุกรอบ"
              }
            />
            <BracketTree rounds={rounds} thirdPlace={thirdPlace} />
          </section>
        );
      })}
    </div>
  );
}

function GroupCard({
  groupKey,
  rows,
  matches,
}: {
  groupKey: string;
  rows: StandingView[];
  matches: MatchView[];
}) {
  const played = matches.filter((m) => m.decided).length;
  return (
    <div className="level-card group-card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 17 }}>กลุ่ม {groupKey}</h3>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>
          แข่งแล้ว {played}/{matches.length}
        </span>
      </div>

      {rows.length === 0 ? (
        <p style={{ fontSize: 13, color: "var(--faint)", margin: 0 }}>จัดอันดับได้เมื่อแข่งครบทุกแมตช์ในกลุ่ม</p>
      ) : (
        <div className="scroll-x">
          <table className="group-table">
            <thead>
              <tr>
                <th>อันดับ</th>
                <th>คู่</th>
                <th style={{ textAlign: "right" }}>ชนะ</th>
                <th style={{ textAlign: "right" }}>เกม</th>
                <th style={{ textAlign: "right" }}>แต้ม</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td className="tabular">
                    {r.rank}{" "}
                    {r.rank !== null && r.rank <= 2 ? <span className="qual">บน</span> : <span className="lower">ล่าง</span>}
                  </td>
                  <td>
                    <Link href={`/pairs/${r.key}`}>{r.displayName}</Link>
                    {r.teamNameTh && r.colorHex ? (
                      <div>
                        <TeamTag nameTh={r.teamNameTh} colorHex={r.colorHex} />
                      </div>
                    ) : null}
                    {r.rankReason ? <div style={{ fontSize: 11, color: "var(--faint)" }}>{r.rankReason}</div> : null}
                  </td>
                  <td className="tabular" style={{ textAlign: "right" }}>
                    {r.won}
                  </td>
                  <td className="tabular" style={{ textAlign: "right" }}>
                    {r.gamesWon}-{r.gamesLost}
                  </td>
                  <td className="tabular" style={{ textAlign: "right" }}>
                    {r.pointDiff > 0 ? `+${r.pointDiff}` : r.pointDiff}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <details style={{ marginTop: 12 }}>
        <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--muted)" }}>
          ดูแมตช์ในกลุ่ม ({matches.length})
        </summary>
        <div style={{ display: "grid", gap: 8, marginTop: 10 }}>
          {matches.map((m) => (
            <BracketNode key={m.matchUid} match={m} />
          ))}
        </div>
      </details>
    </div>
  );
}

// ───────────────────────── มือทั่วไป ─────────────────────────

function Level4View() {
  const { snapshot } = useSnapshot();
  const rr = snapshot.ties.filter((t) => t.phase === "ROUND_ROBIN");
  const playoff = snapshot.ties.filter((t) => t.phase === "PAGE_PLAYOFF");
  const ranked = snapshot.level4Standings.some((r) => r.rank !== null);

  return (
    <div style={{ display: "grid", gap: 34 }}>
      <section>
        <SectionHeading
          title="อันดับสีรอบพบกันหมด"
          sub="1 คู่สี = 3 แมตช์ · ชนะ 2 ใน 3 · ต้องแข่งครบทั้ง 3 แมตช์"
        />
        {!ranked ? (
          <EmptyState>จัดอันดับได้เมื่อแข่งครบทั้ง 6 คู่สีของรอบพบกันหมด</EmptyState>
        ) : (
          <div className="panel scroll-x">
            <table className="data-table">
              <thead>
                <tr>
                  <th>อันดับ</th>
                  <th>สี</th>
                  <th style={{ textAlign: "right" }}>ชนะคู่สี</th>
                  <th style={{ textAlign: "right" }}>ชนะแมตช์</th>
                  <th style={{ textAlign: "right" }}>ผลต่างแต้ม</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.level4Standings.map((r) => (
                  <tr key={r.key}>
                    <td className="tabular">{r.rank}</td>
                    <td>
                      {r.colorHex ? <TeamTag nameTh={r.displayName} colorHex={r.colorHex} /> : r.displayName}
                      {r.rankReason ? <div style={{ fontSize: 11, color: "var(--faint)" }}>{r.rankReason}</div> : null}
                    </td>
                    <td className="tabular" style={{ textAlign: "right" }}>
                      {r.won}
                    </td>
                    <td className="tabular" style={{ textAlign: "right" }}>
                      {r.gamesWon}-{r.gamesLost}
                    </td>
                    <td className="tabular" style={{ textAlign: "right" }}>
                      {r.pointDiff > 0 ? `+${r.pointDiff}` : r.pointDiff}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {[
        { title: "รอบพบกันหมด", ties: rr },
        { title: "Page Playoff", ties: playoff },
      ].map((group) => (
        <section key={group.title}>
          <SectionHeading title={group.title} />
          <div style={{ display: "grid", gap: 16 }}>
            {group.ties.map((tie) => (
              <TieCard key={tie.tieId} tie={tie} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function TieCard({ tie }: { tie: TieView }) {
  const { snapshot } = useSnapshot();
  const matches = snapshot.matches.filter((m) => m.tieId === tie.tieId);

  return (
    <div className="team-tie">
      <header>
        <div>
          <h3>{tie.stage}</h3>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>
            {tie.dayLabel} {tie.startTime} · คอร์ต {tie.courts}
          </span>
        </div>
        <div className="tie-score">
          <TieSide name={tie.teamANameTh} color={tie.colorHexA} pending={tie.pendingLabelA} />
          <b className="tabular">
            {tie.matchWinsA}-{tie.matchWinsB}
          </b>
          <TieSide name={tie.teamBNameTh} color={tie.colorHexB} pending={tie.pendingLabelB} />
        </div>
      </header>

      <p style={{ margin: "0 0 12px", fontSize: 13, color: "var(--muted)" }}>
        {tie.status === "COMPLETED" && tie.winnerTeamCode
          ? `แข่งครบ 3 แมตช์ · ผู้ชนะคือสี${snapshot.teams.find((t) => t.teamCode === tie.winnerTeamCode)?.nameTh ?? ""}`
          : tie.status === "PLAYING"
            ? `แข่งแล้ว ${tie.playedCount}/3 แมตช์ (ต้องแข่งครบทั้ง 3)`
            : "ยังไม่เริ่มแข่ง"}
      </p>

      <div className="team-tie-grid">
        {matches.map((m) => (
          <MatchCard key={m.matchUid} match={m} showWhen={false} />
        ))}
      </div>
    </div>
  );
}

function TieSide({ name, color, pending }: { name: string | null; color: string | null; pending: string }) {
  if (name && color) return <TeamTag nameTh={name} colorHex={color} />;
  return (
    <span className="placeholder-name" style={{ fontSize: 13 }}>
      {pending || "รอผล"}
    </span>
  );
}
