"use client";

import { useActionState } from "react";
import { loginAction, type ActionResult } from "../actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(loginAction, null);

  return (
    <div className="mx-auto w-full max-w-[420px] py-6">
      <form action={formAction} className="panel flex flex-col gap-3 p-5">
        <h2 className="m-0 text-lg font-semibold">เข้าสู่ระบบผู้ดูแล</h2>
        <p className="m-0 text-[13px]" style={{ color: "var(--muted)" }}>
          หน้าสาธารณะดูได้โดยไม่ต้องเข้าสู่ระบบ ส่วนนี้สำหรับผู้กรอกผลและผู้ดูแลเท่านั้น
        </p>

        <label className="flex flex-col gap-1 text-[13px]">
          ชื่อผู้ใช้
          <input name="username" type="text" autoComplete="username" required autoFocus />
        </label>

        <label className="flex flex-col gap-1 text-[13px]">
          รหัสผ่าน
          <input name="password" type="password" autoComplete="current-password" required />
        </label>

        {state && !state.ok ? (
          <p className="m-0 text-[13px]" style={{ color: "#b91c1c" }}>
            {state.error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="rounded-lg px-4 py-2 font-medium"
          style={{
            background: "var(--ink)",
            color: "#fff",
            border: "none",
            cursor: pending ? "wait" : "pointer",
            opacity: pending ? 0.6 : 1,
          }}
        >
          {pending ? "กำลังตรวจสอบ..." : "เข้าสู่ระบบ"}
        </button>
      </form>
    </div>
  );
}
