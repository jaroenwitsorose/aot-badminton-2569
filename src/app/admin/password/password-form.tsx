"use client";

import { useActionState } from "react";
import { changePasswordAction, type ActionResult } from "../actions";

export function PasswordForm() {
  const [state, formAction, pending] = useActionState<ActionResult | null, FormData>(
    changePasswordAction,
    null,
  );

  return (
    <div className="mx-auto w-full max-w-[460px] py-6">
      <form action={formAction} className="panel flex flex-col gap-3 p-5">
        <h2 className="m-0 text-lg font-semibold">เปลี่ยนรหัสผ่าน</h2>
        <p className="m-0 text-[13px]" style={{ color: "var(--muted)" }}>
          ต้องยาวอย่างน้อย 12 ตัวอักษร มีพิมพ์เล็ก พิมพ์ใหญ่ และตัวเลข
        </p>

        <label className="flex flex-col gap-1 text-[13px]">
          รหัสผ่านเดิม
          <input name="current" type="password" autoComplete="current-password" required />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          รหัสผ่านใหม่
          <input name="next" type="password" autoComplete="new-password" required />
        </label>
        <label className="flex flex-col gap-1 text-[13px]">
          ยืนยันรหัสผ่านใหม่
          <input name="confirm" type="password" autoComplete="new-password" required />
        </label>

        {state ? (
          <p className="m-0 text-[13px]" style={{ color: state.ok ? "#15803d" : "#b91c1c" }}>
            {state.ok ? state.message : state.error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="rounded-lg px-4 py-2 font-medium"
          style={{ background: "var(--ink)", color: "#fff", border: "none", cursor: "pointer" }}
        >
          {pending ? "กำลังบันทึก..." : "บันทึกรหัสผ่านใหม่"}
        </button>
      </form>
    </div>
  );
}
