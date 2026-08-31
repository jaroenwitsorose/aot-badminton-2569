/**
 * ข้อมูลทั้งหมดของการแข่งขันในครั้งเดียว — หน้าสาธารณะเรียกซ้ำทุก ~3 วินาที
 *
 * อ่านอย่างเดียว ไม่ต้องล็อกอิน และไม่มีข้อมูลส่วนบุคคลที่ไม่จำเป็น
 * (รหัสพนักงานถูกตัดออกจาก payload สาธารณะ)
 *
 * รายชื่อนักกีฬาอยู่ใน snapshot.pairs ที่เดียว — ฝั่งของแมตช์ไม่ฝัง players ซ้ำ (ดู MatchSidePair)
 *
 * ประหยัดสามชั้น:
 *   1. อ่านจากตัวเก็บพัก 3 วินาที — ผู้ชมพร้อมกันกี่คนก็ยิงเข้าฐานข้อมูลครั้งเดียว
 *   2. แปลงเป็นข้อความและคิดป้ายกำกับครั้งเดียวต่อข้อมูลหนึ่งชุด ไม่ใช่ทุกคำขอ
 *   3. ตอบ 304 เมื่อข้อมูลไม่เปลี่ยน — ช่วงที่ยังไม่มีใครกรอกผลจะไม่ส่งอะไรเลย
 */

import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { getCachedTournamentSnapshot, type TournamentSnapshot } from "@/lib/tournament";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * เก็บผลการแปลงข้อความไว้กับข้อมูลชุดล่าสุด
 *
 * ตัวเก็บพักคืนวัตถุก้อนเดิมตลอด 3 วินาที จึงเทียบด้วยตัวชี้ได้ตรง ๆ
 * ถ้าไม่ทำแบบนี้ ทุกคำขอจะต้องแปลง snapshot เป็นข้อความสองรอบ (ราว 230 KB)
 * แล้วคิดค่าแฮชใหม่ทั้งก้อน — ผู้ชม 100 คนก็คือทำงานนี้ซ้ำ 100 ครั้งต่อ 3 วินาที
 * ทั้งที่ผลออกมาเหมือนกันทุกครั้ง
 */
let rendered: { snapshot: TournamentSnapshot; body: string; etag: string } | null = null;

function renderOnce(snapshot: TournamentSnapshot) {
  if (rendered?.snapshot === snapshot) return rendered;

  // generatedAt เปลี่ยนทุกครั้งที่โหลดใหม่ ถ้าเอามาคิดด้วยป้ายกำกับจะไม่มีวันตรงกัน
  // จึงคิดจาก "เนื้อข้อมูลจริง" เท่านั้น
  const { generatedAt: _generatedAt, ...comparable } = snapshot;
  rendered = {
    snapshot,
    body: JSON.stringify(snapshot),
    etag: `W/"${createHash("sha1").update(JSON.stringify(comparable)).digest("base64url")}"`,
  };
  return rendered;
}

export async function GET(request: Request) {
  try {
    // ไม่ต้องกรองอะไรออกแล้ว — เดิมต้องตัดรหัสพนักงานทิ้งก่อนส่งออกหน้าสาธารณะ
    // แต่ระบบเลิกเก็บรหัสพนักงานไปแล้ว snapshot จึงไม่มีข้อมูลส่วนบุคคลตั้งแต่ต้นทาง
    const { body, etag } = renderOnce(await getCachedTournamentSnapshot());

    const headers = {
      "Content-Type": "application/json; charset=utf-8",
      ETag: etag,
      // ต้องถามเซิร์ฟเวอร์ทุกครั้ง แต่ยอมให้เก็บไว้เทียบป้ายกำกับได้
      "Cache-Control": "no-cache, must-revalidate",
    };

    if (request.headers.get("if-none-match") === etag) {
      return new NextResponse(null, { status: 304, headers });
    }
    return new NextResponse(body, { status: 200, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "เกิดข้อผิดพลาด";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
