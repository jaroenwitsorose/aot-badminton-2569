"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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

  /**
   * แถบเมนูค้างบนสุดเวลาเลื่อนหน้า ส่วนหัวเว็บ (โลโก้ใหญ่ + ชื่องาน) เลื่อนหายไปตามปกติ
   * พอหัวเว็บพ้นจอ จะสลับโลโก้เล็กขึ้นมาในแถบเมนูแทน เพื่อให้ยังรู้ว่าอยู่เว็บไหน
   *
   * ใช้ตัวดัก (sentinel) สูง 1px คั่นระหว่างหัวเว็บกับแถบเมนู แล้วดูว่ามันพ้นจอหรือยัง
   * ดีกว่าฟัง scroll เพราะเบราว์เซอร์คำนวณให้เอง ไม่ต้องอ่านตำแหน่งทุกเฟรม
   */
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setStuck(!entry.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, [isAdmin]);

  return (
    <>
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
    </header>

      {/*
        แถบเมนูต้องอยู่ "นอก" <header> — position: sticky ถูกจำกัดด้วยกล่องของพ่อแม่เสมอ
        ถ้าวางไว้ข้างในหัวเว็บซึ่งสูงแค่ราว 125px มันจะค้างได้แค่ในกรอบนั้น
        พอหัวเว็บเลื่อนพ้นจอ แถบเมนูก็หายตามไปด้วย ไม่ค้างจริง
        พอย้ายมาเป็นพี่น้องกัน กล่องอ้างอิงจะกลายเป็น <body> ซึ่งสูงเท่าทั้งหน้า
      */}
      {isAdmin ? null : (
        <>
        <div ref={sentinelRef} className="nav-sentinel" aria-hidden />
        <nav className={`site-nav${stuck ? " stuck" : ""}`} aria-label="เมนูหลัก">
          <div className="shell nav-row">
            {/* โลโก้อยู่นอกแถบที่เลื่อนแนวนอน จะได้ไม่หายไปตอนผู้ใช้ปัดหาเมนูขวาสุด */}
            <Link href="/" className="nav-logo" aria-label="กลับหน้าแรก" tabIndex={stuck ? 0 : -1}>
              <Image src="/assets/aot-logo.png" alt="" width={526} height={198} />
            </Link>
            <div className="nav-scroll">
              {LINKS.map((link) => {
                const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
                return (
                  <Link key={link.href} href={link.href} aria-current={active ? "page" : undefined}>
                    {link.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </nav>
        </>
      )}
    </>
  );
}
