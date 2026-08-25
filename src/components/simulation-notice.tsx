"use client";

/**
 * ป้ายบอกผู้ชมว่าผลที่เห็นเป็นผลซ้อม ไม่ใช่ผลจริง
 *
 * ระหว่างซ้อมระบบ ผลของทั้ง 158 แมตช์และคะแนนสีจะถูกสุ่มขึ้นมาเต็มหน้าเว็บ
 * ถ้าไม่บอกไว้ คนที่เปิดลิงก์เข้ามาจะเข้าใจว่าเป็นผลการแข่งขันจริง
 * ป้ายนี้จะหายไปเองทันทีที่ปิดโหมดจำลอง
 */

import { usePathname } from "next/navigation";
import { useSnapshot } from "./snapshot-provider";

export function SimulationNotice() {
  const { snapshot } = useSnapshot();
  const pathname = usePathname();
  if (!snapshot.tournament.simulationEnabled) return null;
  // หน้าผู้ดูแลมีแถบเตือนโหมดจำลองของตัวเองอยู่แล้ว ไม่ต้องซ้ำ
  if (pathname.startsWith("/admin")) return null;

  return (
    <div className="sim-notice" role="status">
      <div className="shell">
        <strong>ข้อมูลทดสอบระบบ</strong> — ผลการแข่งขันและคะแนนสีที่แสดงอยู่ตอนนี้เป็นผลซ้อม
        ไม่ใช่ผลการแข่งขันจริง
      </div>
    </div>
  );
}
