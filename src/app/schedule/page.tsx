"use client";

import { useMemo, useState } from "react";
import { useSnapshot } from "@/components/snapshot-provider";
import { EmptyState, MatchCard } from "@/components/ui";
import type { MatchView } from "@/lib/tournament";

export default function SchedulePage() {
  const { snapshot } = useSnapshot();
  const [dayNo, setDayNo] = useState<string>(String(snapshot.days[0]?.dayNo ?? 1));
  const [levelCode, setLevelCode] = useState("ALL");
  const [courtNo, setCourtNo] = useState("ALL");
  const [status, setStatus] = useState("ALL");

  const courts = useMemo(
    () =>
      [...new Set(snapshot.matches.filter((m) => m.dayNo === Number(dayNo)).map((m) => m.courtNo))].sort(
        (a, b) => a - b,
      ),
    [snapshot.matches, dayNo],
  );

  const matches = snapshot.matches.filter(
    (m) =>
      m.dayNo === Number(dayNo) &&
      (levelCode === "ALL" || m.levelCode === levelCode) &&
      (courtNo === "ALL" || m.courtNo === Number(courtNo)) &&
      (status === "ALL" ||
        (status === "OPEN" ? !m.decided : status === "DONE" ? m.decided : m.status === status)),
  );

  const bySlot = useMemo(() => {
    const map = new Map<string, MatchView[]>();
    for (const m of matches) {
      if (!map.has(m.startTime)) map.set(m.startTime, []);
      map.get(m.startTime)!.push(m);
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([time, list]) => [time, list.sort((a, b) => a.courtNo - b.courtNo)] as const);
  }, [matches]);

  const day = snapshot.days.find((d) => d.dayNo === Number(dayNo));

  return (
    <main>
      <section className="page-hero">
        <div className="shell">
          <p className="eyebrow">SCHEDULE</p>
          <h1>ตารางแข่งขัน</h1>
          <p>
            แข่งช่องละ 30 นาที · มาถึงสนามก่อนเวลาแข่ง {snapshot.tournament.reportingMinutesBefore} นาที ·
            ไม่มารายงานตัวภายใน {snapshot.tournament.walkoverGraceMinutes} นาทีถือเป็น Walkover
            {day?.confirmed ? "" : " · วันจริงยังไม่กำหนด ใช้ชื่อวันชั่วคราวไปก่อน"}
          </p>
        </div>
      </section>

      <div className="page-shell shell">
        <div className="tab-row" role="tablist" aria-label="เลือกวันแข่ง">
          {snapshot.days.map((d) => (
            <button
              key={d.dayNo}
              type="button"
              role="tab"
              aria-selected={String(d.dayNo) === dayNo}
              className={String(d.dayNo) === dayNo ? "active" : undefined}
              onClick={() => {
                setDayNo(String(d.dayNo));
                setCourtNo("ALL");
              }}
            >
              {d.label}
            </button>
          ))}
        </div>

        <div className="panel">
          <div className="filter-bar four" style={{ marginBottom: 0 }}>
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
              คอร์ต
              <select value={courtNo} onChange={(e) => setCourtNo(e.target.value)}>
                <option value="ALL">ทุกคอร์ต</option>
                {courts.map((c) => (
                  <option key={c} value={c}>
                    คอร์ต {c}
                  </option>
                ))}
              </select>
            </label>
            <label>
              สถานะ
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="ALL">ทั้งหมด</option>
                <option value="OPEN">ยังไม่จบ</option>
                <option value="PLAYING">กำลังแข่งขัน</option>
                <option value="CALLED">เรียกลงคอร์ต</option>
                <option value="DONE">จบแล้ว</option>
              </select>
            </label>
            <div>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>จำนวน</span>
              <p style={{ margin: "6px 0 0", padding: "12px 0", fontWeight: 700 }}>
                {matches.length} แมตช์
              </p>
            </div>
          </div>
        </div>

        {bySlot.length === 0 ? (
          <div style={{ marginTop: 18 }}>
            <EmptyState>ไม่มีแมตช์ตามเงื่อนไขที่เลือก</EmptyState>
          </div>
        ) : (
          bySlot.map(([time, list]) => (
            <section key={time} style={{ marginTop: 26 }}>
              <div className="inline-heading" style={{ color: "var(--muted)" }}>
                <span className="tabular" style={{ fontSize: 18, color: "var(--ink)", letterSpacing: 0 }}>
                  {time} – {list[0].endTime}
                </span>
                <small>{list.length} คอร์ต</small>
              </div>
              <div className="stack">
                {list.map((m) => (
                  <MatchCard key={m.matchUid} match={m} />
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </main>
  );
}
