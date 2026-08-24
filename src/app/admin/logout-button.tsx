"use client";

import { logoutAction } from "./actions";

export function LogoutButton() {
  return (
    <form action={logoutAction}>
      <button type="submit" className="button ghost" style={{ padding: "8px 14px", fontSize: 13 }}>
        ออกจากระบบ
      </button>
    </form>
  );
}
