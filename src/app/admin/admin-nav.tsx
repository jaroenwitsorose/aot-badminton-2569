"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { canAccess, type Role } from "@/lib/roles";

const LINKS: { href: string; label: string; min: Role }[] = [
  { href: "/admin", label: "ภาพรวม", min: "SCORER" },
  { href: "/admin/scores", label: "กรอกผล", min: "SCORER" },
  { href: "/admin/participants", label: "รายชื่อนักกีฬา", min: "ADMIN" },
  { href: "/admin/draw", label: "จับสลาก", min: "ADMIN" },
  { href: "/admin/lineups", label: "ซองมือทั่วไป", min: "ADMIN" },
  { href: "/admin/settings", label: "ตั้งค่าและซ้อมระบบ", min: "ADMIN" },
  { href: "/admin/audit", label: "ประวัติการแก้ไข", min: "ADMIN" },
  { href: "/admin/users", label: "บัญชีผู้ดูแล", min: "SUPERADMIN" },
];

export function AdminNav({ role }: { role: Role }) {
  const pathname = usePathname();
  return (
    <nav className="admin-nav" aria-label="เมนูผู้ดูแล">
      {LINKS.filter((l) => canAccess(role, l.min)).map((link) => {
        const active = link.href === "/admin" ? pathname === "/admin" : pathname.startsWith(link.href);
        return (
          <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined}>
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
