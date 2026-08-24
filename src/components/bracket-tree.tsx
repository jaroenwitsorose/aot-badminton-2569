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

  return (
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
        {rounds.map((round) => (
          <div className="bracket-tree-col" key={round.title}>
            <h3>
              {round.title} <span>({round.matches.length} แมตช์)</span>
            </h3>
            <div className="bracket-tree-col-inner">
              {round.matches.map((m) => (
                <BracketTreeCard key={m.matchUid} match={m} cardRefs={cardRefs} rowRefs={rowRefs} />
              ))}
            </div>
          </div>
        ))}

        {thirdPlace ? (
          <div className="bracket-tree-col bracket-tree-col-third">
            <h3>ชิงอันดับ 3</h3>
            <div className="bracket-tree-col-inner">
              <BracketTreeCard match={thirdPlace} cardRefs={cardRefs} rowRefs={rowRefs} />
            </div>
          </div>
        ) : null}
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

  return (
    <Link
      href={`/results/${match.matchUid}`}
      className="bracket-tree-card"
      ref={(el) => {
        if (el) cardRefs.current.set(match.matchUid, el);
        else cardRefs.current.delete(match.matchUid);
      }}
    >
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
