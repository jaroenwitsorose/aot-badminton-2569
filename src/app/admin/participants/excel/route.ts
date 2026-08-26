/**
 * ดาวน์โหลดไฟล์ Excel สำหรับกรอกข้อมูล
 *
 * สร้างสด ๆ ทุกครั้งเพื่อให้ไฟล์สะท้อนสถานะปัจจุบันเสมอ
 * (คู่ที่เพิ่งล็อกประเภทจะโผล่ในรายการเลือกของชีตจับสลากทันที)
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { ROLE_RANK } from "@/lib/roles";
import { buildDataEntryWorkbook } from "@/lib/excel/export";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const session = await getSession();
  if (!session || ROLE_RANK[session.role] < ROLE_RANK.ADMIN) {
    return new NextResponse("ต้องเข้าสู่ระบบด้วยสิทธิ์ผู้ดูแล", { status: 403 });
  }

  const buffer = await buildDataEntryWorkbook();
  const stamp = new Date().toISOString().slice(0, 10);

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="AOT-Badminton-2569-${stamp}.xlsx"; filename*=UTF-8''${encodeURIComponent(`กรอกข้อมูลแบดมินตัน-2569-${stamp}.xlsx`)}`,
      "Cache-Control": "no-store",
    },
  });
}
