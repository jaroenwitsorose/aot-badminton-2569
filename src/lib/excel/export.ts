/**
 * สร้างไฟล์ Excel สำหรับกรอกรายชื่อนักกีฬา
 *
 * แนวคิด: ไฟล์ที่โหลดออกไปคือ "สถานะปัจจุบันของระบบ" อยู่แล้ว ผู้ใช้แค่เติมช่องสีเหลือง
 * แล้วอัปโหลดกลับ ไม่ต้องสร้างไฟล์เองจากศูนย์ และไม่ต้องจำรหัสใด ๆ
 *
 * ช่องที่ต้องเลือกค่า (เพศ / ระดับมือ) ทำเป็น dropdown ให้เลย เพื่อกันพิมพ์ผิด
 * ซึ่งเป็นสาเหตุหลักที่ทำให้ import ไม่ผ่าน
 *
 * เดิมไฟล์นี้มีชีตล็อกประเภทคู่ จับสลาก และซองมือทั่วไปด้วย แต่ถอดออกแล้ว
 * เพราะคนกรอกรายชื่อไม่ได้เกี่ยวกับสามเรื่องนั้น และเห็นชีตเยอะ ๆ แล้วสับสน
 * งานเหล่านั้นย้ายไปทำที่หน้าเว็บ ส่วนฝั่งนำเข้ายังอ่านชีตเดิมได้ ไฟล์เก่าจึงยังใช้ได้
 */

import ExcelJS from "exceljs";
import { prisma } from "../prisma";
import { EVENT_TH, SKILL_RANK_TH } from "../labels";
import {
  FILL_HEADER,
  GENDER_OPTIONS,
  PARTICIPANT_COLUMNS,
  READONLY_HEADER,
  SHEET,
  SKILL_RANK_OPTIONS,
  TITLE_FILL,
} from "./shared";

type Col = { key: string; header: string; width: number; editable: boolean };

function addHeader(ws: ExcelJS.Worksheet, columns: readonly Col[]) {
  ws.columns = columns.map((c) => ({ key: c.key, width: c.width }));
  const row = ws.addRow(columns.map((c) => c.header));
  row.height = 30;
  row.eachCell((cell, i) => {
    const col = columns[i - 1];
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TITLE_FILL } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    if (col.editable) {
      cell.font = { bold: true, color: { argb: "FF3D2B00" }, size: 11 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF7C948" } };
    }
  });
  ws.views = [{ state: "frozen", ySplit: 1 }];
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
}

function styleBody(ws: ExcelJS.Worksheet, columns: readonly Col[]) {
  for (let r = 2; r <= ws.rowCount; r += 1) {
    const row = ws.getRow(r);
    row.eachCell({ includeEmpty: true }, (cell, i) => {
      const col = columns[i - 1];
      if (!col) return;
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: col.editable ? FILL_HEADER : READONLY_HEADER },
      };
      cell.border = {
        top: { style: "hair", color: { argb: "FFCBD5E1" } },
        bottom: { style: "hair", color: { argb: "FFCBD5E1" } },
        left: { style: "hair", color: { argb: "FFCBD5E1" } },
        right: { style: "hair", color: { argb: "FFCBD5E1" } },
      };
      cell.alignment = { vertical: "middle", wrapText: false };
      if (!col.editable) cell.font = { color: { argb: "FF64748B" } };
    });
  }
}

/**
 * ใส่ dropdown ให้ "ช่วงแถว" ทีเดียว ไม่ใช่ทีละเซลล์
 *
 * exceljs เรียงที่อยู่เซลล์แบบข้อความ ("I10" มาก่อน "I2") เวลาย่อรวมเซลล์เป็นช่วง
 * ถ้าใส่ทีละเซลล์จะได้ช่วงที่ทับกันเอง (I2:I185 กับ I10:I185) ซึ่งเสี่ยงทำให้ Excel
 * ฟ้องว่าไฟล์เสีย — ใส่เป็นช่วงตรง ๆ จึงได้ผลลัพธ์ที่สะอาดและแน่นอนกว่า
 */
