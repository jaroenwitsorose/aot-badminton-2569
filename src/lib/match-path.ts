/**
 * เส้นทางการแข่งขันของคู่หนึ่ง — "ถ้าชนะไปเรื่อย ๆ จะไปเจอแมตช์ไหนต่อ และอีกกี่แมตช์ถึงจบ"
 *
 * ใช้ที่มาของแต่ละฝั่ง (`WINNER:<รหัสแมตช์>`) ไล่ต่อกันไปข้างหน้า จึงเป็นการอ่านโครงสายจริง
 * ไม่ใช่การเดา — ถ้าโครงสายเปลี่ยน เส้นทางก็เปลี่ยนตามเอง
 *
 * ข้อจำกัดที่ต้องบอกผู้ใช้ให้ชัด (ระบบจะไม่เดาแทน):
 *   - รอบแบ่งกลุ่ม (มือ D / มือ C) ยังไม่รู้ว่าจะเข้าสายบนหรือสายล่าง จนกว่าจะจบกลุ่ม
 *   - มือทั่วไป แข่งเป็นคู่สี คู่ไหนได้ลงแมตช์ไหนขึ้นกับซองที่ส่งในแต่ละคู่สี
 */

import type { MatchView } from "./tournament";

export interface PathStep {
  match: MatchView;
  /** true = เป็นการคาดการณ์ว่า "ถ้าชนะ" ยังไม่แน่ว่าจะได้ลงเล่นจริง */
  projected: boolean;
}

export interface PairPath {
  pairUid: string;
  label: string;
  /** แมตช์ที่แข่งจบไปแล้ว เรียงตามลำดับ */
  played: { match: MatchView; won: boolean }[];
  /** แมตช์ที่รู้แน่แล้วว่าต้องลงเล่น (ยังไม่แข่ง) */
  upcoming: MatchView[];
  /** ถ้าชนะไปเรื่อย ๆ จะได้ไปเล่นแมตช์เหล่านี้ต่อ */
  projected: MatchView[];
  /** เหลืออีกกี่แมตช์ถึงจะจบเส้นทาง (นับทั้งที่รู้แน่และที่คาดการณ์) */
  remainingIfWinning: number;
  /** แมตช์ชิงชนะเลิศที่ปลายทาง ถ้าไล่ถึง */
  finalMatch: MatchView | null;
  /** ต้องชนะอีกกี่แมตช์ถึงได้แชมป์ — null = ยังคำนวณไม่ได้ */
  winsToTitle: number | null;
  /** จบเส้นทางแล้ว (ตกรอบ หรือแข่งครบแล้ว) */
  finished: boolean;
  /** ยังไม่มีแมตช์เลย — ยังไม่ได้จับสลาก/ยังไม่ได้ส่งซอง ต่างจาก "จบเส้นทางแล้ว" */
  notStarted: boolean;
  /** ชนะแมตช์ชิงชนะเลิศแล้ว */
  champion: boolean;
  /** ข้อความอธิบายกรณีที่คาดการณ์ต่อไม่ได้ */
  note: string | null;
}

const FINAL_LABEL = "ชิงชนะเลิศ";

function isPairOnSide(match: MatchView, pairUid: string): "A" | "B" | null {
  if (match.sideA.pair?.pairUid === pairUid) return "A";
  if (match.sideB.pair?.pairUid === pairUid) return "B";
  return null;
}

/**
 * หาแมตช์ที่รับ "ผู้ชนะ" ของแมตช์นี้ไปเล่นต่อ
 * (ไม่ตาม LOSER: เพราะเป็นเส้นทางของผู้แพ้ ไม่ใช่เส้นทางถ้าชนะ)
 */
function nextIfWin(matches: MatchView[], match: MatchView): MatchView | null {
  const token = `WINNER:${match.sourceMatchCode}`;
  return matches.find((m) => m.sideASource === token || m.sideBSource === token) ?? null;
}

