"use server";

/**
 * นำเข้าไฟล์ Excel ที่กรอกแล้ว
 *
 * แยกออกจาก actions.ts เพราะคืนค่าเป็นรายงานผลรายชีต ไม่ใช่ ActionResult ธรรมดา
 * ผู้ใช้ต้องเห็นว่า "แถวไหนผิดเพราะอะไร" ไม่ใช่แค่ "นำเข้าไม่สำเร็จ"
 */

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { AuthError, requireRole } from "@/lib/auth";
import { importDataEntryWorkbook, type ImportReport } from "@/lib/excel/import";

export type ImportResult = { ok: false; error: string } | { ok: true; report: ImportReport };

const MAX_BYTES = 5 * 1024 * 1024;

export async function importExcelAction(formData: FormData): Promise<ImportResult> {
  try {
    const session = await requireRole("ADMIN");

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return { ok: false, error: "ยังไม่ได้เลือกไฟล์" };
    if (!file.name.toLowerCase().endsWith(".xlsx")) {
      return { ok: false, error: "ต้องเป็นไฟล์ .xlsx เท่านั้น (ถ้าเป็น .xls ให้เปิดใน Excel แล้ว Save As เป็น .xlsx)" };
    }
    if (file.size > MAX_BYTES) return { ok: false, error: "ไฟล์ใหญ่เกิน 5 MB" };

    const h = await headers();
    const forwarded = h.get("x-forwarded-for");
    const report = await importDataEntryWorkbook(await file.arrayBuffer(), {
      actorId: session.adminId,
      ip: forwarded ? forwarded.split(",")[0].trim() : h.get("x-real-ip"),
      userAgent: h.get("user-agent"),
    });

    if (report.ok && report.totalApplied > 0) {
      for (const p of ["/", "/schedule", "/results", "/brackets", "/scores", "/teams", "/pairs", "/admin"]) {
        revalidatePath(p);
      }
      for (const p of ["/admin/participants", "/admin/draw", "/admin/lineups"]) revalidatePath(p);
    }

    return { ok: true, report };
  } catch (error) {
    if (error instanceof AuthError) return { ok: false, error: error.message };
    console.error(error);
    // ไฟล์ที่ไม่ใช่ xlsx จริง (เปลี่ยนนามสกุลมา) จะพังตอน load — บอกให้เข้าใจแทนที่จะโชว์ stack
    const message = error instanceof Error ? error.message : "อ่านไฟล์ไม่สำเร็จ";
    return { ok: false, error: `อ่านไฟล์ไม่สำเร็จ — ${message}` };
  }
}
