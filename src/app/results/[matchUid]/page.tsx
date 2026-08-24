"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useSnapshot } from "@/components/snapshot-provider";
import { EmptyState, LevelChip, PairLine, StatusChip, TeamTag } from "@/components/ui";
import type { MatchView } from "@/lib/tournament";

export default function MatchDetailPage() {
  const params = useParams<{ matchUid: string }>();
  const { snapshot } = useSnapshot();
  const match = snapshot.matches.find((m) => m.matchUid === params.matchUid);

  if (!match) {
    return (
      <main className="page-shell shell">
        <EmptyState>
          ไม่พบแมตช์นี้ · <Link href="/results">กลับไปหน้าผลการแข่งขัน</Link>
        </EmptyState>
      </main>
    );
  }

  // แมตช์ที่รอผู้ชนะ/ผู้แพ้ของแมตช์นี้
  const feeds = snapshot.matches.filter(
    (m) =>
      m.sideASource === `WINNER:${match.sourceMatchCode}` ||
      m.sideBSource === `WINNER:${match.sourceMatchCode}` ||
      m.sideASource === `LOSER:${match.sourceMatchCode}` ||
      m.sideBSource === `LOSER:${match.sourceMatchCode}`,
  );

  const tieMatches = match.tieId ? snapshot.matches.filter((m) => m.tieId === match.tieId) : [];
  const tie = match.tieId ? snapshot.ties.find((t) => t.tieId === match.tieId) : undefined;

  return (
    <main>
      <section className="page-hero">
        <div className="shell">
          <p className="eyebrow">MATCH #{match.matchNo}</p>
          <h1>
            {match.levelNameTh}
            {match.eventNameTh ? ` · ${match.eventNameTh}` : ""}
          </h1>
          <p>
            {match.roundLabel} · {match.dayLabel} เวลา {match.startTime}-{match.endTime} · คอร์ต {match.courtNo}
          </p>
        </div>
      </section>

      <div className="page-shell shell">
        <p style={{ marginTop: 0 }}>
          <Link href="/results" style={{ color: "var(--blue)", fontWeight: 700 }}>
            ← ผลการแข่งขันทั้งหมด
          </Link>
        </p>

        <div className="detail-grid">
          <div className="detail-card">
            <div className="match-meta" style={{ marginBottom: 16 }}>
              <span className="match-number">#{match.matchNo}</span>
              <LevelChip levelCode={match.levelCode} nameTh={match.levelNameTh} />
              <StatusChip status={match.status} walkover={match.walkover} />
            </div>

            <PairLine side={match.sideA} win={match.winnerSide === "A"} />
            <PairLine side={match.sideB} win={match.winnerSide === "B"} />

            <h2 style={{ fontSize: 17, marginTop: 24 }}>สกอร์รายเกม</h2>
            {match.status === "WALKOVER" ? (
              <div className="notice">
                Walkover — ฝั่ง{match.walkoverSide === "A" ? "แรก" : "ที่สอง"}ไม่มาแข่งขัน
                บันทึกผลเป็น {snapshot.tournament.walkoverScore}
                {match.adminNote ? ` · เหตุผล: ${match.adminNote}` : ""}
              </div>
            ) : match.games.length === 0 ? (
              <EmptyState>ยังไม่มีการบันทึกสกอร์</EmptyState>
            ) : (
              <div className="scroll-x">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>เกม</th>
                      <th>{match.sideA.pair?.label ?? "ฝั่ง A"}</th>
                      <th>{match.sideB.pair?.label ?? "ฝั่ง B"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {match.games.map((g) => (
                      <tr key={g.gameNo}>
                        <td>เกมที่ {g.gameNo}</td>
                        <td className="tabular" style={{ fontWeight: g.scoreA > g.scoreB ? 800 : 400 }}>
                          {g.scoreA}
                        </td>
                        <td className="tabular" style={{ fontWeight: g.scoreB > g.scoreA ? 800 : 400 }}>
                          {g.scoreB}
                        </td>
                      </tr>
                    ))}
                    <tr>
                      <td style={{ color: "var(--muted)" }}>รวมเกมที่ชนะ</td>
                      <td className="tabular" style={{ fontWeight: 800 }}>
                        {match.gamesWonA}
                      </td>
                      <td className="tabular" style={{ fontWeight: 800 }}>
                        {match.gamesWonB}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {tie && tieMatches.length > 0 ? (
              <>
                <h2 style={{ fontSize: 17, marginTop: 24 }}>คู่สีเดียวกัน — {tie.stage}</h2>
                <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 0 }}>
                  1 คู่สี = 3 แมตช์ ชนะ 2 ใน 3 และต้องแข่งครบทั้ง 3 แมตช์ ·
                  ขณะนี้ {tie.matchWinsA}-{tie.matchWinsB} (แข่งแล้ว {tie.playedCount}/3)
                </p>
                <div className="stack">
                  {tieMatches.map((m) => (
                    <TieRow key={m.matchUid} match={m} current={m.matchUid === match.matchUid} />
                  ))}
                </div>
              </>
            ) : null}
          </div>

          <div style={{ display: "grid", gap: 16 }}>
            <div className="detail-card">
              <h2 style={{ fontSize: 16, marginTop: 0 }}>ข้อมูลแมตช์</h2>
              <dl style={{ margin: 0, fontSize: 14 }}>
                <Row label="รหัสแมตช์" value={match.matchUid} />
                <Row label="วัน" value={match.dayLabel} />
                <Row label="เวลา" value={`${match.startTime} - ${match.endTime}`} />
                <Row label="คอร์ต" value={String(match.courtNo)} />
                <Row label="รอบ" value={match.roundLabel} />
                <Row
                  label="สาย"
                  value={
                    match.bracket === "UPPER"
                      ? "สายบน"
                      : match.bracket === "LOWER"
                        ? "สายล่าง"
                        : match.bracket === "GROUP"
                          ? `กลุ่ม ${match.groupKey ?? ""}`
                          : match.bracket === "TEAM"
                            ? "ทีมสี"
                            : "สายหลัก"
                  }
                />
                {match.publicUpdatedAt ? (
                  <Row
                    label="อัปเดตล่าสุด"
                    value={new Date(match.publicUpdatedAt).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}
                  />
                ) : null}
              </dl>

              {match.bracket === "LOWER" && match.roundLabel === "ชิงอันดับ 3" ? (
                <div className="notice warn" style={{ marginBottom: 0 }}>
                  แมตช์นี้แข่งตามโปรแกรม แต่<strong>ไม่มีคะแนนและไม่มีอันดับ</strong>ตามกติกาคะแนนสี
                </div>
              ) : null}
            </div>

            {feeds.length > 0 ? (
              <div className="detail-card">
                <h2 style={{ fontSize: 16, marginTop: 0 }}>ผลของแมตช์นี้ส่งต่อไปที่</h2>
                <div style={{ display: "grid", gap: 10 }}>
                  {feeds.map((m) => {
                    const asWinner =
                      m.sideASource === `WINNER:${match.sourceMatchCode}` ||
                      m.sideBSource === `WINNER:${match.sourceMatchCode}`;
                    return (
                      <Link
                        key={m.matchUid}
                        href={`/results/${m.matchUid}`}
                        style={{ border: "1px solid var(--line)", borderRadius: 14, padding: 12, display: "block" }}
                      >
                        <div style={{ fontSize: 12, color: "var(--muted)" }}>
                          {asWinner ? "ผู้ชนะไปต่อที่" : "ผู้แพ้ไปต่อที่"}
                        </div>
                        <div style={{ fontWeight: 700 }}>
                          แมตช์ #{m.matchNo} · {m.roundLabel}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--muted)" }}>
                          {m.dayLabel} {m.startTime} · คอร์ต {m.courtNo}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "7px 0", borderTop: "1px solid var(--line)" }}>
      <dt style={{ color: "var(--muted)" }}>{label}</dt>
      <dd style={{ margin: 0, textAlign: "right" }}>{value}</dd>
    </div>
  );
}

function TieRow({ match, current }: { match: MatchView; current: boolean }) {
  return (
    <div
      style={{
        border: `1px solid ${current ? "var(--blue)" : "var(--line)"}`,
        borderRadius: 14,
        padding: 12,
        background: current ? "var(--blue-soft)" : "#fff",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--muted)" }}>
        <span>
          คู่ที่ {match.tieOrderNo} · แมตช์ #{match.matchNo}
        </span>
        <StatusChip status={match.status} walkover={match.walkover} />
      </div>
      <div style={{ marginTop: 6, fontSize: 14 }}>
        {match.sideA.pair ? (
          <TeamTag nameTh={match.sideA.pair.teamNameTh} colorHex={match.sideA.pair.colorHex} />
        ) : null}{" "}
        {match.sideA.pair?.label ?? match.sideA.pendingLabel}
        <br />
        <span style={{ color: "var(--muted)" }}>พบ</span> {match.sideB.pair?.label ?? match.sideB.pendingLabel}
      </div>
      {current ? null : (
        <Link href={`/results/${match.matchUid}`} style={{ color: "var(--blue)", fontSize: 12, fontWeight: 700 }}>
          ดูรายละเอียด →
        </Link>
      )}
    </div>
  );
}
