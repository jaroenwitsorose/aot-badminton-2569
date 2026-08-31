"use client";

/**
 * สายการแข่งขันแบบเชื่อมเส้น (elimination bracket)
 *
 * เส้นเชื่อมวาดด้วย SVG โดยวัดตำแหน่งจริงของการ์ดแต่ละใบใน DOM (ไม่ได้คำนวณจากกริดตายตัว)
 * เพราะชื่อคู่แต่ละใบยาวไม่เท่ากัน ตำแหน่งจึงขยับได้เสมอ
 *
 * กติกาสี: แมตช์ที่ยังไม่จบ = เส้นเทาประ ; แมตช์ที่จบแล้ว = เส้นทึบสีของทีมที่ไปต่อ
 * (ผู้ชนะสำหรับสายหลัก หรือผู้แพ้สำหรับเส้นไปชิงอันดับ 3) ไล่สีต่อไปเรื่อย ๆ ตามผู้เล่นที่ชนะจริง
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { MatchView } from "@/lib/tournament";
import { StatusChip } from "./ui";

interface BracketRound {
  title: string;
  matches: MatchView[];
}

/**
 * สถานะของรอบหนึ่ง ๆ — ใช้ตอบคำถามว่า "ตอนนี้แข่งถึงรอบไหนแล้ว"
 * ซึ่งเดิมต้องไล่อ่านการ์ดทีละใบในผังที่กว้างกว่าจอ จึงดูยากมากบนมือถือ
 */
type RoundState = "done" | "playing" | "waiting";

function roundState(matches: MatchView[]): { state: RoundState; done: number; total: number } {
  const total = matches.length;
  const done = matches.filter((m) => m.decided).length;
  const started = matches.some((m) => m.status !== "WAITING");
  return { state: done === total && total > 0 ? "done" : started ? "playing" : "waiting", done, total };
}

const STATE_TH: Record<RoundState, string> = {
  done: "จบแล้ว",
  playing: "กำลังแข่ง",
  waiting: "ยังไม่เริ่ม",
};

interface ConnectorLine {
  key: string;
  d: string;
  color: string;
  decided: boolean;
}

