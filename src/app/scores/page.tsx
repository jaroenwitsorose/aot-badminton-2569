"use client";

import { useSnapshot } from "@/components/snapshot-provider";
import { SectionHeading } from "@/components/ui";
import {
  BASE_TOTAL_POINTS,
  MAX_TOTAL_POINTS,
  PLAYOFF_CONSOLATION_POINTS,
} from "@/lib/engine/scoring-constants";

export default function ScoresPage() {
  const { snapshot } = useSnapshot();
  const { teamTotals } = snapshot;
  const awarded = teamTotals.reduce((s, t) => s + t.points, 0);
  // แถบเทียบกับสีที่นำอยู่ ไม่ใช่เทียบกับคะแนนรวมทั้งงาน
  // (37 คือยอดที่ 4 สีแบ่งกัน สีเดียวไม่มีทางได้ครบ ถ้าหารด้วย 37 ทุกแถบจะสั้นเท่ากันหมด)
  const leader = Math.max(1, ...teamTotals.map((t) => t.points));

  return (
    <main>
      <section className="page-hero">
        <div className="shell">
          <p className="eyebrow">COLOR STANDINGS</p>
          <h1>คะแนนสี</h1>
          <p>
            คะแนนหลัก {BASE_TOTAL_POINTS} คะแนน แบ่งกันระหว่าง 4 สี · บวกโบนัสปลอบใจมือทั่วไปได้อีกไม่เกิน{" "}
            {MAX_TOTAL_POINTS - BASE_TOTAL_POINTS} คะแนน (คู่สีละ {PLAYOFF_CONSOLATION_POINTS}) ·
            แจกไปแล้ว {awarded} คะแนน · เกณฑ์ตัดสินเมื่อคะแนนเท่ากัน: เหรียญทอง &gt; เหรียญเงิน &gt; เหรียญทองแดง
          </p>
        </div>
      </section>

      <div className="page-shell shell">
        <div className="score-grid">
          {teamTotals.map((t) => (
            <article className="score-card" key={t.teamCode}>
              <div className="score-top" style={{ background: t.colorHex }} />
              <div className="score-body">
                <div className="score-rank">
                  <span style={{ fontWeight: 800, color: t.colorHex, fontSize: 17 }}>{t.nameTh}</span>
                  <span style={{ color: "var(--muted)", fontSize: 13 }}>อันดับ {t.rank}</span>
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 6 }}>
                  <b className="tabular">{t.points}</b>
                  <span style={{ color: "var(--faint)", fontSize: 13 }}>คะแนน</span>
                </div>
                <div className="score-meter">
                  <div style={{ width: `${(t.points / leader) * 100}%`, background: t.colorHex }} />
                </div>
                <p className="medals" style={{ margin: "12px 0 0" }}>
                  ทอง {t.gold} · เงิน {t.silver} · ทองแดง {t.bronze}
                </p>
              </div>
            </article>
          ))}
        </div>

        <div style={{ marginTop: 34 }}>
          <SectionHeading eyebrow="BREAKDOWN" title="ที่มาของคะแนน" sub="แยกตามระดับมือและผลการแข่งขัน" />
          <div className="level-grid">
            {teamTotals.map((t) => (
              <div className="level-card" key={t.teamCode} style={{ borderTop: `4px solid ${t.colorHex}` }}>
                <h3 style={{ margin: 0, fontSize: 17, color: t.colorHex }}>{t.nameTh}</h3>
                {t.breakdown.length === 0 ? (
                  <p style={{ color: "var(--faint)", fontSize: 13 }}>ยังไม่ได้รับคะแนน</p>
                ) : (
                  <div className="score-breakdown" style={{ borderTop: 0, marginTop: 10, paddingTop: 0 }}>
                    {t.breakdown.map((b) => (
                      <div key={`${b.sourceRef}-${b.result}`} style={{ alignItems: "flex-start" }}>
                        <span>
                          <b style={{ fontWeight: 700 }}>
                            {b.levelNameTh} · {b.categoryLabel}
                          </b>
                          <br />
                          <span style={{ color: "var(--muted)", fontSize: 12 }}>{b.result}</span>
                          {b.pairLabel ? (
                            <>
                              <br />
                              <span style={{ color: "var(--faint)", fontSize: 12 }}>{b.pairLabel}</span>
                            </>
                          ) : null}
                          {!b.countsTowardTotal ? (
                            <>
                              <br />
                              <span style={{ color: "var(--faint)", fontSize: 11 }}>ไม่นับคะแนนและไม่มีอันดับ</span>
                            </>
                          ) : null}
                        </span>
                        <b className="tabular" style={{ whiteSpace: "nowrap" }}>
                          {b.countsTowardTotal ? `+${b.points}` : "0"}
                          {b.medal ? (
                            <span style={{ color: "var(--muted)", fontSize: 11, fontWeight: 400 }}> {b.medal}</span>
                          ) : null}
                        </b>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 34 }}>
          <SectionHeading eyebrow="RULES" title="กติกาคะแนน" />
          <div className="panel scroll-x" style={{ padding: 0 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>ระดับมือ</th>
                  <th>รายการ</th>
                  <th>ผล</th>
                  <th style={{ textAlign: "right" }}>คะแนน</th>
                  <th>เหรียญ</th>
                </tr>
              </thead>
              <tbody>
                <RuleRow level="มือใหม่" cat="ชายคู่ / หญิงคู่ / คู่ผสม" result="อันดับ 1 · 2 · 3" pts="3 · 2 · 1" medal="ทอง · เงิน · ทองแดง" />
                <RuleRow level="มือ D" cat="สายบน" result="อันดับ 1 · 2 · 3" pts="3 · 2 · 1" medal="ทอง · เงิน · ทองแดง" />
                <RuleRow level="มือ D" cat="สายล่าง" result="ชนะเลิศสายล่าง" pts="0.5" medal="—" />
                <RuleRow level="มือ D" cat="สายล่าง" result="ชิงอันดับ 3 สายล่าง" pts="0" medal="ไม่มีอันดับ" muted />
                <RuleRow level="มือ C" cat="สายบน" result="อันดับ 1 · 2 · 3" pts="3 · 2 · 1" medal="ทอง · เงิน · ทองแดง" />
                <RuleRow level="มือ C" cat="สายล่าง" result="ชนะเลิศสายล่าง" pts="0.5" medal="—" />
                <RuleRow level="มือ C" cat="สายล่าง" result="ชิงอันดับ 3 สายล่าง" pts="0" medal="ไม่มีอันดับ" muted />
                <RuleRow level="มือทั่วไป" cat="ทีมสี" result="อันดับ 1 · 2 · 3" pts="3 · 2 · 1" medal="ทอง · เงิน · ทองแดง" />
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </main>
  );
}

function RuleRow({
  level,
  cat,
  result,
  pts,
  medal,
  muted,
}: {
  level: string;
  cat: string;
  result: string;
  pts: string;
  medal: string;
  muted?: boolean;
}) {
  return (
    <tr style={{ color: muted ? "var(--muted)" : undefined }}>
      <td style={{ whiteSpace: "nowrap" }}>{level}</td>
      <td>{cat}</td>
      <td>{result}</td>
      <td className="tabular" style={{ textAlign: "right", whiteSpace: "nowrap" }}>
        {pts}
      </td>
      <td style={{ whiteSpace: "nowrap" }}>{medal}</td>
    </tr>
  );
}
