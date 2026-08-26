"use client";

/**
 * แผงนำเข้า/ส่งออก Excel
 *
 * ตั้งใจให้ลำดับการใช้งานเป็นเส้นเดียว: ดาวน์โหลด → กรอก → อัปโหลด
 * และเมื่อไฟล์มีข้อผิดพลาด ต้องบอกให้ครบทุกแถวในครั้งเดียว ไม่ใช่บอกทีละข้อ
 * เพราะผู้กรอกมักแก้ไฟล์นอกระบบแล้วอัปโหลดใหม่ทีเดียว
 */

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { importExcelAction, type ImportResult } from "./excel-actions";

export function ExcelPanel() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [pending, start] = useTransition();

  function upload() {
    const file = inputRef.current?.files?.[0];
    if (!file) {
      setResult({ ok: false, error: "ยังไม่ได้เลือกไฟล์" });
      return;
    }
    const formData = new FormData();
    formData.append("file", file);
    start(async () => {
      const res = await importExcelAction(formData);
      setResult(res);
      if (res.ok && res.report.ok && res.report.totalApplied > 0) router.refresh();
    });
  }

  return (
    <section className="panel flex flex-col gap-3 p-3 text-[13px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="m-0 text-sm font-semibold">กรอกข้อมูลด้วยไฟล์ Excel</h3>
          <p className="m-0 text-[12px]" style={{ color: "var(--muted)" }}>
            ไฟล์ที่ดาวน์โหลดมีข้อมูลปัจจุบันอยู่แล้ว กรอกเฉพาะช่องสีเหลือง แล้วอัปโหลดกลับ ·
            ครอบคลุมรายชื่อ ประเภทคู่ ผลจับสลาก และซองมือทั่วไป
          </p>
        </div>
        <a className="button navy" href="/admin/participants/excel" download style={{ padding: "9px 14px", fontSize: 13 }}>
          ดาวน์โหลดไฟล์กรอกข้อมูล
        </a>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t pt-3" style={{ borderColor: "var(--line)" }}>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={(e) => {
            setFileName(e.target.files?.[0]?.name ?? "");
            setResult(null);
          }}
          style={{ width: "auto" }}
        />
        <button
          className="button ghost"
          type="button"
          onClick={upload}
          disabled={pending || !fileName}
          style={{ padding: "9px 14px", fontSize: 13, cursor: pending ? "wait" : "pointer" }}
        >
          {pending ? "กำลังตรวจและนำเข้า…" : "อัปโหลดไฟล์ที่กรอกแล้ว"}
        </button>
        <span style={{ color: "var(--muted)" }}>
          ระบบจะตรวจทั้งไฟล์ก่อน ถ้ามีข้อผิดพลาดจะไม่บันทึกอะไรเลย
        </span>
      </div>

      {result ? <ReportView result={result} /> : null}
    </section>
  );
}

function ReportView({ result }: { result: ImportResult }) {
  if (!result.ok) {
    return (
      <p className="notice error" style={{ margin: 0 }}>
        {result.error}
      </p>
    );
  }

  const { report } = result;

  if (!report.ok) {
    return (
      <div className="flex flex-col gap-2">
        <p className="notice error" style={{ margin: 0 }}>
          พบข้อผิดพลาด {report.issues.length} รายการ — <b>ยังไม่บันทึกอะไรลงระบบ</b> แก้ในไฟล์แล้วอัปโหลดใหม่
        </p>
        <div style={{ maxHeight: 320, overflowY: "auto", border: "1px solid var(--line)", borderRadius: 12 }}>
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 140 }}>ชีต</th>
                <th style={{ width: 70 }}>แถว</th>
                <th>สิ่งที่ต้องแก้</th>
              </tr>
            </thead>
            <tbody>
              {report.issues.map((issue, i) => (
                <tr key={i}>
                  <td>{issue.sheet}</td>
                  <td className="tabular">{issue.row ?? "—"}</td>
                  <td>{issue.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const notes = report.summaries.flatMap((s) => s.notes.map((n) => `${s.sheet}: ${n}`));

  return (
    <div className="flex flex-col gap-2">
      <p className={`notice ${report.totalApplied > 0 ? "ok" : ""}`} style={{ margin: 0 }}>
        {report.totalApplied > 0
          ? `นำเข้าสำเร็จ — บันทึกการเปลี่ยนแปลง ${report.totalApplied} รายการ`
          : "ไฟล์ถูกต้อง แต่ไม่มีข้อมูลใหม่ที่ต่างจากในระบบ จึงไม่มีอะไรถูกบันทึก"}
      </p>
      <table className="data-table">
        <thead>
          <tr>
            <th>ชีต</th>
            <th style={{ width: 110 }}>บันทึกแล้ว</th>
            <th style={{ width: 110 }}>เหมือนเดิม</th>
          </tr>
        </thead>
        <tbody>
          {report.summaries.map((s) => (
            <tr key={s.sheet}>
              <td>
                {s.sheet}
                {s.present ? "" : " (ไม่มีในไฟล์)"}
              </td>
              <td className="tabular">{s.applied}</td>
              <td className="tabular">{s.unchanged}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {notes.length > 0 ? (
        <div className="notice" style={{ margin: 0 }}>
          <b>ข้ามบางรายการ</b>
          <ul style={{ margin: "6px 0 0", paddingInlineStart: 18 }}>
            {notes.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