export function BracketTree({ rounds, thirdPlace }: { rounds: BracketRound[]; thirdPlace?: MatchView }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef(new Map<string, HTMLAnchorElement>());
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  const [lines, setLines] = useState<ConnectorLine[]>([]);
  const [size, setSize] = useState({ w: 0, h: 0 });

  const allMatches = useMemo(() => {
    const list = rounds.flatMap((r) => r.matches);
    if (thirdPlace) list.push(thirdPlace);
    return list;
  }, [rounds, thirdPlace]);

  const matchByCode = useMemo(() => {
    const map = new Map<string, MatchView>();
    for (const m of allMatches) map.set(m.sourceMatchCode, m);
    return map;
  }, [allMatches]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const compute = () => {
      const cRect = container.getBoundingClientRect();
      // getBoundingClientRect ให้ตำแหน่งตาม viewport ปัจจุบัน ซึ่งขยับตาม scrollLeft ของกล่องนี้เอง
      // บวก scrollLeft/scrollTop กลับเข้าไปเพื่อให้พิกัดอิงกับเนื้อหาจริง ไม่ผูกกับตำแหน่งเลื่อนตอนคำนวณ
      const scrollX = container.scrollLeft;
      const scrollY = container.scrollTop;
      const next: ConnectorLine[] = [];

      for (const m of allMatches) {
        for (const [source, slot] of [
          [m.sideASource, "A"],
          [m.sideBSource, "B"],
        ] as const) {
          const ref = /^(WINNER|LOSER):(.+)$/.exec(source);
          if (!ref) continue;
          const feeder = matchByCode.get(ref[2]);
          if (!feeder) continue;

          const feederCard = cardRefs.current.get(feeder.matchUid);
          const targetRow = rowRefs.current.get(`${m.matchUid}:${slot}`);
          if (!feederCard || !targetRow) continue;

          // ผู้ที่ "เดินทาง" ไปแมตช์ถัดไปตามชนิด token — WINNER = ผู้ชนะ, LOSER = ผู้แพ้ (ไปชิงอันดับ 3)
          const travelSide =
            feeder.winnerSide === null
              ? null
              : ref[1] === "WINNER"
                ? feeder.winnerSide
                : feeder.winnerSide === "A"
                  ? "B"
                  : "A";
          const decided = feeder.decided && travelSide !== null;

          const startRow = decided ? rowRefs.current.get(`${feeder.matchUid}:${travelSide}`) : null;
          const startRect = (startRow ?? feederCard).getBoundingClientRect();
          const endRect = targetRow.getBoundingClientRect();

          const x1 = startRect.right - cRect.left + scrollX;
          const y1 = startRect.top + startRect.height / 2 - cRect.top + scrollY;
          const x2 = endRect.left - cRect.left + scrollX;
          const y2 = endRect.top + endRect.height / 2 - cRect.top + scrollY;
          const midX = x1 + Math.max(18, (x2 - x1) / 2);
          const r = 10;
          const down = y2 > y1;
          const d =
            Math.abs(y2 - y1) < 1
              ? `M ${x1} ${y1} H ${x2}`
              : `M ${x1} ${y1} H ${midX - r} ` +
                `Q ${midX} ${y1} ${midX} ${y1 + (down ? r : -r)} ` +
                `V ${y2 - (down ? r : -r)} ` +
                `Q ${midX} ${y2} ${midX + r} ${y2} ` +
                `H ${x2}`;

          let color = "var(--line)";
          if (decided) {
            const pairUid = ref[1] === "WINNER" ? feeder.winnerPairUid : feeder.loserPairUid;
            const side =
              feeder.sideA.pair?.pairUid === pairUid
                ? feeder.sideA
                : feeder.sideB.pair?.pairUid === pairUid
                  ? feeder.sideB
                  : null;
            if (side?.pair) color = side.pair.colorHex;
          }

          next.push({ key: `${feeder.matchUid}>${m.matchUid}:${slot}`, d, color, decided });
        }
      }

      setLines(next);
      setSize({ w: container.scrollWidth, h: container.scrollHeight });
    };

    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(container);
    window.addEventListener("resize", compute);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", compute);
    };
  }, [allMatches, matchByCode]);

  const steps = useMemo(() => {
    const list = rounds.map((r) => ({ title: r.title, ...roundState(r.matches) }));
    if (thirdPlace) list.push({ title: "ชิงอันดับ 3", ...roundState([thirdPlace]) });
    return list;
  }, [rounds, thirdPlace]);
  const currentIndex = steps.findIndex((x) => x.state !== "done");

  return (
    <div className="bracket-block">
      {/* แถบบอกว่าแข่งถึงรอบไหนแล้ว — อ่านได้ทันทีโดยไม่ต้องเลื่อนดูผัง */}
      <ol className="bracket-steps">
        {steps.map((st, i) => (
          <li
            key={st.title}
            className={`bracket-step ${st.state}${i === currentIndex ? " current" : ""}`}
          >
            <span className="bracket-step-dot" aria-hidden />
            <span className="bracket-step-body">
              <b>{st.title}</b>
              <small>
                {st.state === "done" ? `จบแล้ว ${st.total} แมตช์` : `${st.done}/${st.total} · ${STATE_TH[st.state]}`}
              </small>
            </span>
          </li>
        ))}
      </ol>

    <div className="bracket-tree-scroll" ref={containerRef}>
      <svg className="bracket-tree-svg" width={size.w} height={size.h} aria-hidden>
        {lines.map((l) => (
          <path
            key={l.key}
            d={l.d}
            fill="none"
            stroke={l.color}
            strokeWidth={l.decided ? 2.5 : 1.5}
            strokeDasharray={l.decided ? undefined : "5 4"}
            opacity={l.decided ? 0.95 : 0.55}
          />
        ))}
      </svg>

      <div className="bracket-tree-columns">
        {rounds.map((round, i) => {
          // ชิงอันดับ 3 อยู่คอลัมน์เดียวกับชิงชนะเลิศ โดยวางไว้ใต้ชิงชนะเลิศ
          // เคยแยกเป็นคอลัมน์ของตัวเองแล้วดันไปชิดล่างขวา หัวข้อลอยต่ำกว่าคอลัมน์อื่น
          // จนดูเหมือนผังพัง และอ่านไม่ออกว่ารอบไหนมาก่อนมาหลัง
          const isLast = i === rounds.length - 1;
          const withThird = isLast && thirdPlace;
          return (
            <div className={`bracket-tree-col${withThird ? " bracket-tree-col-final" : ""}`} key={round.title}>
              <h3>
                {round.title} <span>({round.matches.length} แมตช์)</span>
              </h3>
              <div className="bracket-tree-col-inner">
                {round.matches.map((m) => (
                  <BracketTreeCard key={m.matchUid} match={m} cardRefs={cardRefs} rowRefs={rowRefs} />
                ))}
                {withThird ? (
                  <BracketTreeCard match={thirdPlace} cardRefs={cardRefs} rowRefs={rowRefs} />
                ) : null}
              </div>
            </div>
          );
        })}

        {/* กันเหนียว: ถ้าไม่มีรอบใดเลย ชิงอันดับ 3 จะไม่มีคอลัมน์ให้อาศัย */}
        {rounds.length === 0 && thirdPlace ? (
          <div className="bracket-tree-col">
            <h3>ชิงอันดับ 3</h3>
            <div className="bracket-tree-col-inner">
              <BracketTreeCard match={thirdPlace} cardRefs={cardRefs} rowRefs={rowRefs} />
            </div>
          </div>
        ) : null}
      </div>
    </div>
    </div>
  );
}

