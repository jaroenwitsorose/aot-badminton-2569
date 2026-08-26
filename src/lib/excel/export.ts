/**
 * สร้างไฟล์ Excel สำหรับกรอกข้อมูล (รายชื่อ · ประเภทคู่ · จับสลาก · ซองมือทั่วไป)
 *
 * แนวคิด: ไฟล์ที่โหลดออกไปคือ "สถานะปัจจุบันของระบบ" อยู่แล้ว ผู้ใช้แค่เติมช่องสีเหลือง
 * แล้วอัปโหลดกลับ ไม่ต้องสร้างไฟล์เองจากศูนย์ และไม่ต้องจำรหัสใด ๆ
 *
 * ช่องที่ต้องเลือกค่า (เพศ / ระดับมือ / ประเภท / คู่แข่งขัน) ทำเป็น dropdown ให้เลย
 * เพื่อกันพิมพ์ผิด ซึ่งเป็นสาเหตุหลักที่ทำให้ import ไม่ผ่าน
 */

import ExcelJS from "exceljs";
import { prisma } from "../prisma";
import { EVENT_TH, SKILL_RANK_TH } from "../labels";
import {
  DRAW_COLUMNS,
  EVENT_OPTIONS,
  FILL_HEADER,
  GENDER_OPTIONS,
  LINEUP_COLUMNS,
  PAIR_EVENT_COLUMNS,
  PARTICIPANT_COLUMNS,
  READONLY_HEADER,
  SHEET,
  SKILL_RANK_OPTIONS,
  TITLE_FILL,
  pairChoiceLabel,
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

const LEVEL_SHORT: Record<string, string> = { L1: "LEVEL1", L2: "LEVEL2", L3: "LEVEL3", L4: "LEVEL4" };

/** SEED:L1:MD:01 -> "ชายคู่ · สาย 1" ; GROUP:L2:A:SLOT1 -> "กลุ่ม A · คู่ที่ 1" */
function describeToken(token: string): string {
  const p = token.split(":");
  if (p[0] === "SEED") return `${EVENT_TH[p[2] as keyof typeof EVENT_TH] ?? p[2]} · สาย ${Number(p[3])}`;
  return `กลุ่ม ${p[2]} · คู่ที่ ${p[3].replace("SLOT", "")}`;
}

export async function buildDataEntryWorkbook(): Promise<ExcelJS.Buffer> {
  const [teams, levels, pairs, matches, draws, ties, lineups, tournament] = await Promise.all([
    prisma.team.findMany({ orderBy: { displayOrder: "asc" } }),
    prisma.level.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.pair.findMany({
      include: { participants: { orderBy: { playerNo: "asc" } } },
      orderBy: [{ levelCode: "asc" }, { teamCode: "asc" }, { eventType: "asc" }, { slotNo: "asc" }],
    }),
    prisma.match.findMany({ orderBy: { matchNo: "asc" } }),
    prisma.drawAssignment.findMany(),
    prisma.level4Tie.findMany({ orderBy: { tieNo: "asc" } }),
    prisma.level4Lineup.findMany(),
    prisma.tournament.findFirst(),
  ]);

  const teamName = new Map(teams.map((t) => [t.teamCode, t.nameTh]));
  const levelName = new Map(levels.map((l) => [l.levelCode, l.nameTh]));
  const pairByUid = new Map(pairs.map((p) => [p.pairUid, p]));

  const playersLabel = (pairUid: string) => {
    const p = pairByUid.get(pairUid);
    if (!p) return "";
    return p.participants.map((x) => x.actualName ?? x.displayCode ?? "").filter(Boolean).join(" / ");
  };

  const choiceFor = (pairUid: string) => {
    const p = pairByUid.get(pairUid);
    if (!p) return "";
    return pairChoiceLabel({
      pairUid: p.pairUid,
      teamNameTh: teamName.get(p.teamCode) ?? p.teamCode,
      levelNameTh: levelName.get(p.levelCode) ?? p.levelCode,
      eventNameTh: p.eventType ? EVENT_TH[p.eventType] : null,
      slotNo: p.slotNo,
      playersLabel: playersLabel(p.pairUid),
    });
  };

  const wb = new ExcelJS.Workbook();
  wb.creator = "AOT Badminton 2569";
  wb.created = new Date();

  // ── ชีตตัวเลือก (ซ่อน) — ใช้เป็นแหล่งข้อมูลของ dropdown ──
  const lists = wb.addWorksheet(SHEET.lists);
  lists.state = "veryHidden";
  const listCols: { header: string; values: string[] }[] = [
    { header: "skill", values: [...SKILL_RANK_OPTIONS] },
    { header: "gender", values: [...GENDER_OPTIONS] },
    { header: "event", values: [...EVENT_OPTIONS] },
  ];
  // รายชื่อคู่แยกตามระดับ + ประเภท เพื่อให้ช่องจับสลากเลือกได้เฉพาะคู่ที่ถูกต้อง
  const groupKeys = ["LEVEL1:MD", "LEVEL1:WD", "LEVEL1:XD", "LEVEL2", "LEVEL3", "LEVEL4"];
  for (const gk of groupKeys) {
    const [lv, ev] = gk.split(":");
    const list = pairs
      .filter((p) => p.levelCode === lv && (!ev || p.eventType === ev) && !p.withdrawn)
      .map((p) => choiceFor(p.pairUid));
    listCols.push({ header: gk, values: list });
  }
  listCols.forEach((c, i) => {
    lists.getCell(1, i + 1).value = c.header;
    c.values.forEach((v, r) => {
      lists.getCell(r + 2, i + 1).value = v;
    });
  });
  const colLetter = (i: number) => lists.getColumn(i + 1).letter;
  const rangeFor = (header: string) => {
    const i = listCols.findIndex((c) => c.header === header);
    const n = listCols[i].values.length;
    if (n === 0) return null;
    const L = colLetter(i);
    return [`${SHEET.lists}!$${L}$2:$${L}$${n + 1}`];
  };

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
    [`· ${SHEET.participants} — ชื่อ-นามสกุล รหัสพนักงาน ระดับมือจริง และเพศ ของนักกีฬาทั้ง 184 คน`, false],
    [`· ${SHEET.pairEvents} — ล็อกประเภท ชายคู่/หญิงคู่/คู่ผสม ให้คู่ที่ยังไม่ได้เลือก`, false],
    [`· ${SHEET.draw} — ผลจับสลาก ว่าคู่ไหนอยู่ช่องไหนในสาย`, false],
    [`· ${SHEET.lineups} — ซองรายชื่อของมือทั่วไป (คู่ที่ 1-3 ของแต่ละสีในแต่ละคู่สี)`, false],
    ["", false],
    ["ข้อควรรู้", true],
    ["· ระบบจะตรวจข้อมูลทั้งชีตก่อนบันทึก ถ้ามีข้อผิดพลาดจะไม่บันทึกอะไรเลยและแจ้งว่าผิดแถวไหน", false],
    ["· รหัสพนักงานห้ามซ้ำกัน และระดับมือต้องอยู่ในเกณฑ์ของระดับที่ลงแข่ง", false],
    ["· ประเภทคู่ต้องตรงกับเพศ (ชายคู่ = ชาย 2 คน / หญิงคู่ = หญิง 2 คน / คู่ผสม = ชาย 1 หญิง 1)", false],
    ["· มือ D ไม่มีประเภทชายคู่", false],
    ["· ซองมือทั่วไป: คู่ที่ 1 ต้องมีระดับมือไม่ต่ำกว่าคู่ที่ 2 และ 3", false],
    ["· ช่องที่เริ่มแข่งไปแล้วจะแก้ไม่ได้ ระบบจะข้ามให้และแจ้งเตือน", false],
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
        person.employeeId ?? "",
        person.skillRank ? SKILL_RANK_TH[person.skillRank] ?? "" : "",
        person.gender === "M" ? "ชาย" : person.gender === "F" ? "หญิง" : "",
      ]);
    }
  }
  styleBody(wsP, PARTICIPANT_COLUMNS);
  addColumnDropdown(wsP, PARTICIPANT_COLUMNS, "skillRank", [`${SHEET.lists}!$A$2:$A$${SKILL_RANK_OPTIONS.length + 1}`]);
  addColumnDropdown(wsP, PARTICIPANT_COLUMNS, "gender", [`${SHEET.lists}!$B$2:$B$${GENDER_OPTIONS.length + 1}`]);

  // ── ประเภทคู่ ──
  const wsE = wb.addWorksheet(SHEET.pairEvents);
  addHeader(wsE, PAIR_EVENT_COLUMNS);
  for (const p of pairs) {
    wsE.addRow([
      p.pairUid,
      teamName.get(p.teamCode) ?? p.teamCode,
      levelName.get(p.levelCode) ?? p.levelCode,
      p.slotNo,
      playersLabel(p.pairUid) || "(ยังไม่กรอกชื่อ)",
      p.eventLockedAt ? "ล็อกแล้ว" : "รอเลือก",
      p.eventType ? EVENT_TH[p.eventType] : "",
    ]);
  }
  styleBody(wsE, PAIR_EVENT_COLUMNS);
  addColumnDropdown(wsE, PAIR_EVENT_COLUMNS, "eventTh", [`${SHEET.lists}!$C$2:$C$${EVENT_OPTIONS.length + 1}`]);

  // ── จับสลาก ──
  const wsD = wb.addWorksheet(SHEET.draw);
  addHeader(wsD, DRAW_COLUMNS);
  const drawByToken = new Map(draws.map((d) => [d.token, d.pairUid]));
  const slots = new Map<string, { token: string; levelCode: string; firstMatchNo: number }>();
  for (const m of matches) {
    for (const src of [m.sideASource, m.sideBSource]) {
      if (!src.startsWith("SEED:") && !src.startsWith("GROUP:")) continue;
      const prev = slots.get(src);
      slots.set(src, {
        token: src,
        levelCode: LEVEL_SHORT[src.split(":")[1]],
        firstMatchNo: prev ? Math.min(prev.firstMatchNo, m.matchNo) : m.matchNo,
      });
    }
  }
  const slotRows = [...slots.values()].sort((a, b) => a.token.localeCompare(b.token));
  for (const s of slotRows) {
    const current = drawByToken.get(s.token);
    wsD.addRow([
      s.token,
      levelName.get(s.levelCode) ?? s.levelCode,
      describeToken(s.token),
      s.firstMatchNo,
      current ? choiceFor(current) : "",
      current ? choiceFor(current) : "",
    ]);
  }
  styleBody(wsD, DRAW_COLUMNS);
  // dropdown ของแต่ละแถวจำกัดเฉพาะคู่ในระดับ (และประเภท) ของช่องนั้น
  // ช่องที่อยู่ระดับ/ประเภทเดียวกันเรียงติดกันอยู่แล้ว จึงใส่ทีละช่วงแถวได้
  const choiceIdx = DRAW_COLUMNS.findIndex((c) => c.key === "pairChoice") + 1;
  const listKeyOf = (token: string, levelCode: string) => {
    const parts = token.split(":");
    return parts[0] === "SEED" ? `${levelCode}:${parts[2]}` : levelCode;
  };
  let runStart = 0;
  for (let i = 0; i <= slotRows.length; i += 1) {
    const sameAsRun =
      i < slotRows.length &&
      listKeyOf(slotRows[i].token, slotRows[i].levelCode) ===
        listKeyOf(slotRows[runStart].token, slotRows[runStart].levelCode);
    if (sameAsRun) continue;
    const range = rangeFor(listKeyOf(slotRows[runStart].token, slotRows[runStart].levelCode));
    if (range) {
      addRangeDropdown(
        wsD,
        choiceIdx,
        runStart + 2,
        i + 1,
        range,
        "เลือกคู่จากรายการ (แสดงเฉพาะคู่ที่ลงในระดับ/ประเภทนี้ได้)",
      );
    }
    runStart = i;
  }

  // ── ซองมือทั่วไป ──
  const wsL = wb.addWorksheet(SHEET.lineups);
  addHeader(wsL, LINEUP_COLUMNS);
  const lineupByKey = new Map(lineups.map((l) => [`${l.tieId}|${l.teamCode}|${l.orderNo}`, l.pairUid]));
  const l4Range = rangeFor("LEVEL4");
  const lineupChoiceIdx = LINEUP_COLUMNS.findIndex((c) => c.key === "pairChoice") + 1;
  let lineupRow = 1;
  for (const tie of ties) {
    for (const teamCode of [tie.teamACode, tie.teamBCode]) {
      // คู่สีรอบเพลย์ออฟยังไม่รู้ว่าสีไหนเข้า จนกว่าจะจบรอบพบกันหมด — โหลดไฟล์ใหม่ทีหลังจะมีแถวเพิ่ม
      if (!teamCode) continue;
      for (const orderNo of [1, 2, 3]) {
        const current = lineupByKey.get(`${tie.tieId}|${teamCode}|${orderNo}`);
        wsL.addRow([
          tie.tieId,
          tie.stage,
          teamName.get(teamCode) ?? teamCode,
          orderNo,
          current ? choiceFor(current) : "",
          current ? choiceFor(current) : "",
        ]);
        lineupRow += 1;
      }
    }
  }
  styleBody(wsL, LINEUP_COLUMNS);
  if (l4Range) addRangeDropdown(wsL, lineupChoiceIdx, 2, lineupRow, l4Range, "เลือกคู่ของมือทั่วไปจากรายการ");

  return wb.xlsx.writeBuffer();
}
