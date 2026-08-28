/**
 * รหัสตาราง — ลายนิ้วมือสั้น ๆ ของ "ตารางแข่งชุดหนึ่ง"
 *
 * ปัญหาที่แก้: ไฟล์ Excel ตั้งชื่อเป็น -v1 -v2 -v3 ตามลำดับที่สร้างในเครื่อง
 * ซึ่งเว็บไม่รู้จักเลย พอมีหลายไฟล์วางอยู่ก็ไม่มีทางรู้ว่าไฟล์ไหนตรงกับที่เว็บใช้อยู่
 *
 * วิธีแก้: คำนวณรหัสจากเนื้อตารางจริง (แมตช์ไหน วันไหน เวลาไหน คอร์ตไหน)
 * แล้วโชว์รหัสเดียวกันนี้ทั้งในไฟล์ Excel และในหน้าผู้ดูแล
 * ถ้ารหัสตรงกัน = ไฟล์ที่ถืออยู่คือตารางเดียวกับที่เว็บใช้ ไม่ต้องเดา
 *
 * ใช้ FNV-1a แทน hash ของ node:crypto เพื่อให้สคริปต์กับเว็บคำนวณได้เหมือนกันแน่นอน
 * โดยไม่ต้องพึ่งไลบรารีฝั่งใดฝั่งหนึ่ง — งานนี้ต้องการแค่ "ต่างกันแล้วรู้" ไม่ใช่ความปลอดภัย
 */

export interface FingerprintMatch {
  matchUid: string;
  matchNo: number;
  dayNo: number;
  startTime: string;
  courtNo: number;
}

function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).toUpperCase().padStart(8, "0");
}

/**
 * รหัสจะเปลี่ยนก็ต่อเมื่อมีแมตช์ย้ายวัน ย้ายเวลา ย้ายคอร์ต หรือเปลี่ยนเลขแมตช์
 * เรียงตาม matchUid ก่อนเสมอ เพื่อให้ลำดับในไฟล์ไม่มีผลกับรหัส
 */
export function scheduleFingerprint(matches: FingerprintMatch[]): string {
  const body = [...matches]
    .sort((a, b) => a.matchUid.localeCompare(b.matchUid))
    .map((m) => `${m.matchUid}|${m.matchNo}|${m.dayNo}|${m.startTime}|${m.courtNo}`)
    .join("\n");
  return `${fnv1a(body)}-${matches.length}`;
}