type DvSheet = ExcelJS.Worksheet & { dataValidations: { add: (range: string, dv: unknown) => void } };

function addRangeDropdown(
  ws: ExcelJS.Worksheet,
  colIndex: number,
  fromRow: number,
  toRow: number,
  formulae: string[],
  error: string,
) {
  if (colIndex < 1 || toRow < fromRow) return;
  const letter = ws.getColumn(colIndex).letter;
  (ws as DvSheet).dataValidations.add(`${letter}${fromRow}:${letter}${toRow}`, {
    type: "list",
    allowBlank: true,
    formulae,
    showErrorMessage: true,
    errorStyle: "warning",
    errorTitle: "ค่าไม่อยู่ในรายการ",
    error,
  });
}

function addColumnDropdown(
  ws: ExcelJS.Worksheet,
  columns: readonly Col[],
  key: string,
  formulae: string[],
  error = "เลือกจากรายการที่มีให้ หรือเว้นว่างไว้ก่อนได้",
) {
  addRangeDropdown(ws, columns.findIndex((c) => c.key === key) + 1, 2, ws.rowCount, formulae, error);
}

export async function buildDataEntryWorkbook(): Promise<ExcelJS.Buffer> {
  const [teams, levels, pairs, tournament] = await Promise.all([
    prisma.team.findMany({ orderBy: { displayOrder: "asc" } }),
    prisma.level.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.pair.findMany({
      include: { participants: { orderBy: { playerNo: "asc" } } },
      orderBy: [{ levelCode: "asc" }, { teamCode: "asc" }, { eventType: "asc" }, { slotNo: "asc" }],
    }),
    prisma.tournament.findFirst(),
  ]);

  const teamName = new Map(teams.map((t) => [t.teamCode, t.nameTh]));
  const levelName = new Map(levels.map((l) => [l.levelCode, l.nameTh]));

  const wb = new ExcelJS.Workbook();
  wb.creator = "AOT Badminton 2569";
  wb.created = new Date();

  // ── ชีตตัวเลือก (ซ่อน) — ใช้เป็นแหล่งข้อมูลของ dropdown ──
  const lists = wb.addWorksheet(SHEET.lists);
  lists.state = "veryHidden";
  const listCols: { header: string; values: string[] }[] = [
    { header: "skill", values: [...SKILL_RANK_OPTIONS] },
    { header: "gender", values: [...GENDER_OPTIONS] },
  ];
  listCols.forEach((c, i) => {
    lists.getCell(1, i + 1).value = c.header;
    c.values.forEach((v, r) => {
      lists.getCell(r + 2, i + 1).value = v;
    });
  });

  // ── วิธีใช้ ──
  const guide = wb.addWorksheet(SHEET.guide);
  guide.getColumn(1).width = 110;
  const guideLines: [string, boolean][] = [
    ["ไฟล์กรอกข้อมูลการแข่งขันแบดมินตัน กีฬาภายใน ทอท. 2569", true],
    ["", false],
    ["วิธีใช้", true],
    ["1. ไฟล์นี้ดึงสถานะปัจจุบันจากระบบมาแล้ว — กรอกเฉพาะช่องพื้นสีเหลือง", false],
    ["2. ช่องพื้นสีเทาเป็นข้อมูลอ้างอิง ห้ามแก้ โดยเฉพาะคอลัมน์รหัส (ระบบใช้จับคู่ข้อมูล)", false],
    ["3. ห้ามลบแถว ห้ามสลับลำดับคอลัมน์ และห้ามเปลี่ยนชื่อชีต", false],
    ["4. ช่องที่มีลูกศรให้กดเลือกจากรายการ อย่าพิมพ์เอง จะได้ไม่ผิด", false],
    ["5. กรอกไม่ครบก็อัปโหลดได้ ระบบจะข้ามแถวที่ยังว่าง แล้วค่อยกลับมากรอกเพิ่มทีหลัง", false],
    ["6. ช่องที่เว้นว่างไว้ ระบบจะไม่แตะข้อมูลเดิม — ถ้าต้องการลบค่าที่เคยกรอก ให้ลบที่หน้าเว็บ", false],
    ["7. อัปโหลดกลับที่หน้า รายชื่อนักกีฬา ในระบบผู้ดูแล", false],
    ["", false],
    ["ชีตในไฟล์นี้", true],
    [`· ${SHEET.participants} — ชื่อ-นามสกุล ระดับมือจริง และเพศ ของนักกีฬาทั้ง 184 คน`, false],
    ["", false],
    ["ข้อควรรู้", true],
    ["· ระบบจะตรวจข้อมูลทั้งชีตก่อนบันทึก ถ้ามีข้อผิดพลาดจะไม่บันทึกอะไรเลยและแจ้งว่าผิดแถวไหน", false],
    ["· 1 คนลงได้คู่เดียวต่อระดับและประเภท (ลงข้ามประเภทได้) ระบบจะเตือนถ้าชื่อซ้ำในประเภทเดียวกัน", false],
    ["· ระดับมือต้องอยู่ในเกณฑ์ของระดับที่ลงแข่ง", false],
    ["· ประเภทคู่ต้องตรงกับเพศ (ชายคู่ = ชาย 2 คน / หญิงคู่ = หญิง 2 คน / คู่ผสม = ชาย 1 หญิง 1)", false],
    ["· ล็อกประเภทคู่ จับสลาก และซองมือทั่วไป ทำที่หน้าเว็บ ไม่ได้อยู่ในไฟล์นี้แล้ว", false],
    ["", false],
    [`ดาวน์โหลดเมื่อ ${new Date().toLocaleString("th-TH", { timeZone: tournament?.timezone ?? "Asia/Bangkok" })}`, false],
  ];
  guideLines.forEach(([text, bold]) => {
    const row = guide.addRow([text]);
    row.getCell(1).font = { bold, size: bold ? 13 : 11 };
    row.getCell(1).alignment = { wrapText: true, vertical: "middle" };
  });

  // ── รายชื่อนักกีฬา ──
  const wsP = wb.addWorksheet(SHEET.participants);
  addHeader(wsP, PARTICIPANT_COLUMNS);
  for (const p of pairs) {
    for (const person of p.participants) {
      wsP.addRow([
        person.participantUid,
        teamName.get(p.teamCode) ?? p.teamCode,
        levelName.get(p.levelCode) ?? p.levelCode,
        p.eventType ? EVENT_TH[p.eventType] : "รอเลือกประเภท",
        p.slotNo,
        person.playerNo,
        person.actualName ?? "",
        person.skillRank ? SKILL_RANK_TH[person.skillRank] ?? "" : "",
        person.gender === "M" ? "ชาย" : person.gender === "F" ? "หญิง" : "",
      ]);
    }
  }
  styleBody(wsP, PARTICIPANT_COLUMNS);
  addColumnDropdown(wsP, PARTICIPANT_COLUMNS, "skillRank", [`${SHEET.lists}!$A$2:$A$${SKILL_RANK_OPTIONS.length + 1}`]);
  addColumnDropdown(wsP, PARTICIPANT_COLUMNS, "gender", [`${SHEET.lists}!$B$2:$B$${GENDER_OPTIONS.length + 1}`]);

  // ชีตกรอกผลจับสลาก ล็อกประเภทคู่ และซองมือทั่วไป ถูกถอดออกจากไฟล์นี้แล้ว
  // ไฟล์กรอกเหลือเฉพาะรายชื่อ เพื่อให้คนกรอกไม่ต้องเจอชีตที่ไม่เกี่ยวกับตัวเอง
  // งานเหล่านั้นทำผ่านหน้าเว็บแทน — แต่ฝั่งนำเข้ายังอ่านชีตเดิมได้อยู่ ไฟล์เก่าจึงยังใช้ได้

  return wb.xlsx.writeBuffer();
}
