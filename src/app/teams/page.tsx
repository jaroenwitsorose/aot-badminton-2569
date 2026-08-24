"use client";

import Link from "next/link";
import { useState } from "react";
import { useSnapshot } from "@/components/snapshot-provider";
import { EmptyState, LevelChip, SectionHeading } from "@/components/ui";
import { SKILL_RANK_TH } from "@/lib/labels";

export default function TeamsPage() {
  const { snapshot } = useSnapshot();
  const [teamCode, setTeamCode] = useState<string>(snapshot.teams[0]?.teamCode ?? "PUR");

  const team = snapshot.teams.find((t) => t.teamCode === teamCode);
  const pairs = snapshot.pairs.filter((p) => p.teamCode === teamCode);
  const players = pairs.flatMap((p) => p.players);
  const filled = players.filter((p) => p.hasRealName).length;

  return (
    <main>
      <section className="page-hero">
        <div className="shell">
          <p className="eyebrow">ATHLETES</p>
          <h1>นักกีฬาแยกตามสี</h1>
          <p>
            รับสมัครแบบออฟไลน์เท่านั้น · ชื่อที่แสดงเป็นตัวเอียงสีจางคือรหัสชั่วคราวที่ยังไม่ได้กรอกชื่อจริง
          </p>
        </div>
      </section>

      <div className="page-shell shell">
        <div className="tab-row" role="tablist" aria-label="เลือกสี">
          {snapshot.teams.map((t) => (
            <button
              key={t.teamCode}
              type="button"
              role="tab"
              aria-selected={t.teamCode === teamCode}
              className={t.teamCode === teamCode ? "active" : undefined}
              onClick={() => setTeamCode(t.teamCode)}
              style={t.teamCode === teamCode ? { color: t.colorHex } : undefined}
            >
              {t.nameTh}
            </button>
          ))}
        </div>

        {team ? (
          <div className="summary-strip" style={{ borderLeft: `5px solid ${team.colorHex}` }}>
            <span>
              สี<b style={{ color: team.colorHex }}>{team.nameTh}</b> · {pairs.length} คู่ · {players.length} คน
            </span>
            <span>
              กรอกชื่อจริงแล้ว <b className="tabular">{filled}</b>/{players.length} คน
            </span>
          </div>
        ) : null}

        {snapshot.levels.map((level) => {
          const levelPairs = pairs.filter((p) => p.levelCode === level.levelCode);
          if (levelPairs.length === 0) return null;
          return (
            <section key={level.levelCode} style={{ marginTop: 28 }}>
              <SectionHeading
                title={level.nameTh}
                sub={`${levelPairs.length} คู่ · คุณสมบัติ ${level.eligibility}`}
              />
              <div className="level-grid">
                {levelPairs.map((pair) => (
                  <Link key={pair.pairUid} href={`/pairs/${pair.pairUid}`} className="level-card" style={{ display: "block" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <LevelChip levelCode={pair.levelCode} nameTh={pair.eventNameTh ?? "รอเลือกประเภท"} />
                      <span style={{ fontSize: 12, color: "var(--muted)" }}>
                        {pair.publicPairCode ?? `คู่ที่ ${pair.slotNo}`}
                      </span>
                    </div>
                    <ul style={{ listStyle: "none", padding: 0, margin: "14px 0 0" }}>
                      {pair.players.map((pl) => (
                        <li
                          key={pl.playerNo}
                          style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "6px 0" }}
                        >
                          <span className={pl.hasRealName ? undefined : "placeholder-name"}>{pl.name}</span>
                          <span style={{ color: "var(--faint)", fontSize: 12, whiteSpace: "nowrap" }}>
                            {pl.skillRank ? SKILL_RANK_TH[pl.skillRank] ?? pl.skillRank : "รอระดับมือ"}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {pair.withdrawn ? (
                      <p style={{ color: "var(--red)", fontSize: 12, margin: "8px 0 0" }}>ถอนตัว</p>
                    ) : null}
                  </Link>
                ))}
              </div>
            </section>
          );
        })}

        {pairs.length === 0 ? <EmptyState>ยังไม่มีข้อมูลคู่แข่งขันของสีนี้</EmptyState> : null}
      </div>
    </main>
  );
}
