/**
 * ป้ายบอกว่า "แมตช์นี้ยังมีผล" ในคู่สีรอบ Page Playoff ที่รู้ผู้ชนะไปแล้ว
 *
 * รอบ Page Playoff แข่ง 3 คอร์ตพร้อมกัน แต่ละคอร์ตจบไม่พร้อมกัน จึงมีช่วงที่
 * คู่สีตัดสินไปแล้ว (ฝ่ายหนึ่งชนะครบ 2 คู่) ขณะที่อีกคอร์ตยังเล่นอยู่
 * ถ้าไม่บอก ผู้เล่นในคอร์ตนั้นจะคิดว่าแข่งไปก็ไม่มีความหมาย
 *
 * ในกรณีนี้ฝ่ายที่ตามอยู่จะมี 0 ชัยชนะเสมอ (3 แมตช์ · อีกฝ่ายได้ไปแล้ว 2)
 * แมตช์ที่เหลือจึงเป็นตัวชี้ว่าจะได้โบนัสปลอบใจหรือไม่
 */

import { PLAYOFF_CONSOLATION_POINTS } from "@/lib/engine/scoring-constants";
import type { MatchView, TieView } from "@/lib/tournament";

export function TieBonusNotice({ tie, match }: { tie: TieView; match: MatchView }) {
  if (tie.phase !== "PAGE_PLAYOFF") return null;
  if (match.decided || match.status === "CANCELLED") return null;

  const clinched = Math.max(tie.matchWinsA, tie.matchWinsB) >= tie.requiredMatchWins;
  if (!clinched) return null;

  const aLeads = tie.matchWinsA > tie.matchWinsB;
  const leading = (aLeads ? tie.teamANameTh : tie.teamBNameTh) ?? "ฝ่ายที่นำอยู่";
  const trailing = (aLeads ? tie.teamBNameTh : tie.teamANameTh) ?? "ฝ่ายที่ตามอยู่";

  return (
    <div className="notice warn" style={{ marginTop: 0 }}>
      <b>แมตช์นี้ยังมีผลกับคะแนนสี</b>
      <br />
      คู่สีนี้ตัดสินไปแล้วว่า <b>{leading}</b> ชนะ แต่แมตช์นี้ยังชี้ขาดโบนัสปลอบใจ{" "}
      <b>{PLAYOFF_CONSOLATION_POINTS} คะแนนสี</b> —{" "}
      <b>{trailing}</b> ชนะแมตช์นี้จะได้โบนัสไป ส่วน <b>{leading}</b> ชนะจะกันโบนัสไว้ไม่ให้เสียคะแนน
    </div>
  );
}
