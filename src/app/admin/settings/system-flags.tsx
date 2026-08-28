"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resetAllResultsAction, setSystemFlagsAction, simulateAllResultsAction } from "../actions";

export function SystemFlags({
  simulationEnabled,
  publicAdminTestMode,
}: {
  simulationEnabled: boolean;
  publicAdminTestMode: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [sim, setSim] = useState(simulationEnabled);
  const [testMode, setTestMode] = useState(publicAdminTestMode);
  const [confirmText, setConfirmText] = useState("");
  const [scope, setScope] = useState<"RESULTS" | "ALL">("ALL");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) => {
    startTransition(async () => {
      const res = await fn();
      setMessage(res.ok ? { ok: true, text: res.message ?? "บันทึกแล้ว" } : { ok: false, text: res.error ?? "ผิดพลาด" });
      if (res.ok) router.refresh();
    });
  };

  return (
    <div className="admin-card">
      <h2 style={{ fontSize: 17, marginTop: 0 }}>โหมดระบบและการซ้อม</h2>
      <p style={{ color: "var(--muted)", fontSize: 13, marginTop: 0 }}>
        ทั้งสองสวิตช์นี้ต้องเป็น “ปิด” ก่อนเปิดใช้งานจริง
      </p>

      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 14 }}>
        <input
          type="checkbox"
          checked={sim}
          disabled={pending}
          style={{ marginTop: 4 }}
          onChange={(e) => {
            setSim(e.target.checked);
            run(() => setSystemFlagsAction({ simulationEnabled: e.target.checked, publicAdminTestMode: testMode }));
          }}
        />
        <span>
          <strong>โหมดจำลอง (simulation)</strong>
          <span style={{ display: "block", color: "var(--muted)", fontSize: 12 }}>
            เปิดเพื่อซ้อมระบบ · จำเป็นต้องเปิดก่อนจึงจะสุ่มผลหรือล้างผลทั้งหมดได้
          </span>
        </span>
      </label>

      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 18 }}>
        <input
          type="checkbox"
          checked={testMode}
          disabled={pending}
          style={{ marginTop: 4 }}
          onChange={(e) => {
            setTestMode(e.target.checked);
            run(() => setSystemFlagsAction({ simulationEnabled: sim, publicAdminTestMode: e.target.checked }));
          }}
        />
        <span>
          <strong>Public Admin Test Mode</strong>
          <span style={{ display: "block", color: "var(--muted)", fontSize: 12 }}>
            ถ้าเปิดไว้จะมีแถบเตือนสีแดงทุกหน้าของผู้ดูแล — ห้ามเปิดตอนใช้งานจริง
          </span>
        </span>
      </label>

      <div className="notice" style={{ marginTop: 0 }}>
        <strong>ซ้อมระบบครบ 158 แมตช์</strong>
        <p style={{ margin: "6px 0 10px", fontSize: 13 }}>
          ระบบจะจับสลากและส่งซองรายชื่อให้อัตโนมัติเฉพาะช่องที่ยังว่าง แล้วสุ่มสกอร์ที่ถูกกติกาจนจบทุกแมตช์
          เพื่อตรวจว่าสายคลี่ครบและคะแนนสีออกครบ (คะแนนหลัก 37 + โบนัสปลอบใจตามผล)
        </p>
        <button
          type="button"
          className="button navy"
          disabled={!sim || pending}
          onClick={() => run(() => simulateAllResultsAction())}
        >
          {pending ? "กำลังจำลอง..." : "จำลองผลครบ 158 แมตช์"}
        </button>
        {!sim ? (
          <span style={{ marginLeft: 10, fontSize: 12, color: "var(--muted)" }}>ต้องเปิดโหมดจำลองก่อน</span>
        ) : null}
      </div>

      <div className="danger-zone" style={{ marginTop: 16 }}>
        <h3 style={{ margin: 0, fontSize: 15, color: "#b9232e" }}>คืนค่าก่อนแข่งจริง</h3>
        <p style={{ margin: "6px 0 12px", fontSize: 13, color: "var(--muted)" }}>
          คืนทุกแมตช์กลับเป็น “รอแข่งขัน” และลบสกอร์ทั้งหมด — ต้องทำหลังซ้อมระบบเสร็จเสมอ
        </p>

        <div style={{ display: "grid", gap: 10, maxWidth: 460 }}>
          <label className="field">
            ขอบเขตการล้าง
            <select value={scope} onChange={(e) => setScope(e.target.value as "RESULTS" | "ALL")} disabled={!sim || pending}>
              <option value="ALL">ล้างทั้งหมด — ผล + ผลจับสลาก + ซองรายชื่อ</option>
              <option value="RESULTS">ล้างเฉพาะผลการแข่งขัน (เก็บผลจับสลากไว้)</option>
            </select>
          </label>

          <label className="field">
            พิมพ์ข้อความยืนยัน
            <input
              type="text"
              value={confirmText}
              disabled={!sim || pending}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="ล้างผลทั้งหมด"
            />
          </label>

          <div>
            <button
              type="button"
              className="button danger"
              disabled={!sim || pending || confirmText !== "ล้างผลทั้งหมด"}
              onClick={() =>
                run(async () => {
                  const res = await resetAllResultsAction({ confirmText, scope });
                  if (res.ok) setConfirmText("");
                  return res;
                })
              }
            >
              ล้างและคืนค่า
            </button>
          </div>
        </div>
      </div>

      {message ? (
        <div className={`notice ${message.ok ? "ok" : "error"}`} style={{ marginBottom: 0 }}>
          {message.text}
        </div>
      ) : null}
    </div>
  );
}
