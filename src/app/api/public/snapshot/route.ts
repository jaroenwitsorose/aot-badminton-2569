/**
 * ข้อมูลทั้งหมดของการแข่งขันในครั้งเดียว — หน้าสาธารณะเรียกซ้ำทุก ~3 วินาที
 *
 * อ่านอย่างเดียว ไม่ต้องล็อกอิน และไม่มีข้อมูลส่วนบุคคลที่ไม่จำเป็น
 * (รหัสพนักงานถูกตัดออกจาก payload สาธารณะ)
 */

import { NextResponse } from "next/server";
import { getTournamentSnapshot } from "@/lib/tournament";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const snapshot = await getTournamentSnapshot();

    // ตัดข้อมูลที่ไม่ควรเปิดสาธารณะออก (รหัสพนักงาน)
    const publicSnapshot = {
      ...snapshot,
      pairs: snapshot.pairs.map(stripPair),
      matches: snapshot.matches.map((m) => ({
        ...m,
        sideA: stripSide(m.sideA),
        sideB: stripSide(m.sideB),
      })),
    };

    return NextResponse.json(publicSnapshot, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "เกิดข้อผิดพลาด";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function stripPair<T extends { players: { employeeId: string | null }[] }>(pair: T): T {
  return { ...pair, players: pair.players.map((p) => ({ ...p, employeeId: null })) };
}

function stripSide<T extends { pair: { players: { employeeId: string | null }[] } | null }>(side: T): T {
  if (!side.pair) return side;
  return { ...side, pair: stripPair(side.pair) };
}