function BracketTreeCard({
  match,
  cardRefs,
  rowRefs,
}: {
  match: MatchView;
  cardRefs: React.MutableRefObject<Map<string, HTMLAnchorElement>>;
  rowRefs: React.MutableRefObject<Map<string, HTMLDivElement>>;
}) {
  const nameOf = (side: MatchView["sideA"]) => side.pair?.label ?? side.pendingLabel;

  /**
   * หัวข้อบนกล่อง: บอกว่ากล่องนี้คือรอบไหนและประเภทอะไร
   * ผังกว้างกว่าจอ พอเลื่อนไปกลางผังแล้วหัวคอลัมน์เลื่อนหายไปด้วย
   * ถ้าไม่มีหัวข้อบนกล่องจะไม่รู้เลยว่ากำลังดูรอบอะไรอยู่
   * มือ D / มือ C รอบน็อกเอาต์ไม่ผูกประเภท จึงบอกสายบน/สายล่างแทน
   */
  const kind =
    match.eventNameTh ??
    (match.bracket === "UPPER" ? "สายบน" : match.bracket === "LOWER" ? "สายล่าง" : null);

  return (
    <Link
      href={`/results/${match.matchUid}`}
      className="bracket-tree-card"
      ref={(el) => {
        if (el) cardRefs.current.set(match.matchUid, el);
        else cardRefs.current.delete(match.matchUid);
      }}
    >
      <div className="bracket-tree-head">
        <b>{match.roundLabel}</b>
        {kind ? <span>{kind}</span> : null}
      </div>

      <div className="bracket-tree-meta">
        <span>#{match.matchNo}</span>
        <StatusChip status={match.status} walkover={match.walkover} />
      </div>

      <div
        className={`bracket-tree-row ${match.winnerSide === "A" ? "win" : ""}`}
        style={match.sideA.pair ? { borderLeftColor: match.sideA.pair.colorHex } : undefined}
        ref={(el) => {
          if (el) rowRefs.current.set(`${match.matchUid}:A`, el);
          else rowRefs.current.delete(`${match.matchUid}:A`);
        }}
      >
        <span className={match.sideA.pair ? undefined : "placeholder-name"}>{nameOf(match.sideA)}</span>
        {match.decided ? <b className="tabular">{match.gamesWonA}</b> : null}
      </div>

      <div
        className={`bracket-tree-row ${match.winnerSide === "B" ? "win" : ""}`}
        style={match.sideB.pair ? { borderLeftColor: match.sideB.pair.colorHex } : undefined}
        ref={(el) => {
          if (el) rowRefs.current.set(`${match.matchUid}:B`, el);
          else rowRefs.current.delete(`${match.matchUid}:B`);
        }}
      >
        <span className={match.sideB.pair ? undefined : "placeholder-name"}>{nameOf(match.sideB)}</span>
        {match.decided ? <b className="tabular">{match.gamesWonB}</b> : null}
      </div>
    </Link>
  );
}
