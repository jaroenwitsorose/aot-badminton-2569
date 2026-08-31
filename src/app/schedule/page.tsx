"use client";

import { useEffect, useMemo, useState } from "react";
import { useSnapshot } from "@/components/snapshot-provider";
import { EmptyState, MatchCard } from "@/components/ui";
import { PairPathCard } from "@/components/pair-path";
import { buildPairPath } from "@/lib/match-path";
import type { MatchView } from "@/lib/tournament";

export default function SchedulePage() {
  const { snapshot } = useSnapshot();
  const [dayNo, setDayNo] = useState<string>(String(snapshot.days[0]?.dayNo ?? 1));
  const [levelCode, setLevelCode] = useState("ALL");
  const [courtNo, setCourtNo] = useState("ALL");
  const [status, setStatus] = useState("ALL");
  const [query, setQuery] = useState("");
  const [pickedPairUid, setPickedPairUid] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const searching = q.length > 0;

  // ค้นหาชื่อ = อยากรู้ว่า "เล่นวันไหน" จึงค้นข้ามทุกวัน ไม่ผูกกับแท็บวันที่เลือกอยู่
  const courts = useMemo(
    () =>
      [...new Set(snapshot.matches.filter((m) => m.dayNo === Number(dayNo)).map((m) => m.courtNo))].sort(
        (a, b) => a - b,
      ),
    [snapshot.matches, dayNo],
  );

  const matchText = (m: MatchView) =>
    [
      String(m.matchNo),
      m.roundLabel,
      m.levelNameTh,
      m.eventNameTh ?? "",
      m.sideA.pair?.label ?? m.sideA.pendingLabel,
      m.sideB.pair?.label ?? m.sideB.pendingLabel,
    ]
      .join(" ")
      .toLowerCase();

  const matches = useMemo(
    () =>
      snapshot.matches.filter((m) => {
        if (!searching && m.dayNo !== Number(dayNo)) return false;
        if (levelCode !== "ALL" && m.levelCode !== levelCode) return false;
        if (!searching && courtNo !== "ALL" && m.courtNo !== Number(courtNo)) return false;
        if (
          status !== "ALL" &&
          !(status === "OPEN" ? !m.decided : status === "DONE" ? m.decided : m.status === status)
        ) {
          return false;
        }
        return !searching || matchText(m).includes(q);
      }),
    [snapshot.matches, dayNo, levelCode, courtNo, status, searching, q],
  );

  // คู่ที่ชื่อตรงกับคำค้น เอาไว้แสดงเส้นทางการแข่งขัน
  const matchedPairs = useMemo(() => {
    if (!searching) return [];
    return snapshot.pairs.filter((p) => p.label.toLowerCase().includes(q)).slice(0, 8);
  }, [snapshot.pairs, searching, q]);

  // เจอคู่เดียวก็เลือกให้เลย ไม่ต้องกดซ้ำ
  useEffect(() => {
    if (matchedPairs.length === 1) setPickedPairUid(matchedPairs[0].pairUid);
    else if (!matchedPairs.some((p) => p.pairUid === pickedPairUid)) setPickedPairUid(null);
  }, [matchedPairs, pickedPairUid]);

  const selectedPair = matchedPairs.find((p) => p.pairUid === pickedPairUid) ?? null;
  const path = useMemo(
    () => (selectedPair ? buildPairPath(snapshot.matches, selectedPair.pairUid, selectedPair.label) : null),
    [snapshot.matches, selectedPair],
  );

  const bySlot = useMemo(() => {
    const map = new Map<string, MatchView[]>();
    for (const m of matches) {
      const key = searching ? `${m.dayNo}|${m.startTime}` : m.startTime;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
      .map(([key, list]) => [key, list.sort((a, b) => a.courtNo - b.courtNo)] as const);
  }, [matches, searching]);

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
        <div className="panel" style={{ marginBottom: 18 }}>
          <label style={{ display: "block" }}>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>ค้นหานักกีฬา</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="พิมพ์ชื่อนักกีฬา หรือเลขแมตช์ เพื่อดูว่าแข่งวันไหนและเส้นทางถัดไป"
              className="search-input"
            />
          </label>

          {searching ? (
            matchedPairs.length > 0 ? (
              <>
                <p style={{ margin: "12px 0 0", fontSize: 12, color: "var(--muted)" }}>
                  {matchedPairs.length === 1
                    ? "เจอ 1 คู่ — แสดงเส้นทางด้านล่าง"
                    : `เจอ ${matchedPairs.length} คู่ กดเลือกเพื่อดูเส้นทาง`}
                </p>
                {matchedPairs.length > 1 ? (
                  <div className="pair-chips">
                    {matchedPairs.map((p) => (
                      <button
                        key={p.pairUid}
                        type="button"
                        className="pair-chip"
                        aria-pressed={p.pairUid === pickedPairUid}
                        onClick={() =>
                          setPickedPairUid(p.pairUid === pickedPairUid ? null : p.pairUid)
                        }
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </>
            ) : (
              <p style={{ margin: "12px 0 0", fontSize: 12, color: "var(--muted)" }}>
                ไม่พบชื่อนักกีฬาที่ตรงกับคำค้น — แสดงเฉพาะแมตช์ที่ข้อความตรงกัน
              </p>
            )
          ) : null}
        </div>

        {path && selectedPair ? (
          <PairPathCard
            path={path}
            teamNameTh={selectedPair.teamNameTh}
            colorHex={selectedPair.colorHex}
          />
        ) : null}

        {searching ? null : (
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
        )}

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
              <select
                value={courtNo}
                onChange={(e) => setCourtNo(e.target.value)}
                disabled={searching}
              >
                <option value="ALL">{searching ? "ทุกคอร์ต (ตอนค้นหา)" : "ทุกคอร์ต"}</option>
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
                {searching ? <span style={{ fontWeight: 400, color: "var(--muted)" }}> (ทุกวัน)</span> : null}
              </p>
            </div>
          </div>
        </div>

        {bySlot.length === 0 ? (
          <div style={{ marginTop: 18 }}>
            <EmptyState>ไม่มีแมตช์ตามเงื่อนไขที่เลือก</EmptyState>
          </div>
        ) : (
          bySlot.map(([key, list]) => (
            <section key={key} style={{ marginTop: 26 }}>
              <div className="inline-heading" style={{ color: "var(--muted)" }}>
                <span className="tabular" style={{ fontSize: 18, color: "var(--ink)", letterSpacing: 0 }}>
                  {searching ? `${list[0].dayLabel} · ` : ""}
                  {list[0].startTime} – {list[0].endTime}
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