export function buildPairPath(matches: MatchView[], pairUid: string, label: string): PairPath {
  const mine = matches
    .filter((m) => isPairOnSide(m, pairUid) !== null)
    .sort((a, b) => a.matchNo - b.matchNo);

  const played = mine
    .filter((m) => m.decided)
    .map((m) => ({ match: m, won: m.winnerPairUid === pairUid }));
  const upcoming = mine.filter((m) => !m.decided && m.status !== "CANCELLED");

  // ไล่เส้นทางต่อจากแมตช์สุดท้ายที่รู้แน่ว่าได้ลงเล่น
  const anchor = upcoming.at(-1) ?? played.at(-1)?.match ?? null;
  const projected: MatchView[] = [];
  if (anchor) {
    // ถ้าแมตช์สุดท้ายแข่งจบไปแล้วและแพ้ ก็ไม่มีเส้นทางต่อ
    const anchorLost = anchor.decided && anchor.winnerPairUid !== pairUid;
    if (!anchorLost) {
      let cursor: MatchView | null = anchor;
      const guard = new Set<string>();
      while (cursor) {
        const next: MatchView | null = nextIfWin(matches, cursor);
        if (!next || guard.has(next.matchUid)) break;
        guard.add(next.matchUid);
        // ถ้าเอนจินคลี่ให้แล้วว่าคู่นี้อยู่ในแมตช์นั้นจริง แปลว่าไม่ใช่การคาดการณ์
        if (!upcoming.some((u) => u.matchUid === next.matchUid)) projected.push(next);
        cursor = next;
      }
    }
  }

  const chain = [...upcoming, ...projected];
  const finalMatch = chain.find((m) => m.roundLabel === FINAL_LABEL) ?? null;

  const championMatch = played.find((p) => p.match.roundLabel === FINAL_LABEL && p.won);
  const champion = Boolean(championMatch);

  const lastPlayed = played.at(-1);
  // ยังไม่มีแมตช์เลย = ยังไม่ถูกจัดเข้าสาย ไม่ใช่ "จบเส้นทาง" — ต้องแยกกันให้ชัด
  const notStarted = mine.length === 0;
  // ตกรอบ/แข่งครบ เมื่อเคยลงเล่นแล้วแต่ไม่มีแมตช์ไหนรออยู่อีก
  const finished = !notStarted && chain.length === 0;

  let winsToTitle: number | null = null;
  if (finalMatch) {
    const idx = chain.findIndex((m) => m.matchUid === finalMatch.matchUid);
    winsToTitle = idx + 1;
  }

  let note: string | null = null;
  if (notStarted) {
    note = "ยังไม่ถูกจัดเข้าสาย — รอผลจับสลาก (มือทั่วไปรอส่งซองรายชื่อ)";
  } else if (!finished && !finalMatch) {
    const inGroup = chain.some((m) => m.phase === "GROUP_STAGE");
    const inTeamTie = chain.some((m) => m.tieId);
    if (inGroup) {
      note = "จบรอบแบ่งกลุ่มแล้วจะรู้ว่าเข้าสายบนหรือสายล่าง ระบบจึงยังไม่คาดการณ์ต่อให้";
    } else if (inTeamTie) {
      note = "มือทั่วไปแข่งเป็นคู่สี — แมตช์ถัดไปขึ้นกับผลของทั้งสีและซองรายชื่อที่ส่งในรอบนั้น";
    }
  }
  if (finished && champion) {
    note = "ชนะเลิศแล้ว";
  } else if (finished && lastPlayed && !lastPlayed.won) {
    note = `จบเส้นทางที่ ${lastPlayed.match.roundLabel}`;
  }

  return {
    pairUid,
    label,
    played,
    upcoming,
    projected,
    remainingIfWinning: chain.length,
    finalMatch,
    winsToTitle,
    finished,
    notStarted,
    champion,
    note,
  };
}
