"use client";

/**
 * นำเข้าตารางแข่งจากไฟล์ตั้งต้น
 *
 * ตารางแข่งอยู่ในฐานข้อมูล ไม่ได้อยู่ในโค้ด การอัปเดตเว็บจึงไม่ทำให้ตารางเปลี่ยนเอง
 * แผงนี้ให้ผู้ดูแลนำเข้าได้เองโดยไม่ต้องใช้เครื่องมือบรรทัดคำสั่งหรือรหัสฐานข้อมูล
 *
 * ออกแบบให้ "ดูก่อน แล้วค่อยยืนยัน" เสมอ เพราะการเขียนทับตารางผิดตัวคือความเสียหาย
 * ที่กู้คืนยากที่สุดของระบบนี้
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  importScheduleAction,
  previewScheduleImportAction,
  type ActionResult,
} from "../actions";
import type { SchedulePreview } from "@/lib/schedule-import";

export function ScheduleImport() {
  const router = useRouter();
  const [preview, setPreview] = useState<SchedulePreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [confirmText, setConfirmText] = useState("");
  const [result, setResult] = useState<ActionResult | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [pending, start] = useTransition();

  function check() {
    setResult(null);
    start(async () => {
      const res = await previewScheduleImportAction();
      if (res.ok) {
        setPreview(res.preview);
        setPreviewError(null);
      } else {
        setPreview(null);
        setPreviewError(res.error);
      }
    });
  }

  function run() {
    start(async () => {
      const res = await importScheduleAction({ confirmText });
      setResult(res);
      if (res.ok) {
        setConfirmText("");
        setPreview(null);
        router.refresh();
      }
    });
  }

  const blocked = Boolean(preview && preview.blockers.length > 0);
  const visibleMoves = preview ? (showAll ? preview.moves : preview.moves.slice(0, 12)) : [];

  return (
    <section className="panel p-4 text-[13px]">
      <h2 className="m-0 text-sm font-semibold">นำเข้าตารางแข่งจากไฟล์ตั้งต้น</h2>
      <p className="mt-1 mb-3 text-[12px]" style={{ color: "var(--muted)" }}>
        ใช้เมื่อมีการแก้ตารางแข่ง (เวลา · คอร์ต · ลำดับแมตช์) หรือกติกาคะแนน แล้วต้องการ
        ให้เว็บใช้ตารางชุดใหม่ · <b>ไม่แตะ</b>รายชื่อนักกีฬา ประเภทคู่ ผลจับสลาก ซองรายชื่อ
        และผลการแข่งขันที่กรอกไปแล้ว
      </p>

      <button
        type="button"
        className="button ghost"
        onClick={check}
        disabled={pending}
        style={{ padding: "9px 14px", fontSize: 13 }}
      >
        {pending && !preview ? "กำลังตรวจ…" : "ตรวจดูก่อนว่าจะเปลี่ยนอะไรบ้าง"}
      </button>

      {previewError ? (
        <p className="notice error" style={{ marginBottom: 0 }}>
          {previewError}
        </p>
      ) : null}

      {preview ? (
        <div className="mt-3 flex flex-col gap-3">
          {preview.blockers.length > 0 ? (
            <div className="notice error" style={{ margin: 0 }}>
              <b>นำเข้าไม่ได้</b>
              <ul style={{ margin: "6px 0 0", paddingInlineStart: 18 }}>
                {preview.blockers.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>
          ) : preview.upToDate ? (
            <p className="notice ok" style={{ margin: 0 }}>
              ตารางในระบบตรงกับไฟล์ตั้งต้นอยู่แล้ว ไม่มีอะไรต้องนำเข้า
            </p>
          ) : (
            <>
              <div className="notice warn" style={{ margin: 0 }}>
                <b>จะเปลี่ยนแปลง</b>
                <ul style={{ margin: "6px 0 0", paddingInlineStart: 18 }}>
                  <li>
                    ย้ายเวลา/คอร์ต/ลำดับ <b>{preview.moves.length}</b> แมตช์ (จากทั้งหมด{" "}
                    {preview.totalMatches})
                  </li>
                  {preview.tiesChanged > 0 ? <li>ปรับเวลาคู่สีมือทั่วไป {preview.tiesChanged} ชุด</li> : null}
                  {preview.rulesAdded.map((r) => (
                    <li key={r.result}>
                      เพิ่มกติกาคะแนน: {r.result} ({r.points} คะแนน)
                    </li>
                  ))}
                  {preview.rulesChanged.map((r) => (
                    <li key={r.result}>
                      แก้คะแนน: {r.result} {r.fromPoints} → {r.toPoints}
                    </li>
                  ))}
                  {preview.movesWithResult > 0 ? (
                    <li style={{ fontWeight: 700 }}>
                      ในจำนวนนี้มี {preview.movesWithResult} แมตช์ที่กรอกผลไปแล้ว — ผลจะยังอยู่ครบ
                      เปลี่ยนแค่เวลาและคอร์ตที่แสดง
                    </li>
                  ) : null}
                </ul>
              </div>

              <div style={{ maxHeight: 300, overflowY: "auto", border: "1px solid var(--line)", borderRadius: 12 }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: 90 }}>แมตช์</th>
                      <th>รายการ</th>
                      <th>เดิม</th>
                      <th>ใหม่</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleMoves.map((m) => (
                      <tr key={m.matchUid}>
                        <td className="tabular">
                          #{m.fromNo} → #{m.toNo}
                          {m.hasResult ? (
                            <>
                              <br />
                              <span style={{ color: "#a16207", fontSize: 11 }}>มีผลแล้ว</span>
                            </>
                          ) : null}
                        </td>
                        <td>{m.label}</td>
                        <td style={{ color: "var(--muted)" }}>{m.from}</td>
                        <td>
                          <b>{m.to}</b>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.moves.length > visibleMoves.length ? (
                <button
                  type="button"
                  onClick={() => setShowAll(true)}
                  className="rounded-lg border px-2.5 py-1 text-[12px]"
                  style={{ borderColor: "var(--line)", background: "transparent", cursor: "pointer", alignSelf: "flex-start" }}
                >
                  ดูทั้งหมด {preview.moves.length} รายการ
                </button>
              ) : null}

              <div className="flex flex-wrap items-center gap-2 border-t pt-3" style={{ borderColor: "var(--line)" }}>
                <label className="flex items-center gap-2">
                  พิมพ์ <b>นำเข้าตาราง</b> เพื่อยืนยัน
                  <input
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="นำเข้าตาราง"
                    style={{ width: 160 }}
                  />
                </label>
                <button
                  type="button"
                  className="button danger"
                  onClick={run}
                  disabled={pending || confirmText.trim() !== "นำเข้าตาราง" || blocked}
                  style={{ padding: "9px 14px", fontSize: 13 }}
                >
                  {pending ? "กำลังนำเข้า…" : "นำเข้าตารางใหม่"}
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}

      {result ? (
        <p className={`notice ${result.ok ? "ok" : "error"}`} style={{ marginBottom: 0 }}>
          {result.ok ? (result.message ?? "นำเข้าแล้ว") : result.error}
        </p>
      ) : null}
    </section>
  );
}
