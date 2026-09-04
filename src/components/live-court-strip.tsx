"use client";

/**
 * แถบคอร์ตสด — บอกว่าแต่ละคอร์ตกำลังแข่งอะไร และคิวถัดไปคืออะไร
 *
 * เดิมบอกแค่ชื่อคู่กับเวลา คนอ่านจึงไม่รู้ว่าเป็นมือไหน ประเภทอะไร สีอะไร
 * และเห็นแค่นัดเดียว ทำให้ดูไม่ออกว่าตัวเองจะได้ลงเมื่อไร
 *
 * ตอนนี้แต่ละคอร์ตบอก: นัดปัจจุบันแบบเต็ม (ระดับมือ ประเภท รอบ สีทั้งสองฝั่ง)
 * แล้วต่อด้วยคิวถัดไปอีก 2 นัดแบบย่อ
 *
 * ข้อมูลทั้งหมดมีอยู่ใน snapshot เดิมแล้ว ไม่ได้เรียกอะไรเพิ่มจากเซิร์ฟเวอร์
 */

import { useEffect, useState } from "react";
import { useSnapshot } from "./snapshot-provider";
import type { MatchView } from "@/lib/tournament";

/** เรียงตามลำดับที่จะได้ลงจริง ไม่ใช่ตามเลขแมตช์อย่างเดียว */
const inOrder = (a: MatchView, b: MatchView) =>
  a.dayNo - b.dayNo || a.startTime.localeCompare(b.startTime) || a.matchNo - b.matchNo;

/** "มือใหม่ · ชายคู่ · รอบ 16 คู่" — ประเภทเป็น null ในมือ D/C/ทั่วไป จึงต้องกรองออก */
function describeKind(m: MatchView): string {
  return [m.levelNameTh, m.eventNameTh, m.roundLabel].filter(Boolean).join(" · ");
}

const STATE_TH: Record<string, string> = {
  PLAYING: "กำลังแข่งขัน",
  CALLED: "เรียกลงคอร์ต",
};

export function LiveCourtStrip() {
  const { snapshot, isStale, lastSyncedAt, refresh } = useSnapshot();
  const [secondsAgo, setSecondsAgo] = useState(0);

  useEffect(() => {
    const tick = () => setSecondsAgo(Math.round((Date.now() - lastSyncedAt.getTime()) / 1000));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [lastSyncedAt]);

  const courts = [...new Set(snapshot.matches.map((m) => m.courtNo))].sort((a, b) => a - b);

  const forCourt = (courtNo: number) => {
    const onCourt = snapshot.matches.filter((m) => m.courtNo === courtNo).sort(inOrder);
    const current =
      onCourt.find((m) => m.status === "PLAYING") ??
      onCourt.find((m) => m.status === "CALLED") ??
      onCourt.find((m) => !m.decided);
    if (!current) return { current: null, upcoming: [] as MatchView[] };
    const after = onCourt.indexOf(current);
    return { current, upcoming: onCourt.slice(after + 1).filter((m) => !m.decided).slice(0, 2) };
  };

  // แข่งครบทุกแมตช์แล้ว ต่างจาก "คอร์ตว่าง" ระหว่างวัน ต้องบอกให้ตรงความจริง
  const allFinished = snapshot.matches.length > 0 && snapshot.matches.every((m) => m.decided);

  return (
    <section className="live-section">
      <div className="shell">
        <div className="inline-heading">
          <span>สถานะคอร์ตแบบเรียลไทม์</span>
          <small>
            <button
              type="button"
              onClick={refresh}
              style={{ background: "transparent", border: 0, color: "inherit", padding: 0 }}
            >
              <span className={`live-dot ${isStale ? "offline" : ""}`} style={{ marginRight: 8 }} aria-hidden />
              {isStale ? `เชื่อมต่อไม่ได้ · ข้อมูลเมื่อ ${secondsAgo} วินาทีที่แล้ว` : "ข้อมูลสด · กดเพื่อรีเฟรชทันที"}
            </button>
          </small>
        </div>

        <div className="court-grid">
          {courts.map((courtNo) => {
            const { current, upcoming } = forCourt(courtNo);
            return (
              <article className="court-card" key={courtNo}>
                <header className="court-head">
                  <b>คอร์ต {courtNo}</b>
                  <span>{current ? `#${current.matchNo}` : allFinished ? "จบแล้ว" : "ว่าง"}</span>
                </header>

                {current ? (
                  <>
                    <div className="court-state">
                      <em className={current.status === "PLAYING" ? "now" : undefined}>
                        {STATE_TH[current.status] ?? "คิวถัดไป"}
                      </em>
                      <time>
                        {current.startTime}–{current.endTime}
                      </time>
                    </div>

                    <p className="court-kind">{describeKind(current)}</p>

                    <div className="court-sides">
                      {([current.sideA, current.sideB] as const).map((side, i) => (
                        <div className="court-side" key={i} style={{ borderColor: side.colorHex ?? "#ffffff30" }}>
                          <span className="court-team" style={{ color: side.colorHex ?? "#aebbd0" }}>
                            {side.teamNameTh ?? "รอผล"}
                          </span>
                          <span className="court-pair">{side.pair?.label ?? side.pendingLabel}</span>
                        </div>
                      ))}
                    </div>

                    {upcoming.length > 0 ? (
                      <ul className="court-next">
                        {upcoming.map((n) => (
                          <li key={n.matchUid}>
                            <time>{n.startTime}</time>
                            <span className="court-next-no">#{n.matchNo}</span>
                            <span className="court-next-kind">{describeKind(n)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="court-none">ไม่มีคิวถัดไปในคอร์ตนี้</p>
                    )}
                  </>
                ) : (
                  <p className="court-none">{allFinished ? "แข่งครบทุกแมตช์แล้ว" : "ไม่มีแมตช์ในคอร์ตนี้"}</p>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
