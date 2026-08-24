"use client";

import { useActionState } from "react";
import { saveTournamentAction, type ActionResult } from "../actions";

export function SettingsForm({
  venue,
  venueConfirmed,
  startDate,
  endDate,
  publicRefreshMs,
  days,
}: {
  venue: string;
  venueConfirmed: boolean;
  startDate: string;
  endDate: string;
  publicRefreshMs: number;
  days: { dayNo: number; labelTemp: string; actualDate: string }[];
}) {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    saveTournamentAction,
    null,
  );

  return (
    <form action={formAction} className="panel flex flex-col gap-4 p-4">
      <div>
        <h2 className="m-0 text-base font-semibold">ข้อมูลการแข่งขัน</h2>
        <p className="m-0 text-[13px]" style={{ color: "var(--muted)" }}>
          เว้นว่างได้ถ้ายังไม่กำหนด — หน้าเว็บจะใช้ชื่อวันชั่วคราวไปก่อนโดยไม่เดาวันเอง
        </p>
      </div>

      <label className="flex flex-col gap-1 text-[13px]">
        สถานที่แข่งขัน
        <input name="venue" type="text" defaultValue={venue} placeholder="เช่น สทย. หรือ สโมสรท่าอากาศยาน" />
      </label>

      <label className="flex items-start gap-2 text-[13px]">
        <input
          name="venueConfirmed"
          type="checkbox"
          defaultChecked={venueConfirmed}
          style={{ width: "auto", marginTop: 4 }}
        />
        <span>
          ยืนยันสถานที่แล้ว
          <span className="block text-[12px]" style={{ color: "var(--muted)" }}>
            ค่าจาก Excel เป็นตัวเลือกที่ยังไม่ตัดสิน (&quot;สทย. หรือ สโมสรท่าอากาศยาน&quot;)
            หน้าสาธารณะจะยังขึ้นว่า &quot;สถานที่ยังไม่ยืนยัน&quot; จนกว่าจะติ๊กช่องนี้
          </span>
        </span>
      </label>

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
        <label className="flex flex-col gap-1 text-[13px]">
          วันเริ่มการแข่งขัน
          <input name="startDate" type="date" defaultValue={startDate} />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          วันสิ้นสุดการแข่งขัน
          <input name="endDate" type="date" defaultValue={endDate} />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          รอบรีเฟรชหน้าสาธารณะ (มิลลิวินาที)
          <input name="publicRefreshMs" type="number" min={1000} max={60000} step={500} defaultValue={publicRefreshMs} />
        </label>
      </div>

      <fieldset className="m-0 rounded-lg border p-3" style={{ borderColor: "var(--line)" }}>
        <legend className="px-1 text-[13px]" style={{ color: "var(--muted)" }}>
          วันจริงของแต่ละวันแข่ง
        </legend>
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          {days.map((d) => (
            <label key={d.dayNo} className="flex flex-col gap-1 text-[13px]">
              {d.labelTemp}
              <input name={`day${d.dayNo}`} type="date" defaultValue={d.actualDate} />
            </label>
          ))}
        </div>
      </fieldset>

      {state ? (
        <p className="m-0 text-[13px]" style={{ color: state.ok ? "#15803d" : "#b91c1c" }}>
          {state.ok ? state.message : state.error}
        </p>
      ) : null}

      <div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg px-4 py-2 font-medium"
          style={{ background: "var(--ink)", color: "#fff", border: "none", cursor: "pointer" }}
        >
          {pending ? "กำลังบันทึก..." : "บันทึก"}
        </button>
      </div>
    </form>
  );
}
