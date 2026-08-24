"use client";

import { useState } from "react";
import { useSnapshot } from "@/components/snapshot-provider";
import { EmptyState, MatchCard } from "@/components/ui";

export default function ResultsPage() {
  const { snapshot } = useSnapshot();
  const [levelCode, setLevelCode] = useState("ALL");
  const [teamCode, setTeamCode] = useState("ALL");
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  const results = snapshot.matches
    .filter((m) => m.decided)
    .filter((m) => levelCode === "ALL" || m.levelCode === levelCode)
    .filter((m) => teamCode === "ALL" || m.sideA.teamCode === teamCode || m.sideB.teamCode === teamCode)
    .filter((m) =>
      !q
        ? true
        : [String(m.matchNo), m.roundLabel, m.sideA.pair?.label ?? "", m.sideB.pair?.label ?? ""]
            .join(" ")
            .toLowerCase()
            .includes(q),
    )
    // ผลที่บันทึกล่าสุดอยู่บนสุดเสมอ
    .sort((a, b) => {
      const at = a.publicUpdatedAt ? Date.parse(a.publicUpdatedAt) : 0;
      const bt = b.publicUpdatedAt ? Date.parse(b.publicUpdatedAt) : 0;
      return bt - at || b.matchNo - a.matchNo;
    });

  return (
    <main>
      <section className="page-hero">
        <div className="shell">
          <p className="eyebrow">RESULTS</p>
          <h1>ผลการแข่งขัน</h1>
          <p>ผลที่บันทึกล่าสุดแสดงบนสุด · กด “รายละเอียด” เพื่อดูสกอร์รายเกมและเส้นทางของคู่นั้น</p>
        </div>
      </section>

      <div className="page-shell shell">
        <div className="panel">
          <div className="filter-bar" style={{ marginBottom: 0 }}>
            <label>
              ระดับมือ
              <select value={levelCode} onChange={(e) => setLevelCode(e.target.value)}>
                <option value="ALL">ทุกระดับ</option>
                {snapshot.levels.map((l) => (
                  <option key={l.levelCode} value={l.levelCode}>
                    {l.nameTh}
                  </option>
                ))}
              </select>
            </label>
            <label>
              สี
              <select value={teamCode} onChange={(e) => setTeamCode(e.target.value)}>
                <option value="ALL">ทุกสี</option>
                {snapshot.teams.map((t) => (
                  <option key={t.teamCode} value={t.teamCode}>
                    {t.nameTh}
                  </option>
                ))}
              </select>
            </label>
            <label>
              ค้นหา
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="เลขแมตช์ หรือชื่อนักกีฬา"
              />
            </label>
          </div>
        </div>

        <div className="summary-strip">
          <span>
            แข่งจบแล้ว{" "}
            <b className="tabular">
              {snapshot.readiness.matchesCompleted}/{snapshot.readiness.matchesTotal}
            </b>{" "}
            แมตช์
          </span>
          <span>แสดง {results.length} รายการตามเงื่อนไขที่เลือก</span>
        </div>

        {results.length === 0 ? (
          <EmptyState>ยังไม่มีผลการแข่งขันตามเงื่อนไขที่เลือก</EmptyState>
        ) : (
          <div className="stack">
            {results.map((m) => (
              <MatchCard key={m.matchUid} match={m} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
