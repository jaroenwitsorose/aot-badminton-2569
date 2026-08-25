"use client";

import { useEffect, useState } from "react";
import { useSnapshot } from "./snapshot-provider";

/** แถบคอร์ตสด — เรียงตามหมายเลขคอร์ต แสดงแมตช์ที่กำลังแข่งหรือคิวถัดไปของคอร์ตนั้น */
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
    const onCourt = snapshot.matches.filter((m) => m.courtNo === courtNo);
    return (
      onCourt.find((m) => m.status === "PLAYING") ??
      onCourt.find((m) => m.status === "CALLED") ??
      onCourt.find((m) => m.status === "WAITING")
    );
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
            const match = forCourt(courtNo);
            const sideA = match?.sideA.pair?.label ?? match?.sideA.pendingLabel ?? "—";
            const sideB = match?.sideB.pair?.label ?? match?.sideB.pendingLabel ?? "—";
            return (
              <article className="court-card" key={courtNo}>
                <header>
                  <span>คอร์ต {courtNo}</span>
                  <span>{match ? `#${match.matchNo}` : allFinished ? "จบแล้ว" : "ว่าง"}</span>
                </header>
                {match ? (
                  <p>
                    <em>
                      {match.status === "PLAYING"
                        ? "กำลังแข่งขัน"
                        : match.status === "CALLED"
                          ? "เรียกลงคอร์ต"
                          : `คิวถัดไป ${match.startTime}`}
                    </em>
                    <br />
                    {sideA}
                    <br />
                    พบ {sideB}
                  </p>
                ) : (
                  <p>{allFinished ? "แข่งครบทุกแมตช์แล้ว" : "ไม่มีแมตช์ในคอร์ตนี้"}</p>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
