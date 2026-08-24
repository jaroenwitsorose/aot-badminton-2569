"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useSnapshot } from "@/components/snapshot-provider";
import { EmptyState, LevelChip, MatchCard, TeamTag } from "@/components/ui";
import { SKILL_RANK_TH, GENDER_TH } from "@/lib/labels";

export default function PairProfilePage() {
  const params = useParams<{ pairUid: string }>();
  const { snapshot } = useSnapshot();
  const pair = snapshot.pairs.find((p) => p.pairUid === params.pairUid);

  if (!pair) {
    return (
      <main className="page-shell shell">
        <EmptyState>
          ไม่พบคู่แข่งขันนี้ · <Link href="/teams">กลับไปหน้ารายชื่อนักกีฬา</Link>
        </EmptyState>
      </main>
    );
  }

  const matches = snapshot.matches
    .filter((m) => m.sideA.pair?.pairUid === pair.pairUid || m.sideB.pair?.pairUid === pair.pairUid)
    .sort((a, b) => a.matchNo - b.matchNo);

  const played = matches.filter((m) => m.decided);
  const won = played.filter((m) => m.winnerPairUid === pair.pairUid).length;
  const lost = played.length - won;

  let gamesWon = 0;
  let gamesLost = 0;
  let pointsWon = 0;
  let pointsLost = 0;
  for (const m of played) {
    const isA = m.sideA.pair?.pairUid === pair.pairUid;
    gamesWon += isA ? m.gamesWonA : m.gamesWonB;
    gamesLost += isA ? m.gamesWonB : m.gamesWonA;
    for (const g of m.games) {
      pointsWon += isA ? g.scoreA : g.scoreB;
      pointsLost += isA ? g.scoreB : g.scoreA;
    }
  }

  // คะแนนสีที่คู่นี้ทำให้ทีม
  const awards = snapshot.teamTotals
    .find((t) => t.teamCode === pair.teamCode)
    ?.breakdown.filter((b) => b.pairLabel === pair.label) ?? [];

  return (
    <main>
      <section className="page-hero">
        <div className="shell">
          <p className="eyebrow">PAIR PROFILE</p>
          <h1 className={pair.isPlaceholder ? "placeholder-name" : undefined}>{pair.label}</h1>
          <p>
            {pair.levelNameTh}
            {pair.eventNameTh ? ` · ${pair.eventNameTh}` : " · ยังไม่ล็อกประเภท"} ·{" "}
            {pair.publicPairCode ?? `คู่ที่ ${pair.slotNo}`}
          </p>
        </div>
      </section>

      <div className="page-shell shell">
        <p style={{ marginTop: 0 }}>
          <Link href="/teams" style={{ color: "var(--blue)", fontWeight: 700 }}>
            ← รายชื่อนักกีฬาทั้งหมด
          </Link>
        </p>

        <div className="detail-grid">
          <div>
            <h2 style={{ fontSize: 20, marginTop: 0 }}>เส้นทางการแข่งขัน</h2>
            {matches.length === 0 ? (
              <EmptyState>
                คู่นี้ยังไม่ถูกจัดเข้าสาย — จะแสดงแมตช์ทันทีที่จับสลากเสร็จ
              </EmptyState>
            ) : (
              <div className="stack">
                {matches.map((m) => (
                  <MatchCard key={m.matchUid} match={m} />
                ))}
              </div>
            )}
          </div>

          <div style={{ display: "grid", gap: 16 }}>
            <div className="detail-card">
              <h2 style={{ fontSize: 16, marginTop: 0 }}>ข้อมูลคู่</h2>
              <p style={{ margin: "0 0 12px" }}>
                <TeamTag nameTh={pair.teamNameTh} colorHex={pair.colorHex} />{" "}
                <LevelChip levelCode={pair.levelCode} nameTh={pair.levelNameTh} />
              </p>
              <div style={{ display: "grid", gap: 12 }}>
                {pair.players.map((pl) => (
                  <div key={pl.playerNo} style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                    <div style={{ fontSize: 11, color: "var(--faint)" }}>นักกีฬาคนที่ {pl.playerNo}</div>
                    <div className={pl.hasRealName ? undefined : "placeholder-name"} style={{ fontWeight: 600 }}>
                      {pl.name}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>
                      {pl.skillRank ? `ระดับมือ ${SKILL_RANK_TH[pl.skillRank] ?? pl.skillRank}` : "รอระดับมือ"}
                      {pl.gender ? ` · ${GENDER_TH[pl.gender] ?? pl.gender}` : ""}
                    </div>
                  </div>
                ))}
              </div>
              {pair.withdrawn ? <div className="notice error" style={{ marginBottom: 0 }}>คู่นี้ถอนตัว</div> : null}
            </div>

            <div className="detail-card">
              <h2 style={{ fontSize: 16, marginTop: 0 }}>สถิติ</h2>
              <dl style={{ margin: 0, fontSize: 14 }}>
                <Stat label="แข่งแล้ว" value={`${played.length} / ${matches.length} แมตช์`} />
                <Stat label="ชนะ - แพ้" value={`${won} - ${lost}`} />
                <Stat label="เกมที่ได้ - เสีย" value={`${gamesWon} - ${gamesLost}`} />
                <Stat label="แต้มที่ได้ - เสีย" value={`${pointsWon} - ${pointsLost}`} />
                <Stat
                  label="ผลต่างแต้ม"
                  value={pointsWon - pointsLost > 0 ? `+${pointsWon - pointsLost}` : String(pointsWon - pointsLost)}
                />
              </dl>
            </div>

            {awards.length > 0 ? (
              <div className="detail-card">
                <h2 style={{ fontSize: 16, marginTop: 0 }}>คะแนนที่ทำให้สี</h2>
                <div style={{ display: "grid", gap: 8, fontSize: 14 }}>
                  {awards.map((a) => (
                    <div key={`${a.sourceRef}-${a.result}`} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <span>
                        {a.categoryLabel} — {a.result}
                        {a.medal ? ` (${a.medal})` : ""}
                      </span>
                      <b className="tabular">{a.countsTowardTotal ? `+${a.points}` : "0"}</b>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "7px 0", borderTop: "1px solid var(--line)" }}>
      <dt style={{ color: "var(--muted)" }}>{label}</dt>
      <dd className="tabular" style={{ margin: 0, fontWeight: 600 }}>
        {value}
      </dd>
    </div>
  );
}
