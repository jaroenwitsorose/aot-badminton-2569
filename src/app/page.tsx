"use client";

import Image from "next/image";
import Link from "next/link";
import { useSnapshot } from "@/components/snapshot-provider";
import { LiveCourtStrip } from "@/components/live-court-strip";
import { EmptyState, LevelChip, MatchCard, SectionHeading } from "@/components/ui";

export default function HomePage() {
  const { snapshot } = useSnapshot();
  const { tournament, levels, teamTotals, readiness, days } = snapshot;
  // แถบคะแนนเทียบกับสีที่นำอยู่ ไม่ใช่เทียบกับ 37 ซึ่งเป็นยอดที่ 4 สีแบ่งกัน
  const scoreLeader = Math.max(1, ...teamTotals.map((t) => t.points));

  const dateText = tournament.datesConfirmed
    ? `${days[0]?.label ?? ""} – ${days[days.length - 1]?.label ?? ""}`.replace(/วันที่ \d+ · /g, "")
    : "อยู่ระหว่างกำหนด";
  const venueText = tournament.venueConfirmed ? tournament.venue : "สทย. หรือ สโมสรท่าอากาศยาน (รอยืนยัน)";

  const recent = [...snapshot.matches].filter((m) => m.decided).sort((a, b) => b.matchNo - a.matchNo).slice(0, 4);
  const upcoming = snapshot.matches.filter((m) => !m.decided && m.status !== "CANCELLED").slice(0, 8);

  return (
    <main>
      <section className="hero">
        <div className="shell hero-grid">
          <div className="hero-copy">
            <div className="live-badge">
              <span className="live-dot" aria-hidden /> LIVE TOURNAMENT SYSTEM
            </div>
            <p className="eyebrow">AOT SPORTS WEEK · 2569</p>
            <h1>
              การแข่งขันแบดมินตัน
              <br />
              <span>กีฬาภายใน ทอท.</span>
            </h1>
            <p className="hero-lead">
              ติดตามตารางแข่งขัน ผลแต่ละคอร์ต สายการแข่งขัน และคะแนนสะสมของทั้ง 4 สี แบบเรียลไทม์
            </p>

            <dl className="event-facts">
              <div>
                <dt>วันแข่งขัน</dt>
                <dd className={tournament.datesConfirmed ? undefined : "pending"}>{dateText}</dd>
              </div>
              <div>
                <dt>สถานที่</dt>
                <dd className={tournament.venueConfirmed ? undefined : "pending"}>{venueText}</dd>
              </div>
            </dl>

            <div className="button-row">
              <Link href="/schedule" className="button gold">
                ดูตารางแข่งขัน
              </Link>
              <Link href="/scores" className="button outline">
                ดูคะแนนสี
              </Link>
            </div>
          </div>

          <div className="hero-art">
            <Image
              src="/assets/aot-badminton-hero.png"
              alt="ถ้วยรางวัลการแข่งขันแบดมินตัน"
              width={660}
              height={660}
              priority
            />
          </div>
        </div>
      </section>

      <section className="metrics">
        <div className="shell metric-grid">
          <div>
            <b>{levels.length}</b>
            <span>ระดับมือ</span>
          </div>
          <div>
            <b>{snapshot.teams.length}</b>
            <span>สี</span>
          </div>
          <div>
            <b>{readiness.eventTotal}</b>
            <span>คู่แข่งขัน</span>
          </div>
          <div>
            <b>{days.length}</b>
            <span>วันแข่งขัน</span>
          </div>
          <div>
            <b className="tabular">
              {readiness.matchesCompleted}/{readiness.matchesTotal}
            </b>
            <span>แมตช์จบแล้ว</span>
          </div>
        </div>
      </section>

      <LiveCourtStrip />

      <SetupNotice />

      <section className="content-section shell">
        <SectionHeading
          eyebrow="TOURNAMENT FORMAT"
          title="ประเภทมือและรูปแบบการแข่งขัน"
          sub="หน้าเว็บใช้ชื่อมือตามประกาศการแข่งขัน และเรียกการแข่งขันแต่ละครั้งว่า “แมตช์” ทั้งระบบ"
        />
        <div className="level-grid">
          {levels.map((level) => (
            <article className="level-card" key={level.levelCode}>
              <LevelChip levelCode={level.levelCode} nameTh={level.nameTh} />
              <h3>{level.format}</h3>
              <p>{level.eligibility}</p>
              <dl>
                <div>
                  <dt>คู่แข่งขัน</dt>
                  <dd>{level.pairSlots} คู่</dd>
                </div>
                <div>
                  <dt>จำนวนแมตช์</dt>
                  <dd className="tabular">{level.matchCount}</dd>
                </div>
              </dl>
              <Link href={`/brackets?level=${level.levelCode}`}>ดูสายการแข่งขัน →</Link>
            </article>
          ))}
        </div>
      </section>

      <section className="content-section shell" style={{ paddingTop: 0 }}>
        <SectionHeading
          title="ผลล่าสุด"
          right={
            <Link href="/results" style={{ color: "var(--blue)", fontWeight: 800, fontSize: 14 }}>
              ดูทั้งหมด →
            </Link>
          }
        />
        {recent.length === 0 ? (
          <EmptyState>ยังไม่มีผลการแข่งขัน</EmptyState>
        ) : (
          <div className="stack">
            {recent.map((m) => (
              <MatchCard key={m.matchUid} match={m} />
            ))}
          </div>
        )}
      </section>

      <section className="content-section shell" style={{ paddingTop: 0 }}>
        <SectionHeading
          title="แมตช์ถัดไป"
          right={
            <Link href="/schedule" style={{ color: "var(--blue)", fontWeight: 800, fontSize: 14 }}>
              ตารางทั้งหมด →
            </Link>
          }
        />
        {upcoming.length === 0 ? (
          <EmptyState>แข่งครบทุกแมตช์แล้ว</EmptyState>
        ) : (
          <div className="horizontal-scroll">
            {upcoming.map((m) => (
              <MatchCard key={m.matchUid} match={m} showWhen={false} />
            ))}
          </div>
        )}
      </section>

      <section className="content-section shell" style={{ paddingTop: 0 }}>
        <SectionHeading
          eyebrow="COLOR STANDINGS"
          title="คะแนนสี"
          sub="คะแนนหลัก 37 คะแนนแบ่งกันระหว่าง 4 สี + โบนัสปลอบใจมือทั่วไป · เกณฑ์เสมอ: เหรียญทอง > เหรียญเงิน > เหรียญทองแดง"
          right={
            <Link href="/scores" style={{ color: "var(--blue)", fontWeight: 800, fontSize: 14 }}>
              ดูที่มาของคะแนน →
            </Link>
          }
        />
        <div className="score-grid">
          {teamTotals.map((t) => (
            <article className="score-card" key={t.teamCode}>
              <div className="score-top" style={{ background: t.colorHex }} />
              <div className="score-body">
                <div className="score-rank">
                  <span style={{ fontWeight: 800, color: t.colorHex }}>{t.nameTh}</span>
                  <span style={{ color: "var(--muted)", fontSize: 13 }}>อันดับ {t.rank}</span>
                </div>
                <b className="tabular" style={{ fontSize: 36, display: "block", marginTop: 6 }}>
                  {t.points}
                </b>
                <div className="score-meter">
                  <div style={{ width: `${(t.points / scoreLeader) * 100}%`, background: t.colorHex }} />
                </div>
                <p className="medals" style={{ margin: "12px 0 0" }}>
                  ทอง {t.gold} · เงิน {t.silver} · ทองแดง {t.bronze}
                </p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

/** แจ้งว่ายังรอข้อมูลจริงอะไรบ้าง — จะหายไปเองเมื่อกรอกครบ */
function SetupNotice() {
  const { snapshot } = useSnapshot();
  const { readiness, tournament } = snapshot;
  const pending: string[] = [];
  if (!tournament.datesConfirmed) pending.push("วันแข่งจริง (ขณะนี้ใช้ วันที่ 1-3 ชั่วคราว)");
  if (!tournament.venueConfirmed) pending.push("สถานที่แข่งขัน");
  if (readiness.namesFilled < readiness.namesTotal)
    pending.push(`รายชื่อนักกีฬา ${readiness.namesFilled}/${readiness.namesTotal} คน`);
  if (readiness.eventLocked < readiness.eventTotal)
    pending.push(`ล็อกประเภท MD/WD/XD ${readiness.eventLocked}/${readiness.eventTotal} คู่`);
  if (readiness.drawAssigned < readiness.drawTotal)
    pending.push(`ผลจับสลาก ${readiness.drawAssigned}/${readiness.drawTotal} ช่อง`);

  if (pending.length === 0) return null;

  return (
    <section className="content-section shell" style={{ paddingBottom: 0 }}>
      <div className="notice warn">
        <strong>ข้อมูลบางส่วนยังรอยืนยัน</strong> — ตารางและสายการแข่งขันพร้อมแล้ว ระบบจะอัปเดตหน้าเว็บเองทันทีที่กรอกข้อมูลต่อไปนี้
        <ul style={{ margin: "8px 0 0", paddingLeft: 20 }}>
          {pending.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </div>
    </section>
  );
}
