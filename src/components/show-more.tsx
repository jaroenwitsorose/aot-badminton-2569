"use client";

/**
 * ปุ่ม "แสดงเพิ่ม" สำหรับรายการยาว
 *
 * หน้าผลการแข่งขันและหน้ากรอกผลมีได้ถึง 158 รายการ ถ้าเรนเดอร์ทีเดียวหมด
 * DOM จะหนักมากบนมือถือและแท็บเล็ตที่ใช้หน้างาน จึงทยอยแสดงทีละชุด
 */

import { useEffect, useState } from "react";

export function useVisibleCount(total: number, step = 30) {
  const [visible, setVisible] = useState(step);

  // เปลี่ยนตัวกรองแล้วเริ่มนับใหม่ ไม่ให้ค้างจำนวนของรายการชุดก่อน
  useEffect(() => {
    setVisible(step);
  }, [total, step]);

  return {
    visible: Math.min(visible, total),
    hasMore: visible < total,
    showMore: () => setVisible((v) => v + step),
    showAll: () => setVisible(total),
  };
}

export function ShowMoreBar({
  shown,
  total,
  onMore,
  onAll,
  unit = "รายการ",
}: {
  shown: number;
  total: number;
  onMore: () => void;
  onAll: () => void;
  unit?: string;
}) {
  if (shown >= total) return null;
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        padding: "18px 0 4px",
      }}
    >
      <span style={{ color: "var(--muted)", fontSize: 13 }}>
        แสดง {shown} จาก {total} {unit}
      </span>
      <button type="button" className="button ghost" onClick={onMore}>
        แสดงเพิ่ม
      </button>
      <button
        type="button"
        onClick={onAll}
        style={{ background: "none", border: 0, color: "var(--blue)", fontWeight: 700, fontSize: 13 }}
      >
        แสดงทั้งหมด
      </button>
    </div>
  );
}
