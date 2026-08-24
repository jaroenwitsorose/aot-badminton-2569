"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSnapshot } from "./snapshot-provider";

const LINKS = [
  { href: "/", label: "หน้าแรก" },
  { href: "/schedule", label: "ตารางแข่งขัน" },
  { href: "/results", label: "ผลการแข่งขัน" },
  { href: "/brackets", label: "สายการแข่งขัน" },
  { href: "/scores", label: "คะแนนสี" },
  { href: "/teams", label: "นักกีฬา" },
  { href: "/rules", label: "กติกา" },
];

export function SiteHeader() {
  const pathname = usePathname();
  const { snapshot } = useSnapshot();
  const isAdmin = pathname.startsWith("/admin");

  return (
    <header className="site-header">
      <div className="shell header-main">
        <Link href="/" className="brand" aria-label="กลับหน้าแรก">
          <span className="brand-logo">
            <Image src="/assets/aot-logo.png" alt="บริษัท ท่าอากาศยานไทย จำกัด (มหาชน)" width={526} height={198} priority />
          </span>
          <span className="brand-copy">
            <strong>การแข่งขันแบดมินตัน กีฬาภายใน ทอท. 2569</strong>
            <small>
              {snapshot.tournament.venueConfirmed ? snapshot.tournament.venue : "สถานที่อยู่ระหว่างยืนยัน"}
            </small>
          </span>
        </Link>
        <Link href={isAdmin ? "/" : "/admin"} className="admin-link">
          {isAdmin ? "กลับหน้าสาธารณะ" : "ผู้ดูแลระบบ"}
        </Link>
      </div>

      {isAdmin ? null : (
        <nav className="site-nav" aria-label="เมนูหลัก">
          <div className="shell nav-scroll">
            {LINKS.map((link) => {
              const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
              return (
                <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined}>
                  {link.label}
                </Link>
              );
            })}
          </div>
        </nav>
      )}
    </header>
  );
}
