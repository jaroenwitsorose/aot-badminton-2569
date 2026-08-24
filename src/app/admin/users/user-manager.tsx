"use client";

import { useActionState, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createAdminUserAction, setAdminActiveAction, type ActionResult } from "../actions";
import { ROLE_TH } from "@/lib/labels";

interface UserRow {
  adminId: string;
  username: string;
  displayName: string;
  role: string;
  active: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
}

export function UserManager({ users, currentAdminId }: { users: UserRow[]; currentAdminId: string }) {
  const router = useRouter();
  const [state, formAction, creating] = useActionState<ActionResult | null, FormData>(
    createAdminUserAction,
    null,
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const toggle = (adminId: string, active: boolean) => {
    startTransition(async () => {
      const res = await setAdminActiveAction({ adminId, active });
      setError(res.ok ? null : res.error);
      if (res.ok) router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="m-0 text-base font-semibold">บัญชีผู้ดูแล</h2>
        <p className="m-0 text-[13px]" style={{ color: "var(--muted)" }}>
          แยกสิทธิ์ตามบทบาท: ผู้กรอกผลแก้ได้เฉพาะผล/สถานะ · ผู้ดูแลระบบจัดการข้อมูลกิจกรรม ·
          หัวหน้าผู้ดูแลจัดการสิทธิ์และคืนค่า
        </p>
      </div>

      <div className="panel scroll-x">
        <table className="w-full border-collapse text-[14px]">
          <thead>
            <tr style={{ color: "var(--muted)", fontSize: 12 }}>
              <th className="px-3 py-2 text-left font-medium">รหัส</th>
              <th className="px-3 py-2 text-left font-medium">ชื่อผู้ใช้</th>
              <th className="px-3 py-2 text-left font-medium">ชื่อที่แสดง</th>
              <th className="px-3 py-2 text-left font-medium">บทบาท</th>
              <th className="px-3 py-2 text-left font-medium">เข้าใช้ล่าสุด</th>
              <th className="px-3 py-2 text-left font-medium">สถานะ</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.adminId} className="border-t" style={{ borderColor: "var(--line)" }}>
                <td className="whitespace-nowrap px-3 py-2" style={{ color: "var(--muted)" }}>
                  {u.adminId}
                </td>
                <td className="whitespace-nowrap px-3 py-2">{u.username}</td>
                <td className="px-3 py-2">
                  {u.displayName}
                  {u.mustChangePassword ? (
                    <span className="ml-2 text-[11px]" style={{ color: "#b45309" }}>
                      ยังไม่เปลี่ยนรหัสผ่านแรกเข้า
                    </span>
                  ) : null}
                </td>
                <td className="whitespace-nowrap px-3 py-2">{ROLE_TH[u.role] ?? u.role}</td>
                <td className="whitespace-nowrap px-3 py-2" style={{ color: "var(--muted)" }}>
                  {u.lastLoginAt ?? "—"}
                </td>
                <td className="whitespace-nowrap px-3 py-2">
                  {u.adminId === currentAdminId ? (
                    <span style={{ color: "var(--muted)" }}>บัญชีของคุณ</span>
                  ) : (
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => toggle(u.adminId, !u.active)}
                      className="rounded-lg border px-2.5 py-1 text-[12px]"
                      style={{
                        borderColor: u.active ? "var(--line)" : "#16a34a",
                        color: u.active ? "var(--muted)" : "#15803d",
                        background: "transparent",
                        cursor: "pointer",
                      }}
                    >
                      {u.active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {error ? (
        <p className="m-0 text-[13px]" style={{ color: "#b91c1c" }}>
          {error}
        </p>
      ) : null}

      <form action={formAction} className="panel flex flex-col gap-3 p-4">
        <h3 className="m-0 text-[15px] font-semibold">เพิ่มบัญชีใหม่</h3>
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
          <label className="flex flex-col gap-1 text-[13px]">
            ชื่อผู้ใช้
            <input name="username" type="text" required autoComplete="off" />
          </label>
          <label className="flex flex-col gap-1 text-[13px]">
            ชื่อที่แสดง
            <input name="displayName" type="text" required />
          </label>
          <label className="flex flex-col gap-1 text-[13px]">
            บทบาท
            <select name="role" defaultValue="SCORER">
              <option value="SCORER">ผู้กรอกผล</option>
              <option value="ADMIN">ผู้ดูแลระบบ</option>
              <option value="SUPERADMIN">หัวหน้าผู้ดูแล</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[13px]">
            รหัสผ่านแรกเข้า
            <input name="password" type="password" required autoComplete="new-password" />
          </label>
        </div>
        <p className="m-0 text-[12px]" style={{ color: "var(--muted)" }}>
          อย่างน้อย 12 ตัวอักษร มีพิมพ์เล็ก พิมพ์ใหญ่ และตัวเลข · ผู้ใช้ต้องเปลี่ยนรหัสผ่านเมื่อเข้าครั้งแรก
        </p>

        {state ? (
          <p className="m-0 text-[13px]" style={{ color: state.ok ? "#15803d" : "#b91c1c" }}>
            {state.ok ? state.message : state.error}
          </p>
        ) : null}

        <div>
          <button
            type="submit"
            disabled={creating}
            className="rounded-lg px-4 py-2 font-medium"
            style={{ background: "var(--ink)", color: "#fff", border: "none", cursor: "pointer" }}
          >
            {creating ? "กำลังสร้าง..." : "สร้างบัญชี"}
          </button>
        </div>
      </form>
    </div>
  );
}
