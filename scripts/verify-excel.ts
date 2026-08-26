/**
 * ตรวจการนำเข้า/ส่งออก Excel กับฐานข้อมูลจริง
 *
 *   npm run verify:excel             ตรวจอย่างเดียว ไม่เขียนอะไรลงฐานข้อมูล
 *   npm run verify:excel -- --write  ทดสอบการเขียนจริง 1 รายการ แล้วคืนค่าเดิมให้
 *
 * ทำไมต้องมีสคริปต์นี้: การนำเข้าไฟล์ที่อ่านผิดแล้วเขียนทับข้อมูลเงียบ ๆ
 * เป็นความเสียหายที่ตรวจย้อนหลังยากที่สุดของระบบนี้ จึงต้องพิสูจน์สามข้อ
 *   1. ไฟล์ที่ส่งออกมา อ่านกลับเข้าไปแล้วต้องไม่เปลี่ยนอะไรเลย (ไม่มีการ "แก้" ที่ไม่ได้ตั้งใจ)
 *   2. ไฟล์ที่ผิด ต้องถูกจับได้ครบและไม่เขียนอะไรลงฐานข้อมูล
 *   3. ไฟล์ที่ถูก ต้องเขียนได้จริงและค่าที่เขียนตรงกับที่กรอก
 */

import ExcelJS from "exceljs";
import { prisma } from "../src/lib/prisma";
import { buildDataEntryWorkbook } from "../src/lib/excel/export";
import { importDataEntryWorkbook } from "../src/lib/excel/import";
import { DRAW_COLUMNS, LINEUP_COLUMNS, PAIR_EVENT_COLUMNS, PARTICIPANT_COLUMNS, SHEET } from "../src/lib/excel/shared";

const WRITE = process.argv.includes("--write");

let failures = 0;
let skipped = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "✓" : "✗"} ${label}${ok || !detail ? "" : ` — ${detail}`}`);
  if (!ok) failures += 1;
}
function skip(label: string, why: string) {
  console.log(`  · ${label} — ข้าม (${why})`);
  skipped += 1;
}

async function load(buffer: ArrayBuffer | ExcelJS.Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as ArrayBuffer);
  return wb;
}

/** แก้เซลล์เดียวในไฟล์แล้วคืนเป็น buffer ใหม่ — ใช้สร้างไฟล์ "ผิด" สำหรับทดสอบ */
async function mutate(
  base: ArrayBuffer,
  edits: { sheet: string; row: number; col: number; value: string | null }[],
): Promise<ArrayBuffer> {
  const wb = await load(base);
  for (const e of edits) {
    const ws = wb.getWorksheet(e.sheet);
    if (!ws) throw new Error(`ไม่พบชีต ${e.sheet}`);
    ws.getCell(e.row, e.col).value = e.value;
  }
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

const idxOf = (cols: readonly { key: string }[], key: string) => cols.findIndex((c) => c.key === key) + 1;

/** หาแถวแรกที่ตรงเงื่อนไข (คืนเลขแถวจริงใน Excel) */
function findRow(ws: ExcelJS.Worksheet, match: (row: ExcelJS.Row) => boolean): number | null {
  for (let r = 2; r <= ws.rowCount; r += 1) {
    if (match(ws.getRow(r))) return r;
  }
  return null;
}

const text = (v: ExcelJS.CellValue): string => (v === null || v === undefined ? "" : String(v).trim());

async function main() {
  console.log("\nตรวจการนำเข้า/ส่งออก Excel");
  console.log("─".repeat(70));

  const [participants, pairs, matches, ties] = await Promise.all([
    prisma.participant.count(),
    prisma.pair.findMany({ select: { pairUid: true, levelCode: true } }),
    prisma.match.findMany({ select: { sideASource: true, sideBSource: true, status: true } }),
    prisma.level4Tie.findMany({ select: { teamACode: true, teamBCode: true } }),
  ]);

  // ───────── 1. โครงสร้างไฟล์ที่ส่งออก ─────────
  console.log("\nไฟล์ที่ส่งออก");
  const buffer = (await buildDataEntryWorkbook()) as ArrayBuffer;
  const wb = await load(buffer);

  for (const name of Object.values(SHEET)) {
    check(`มีชีต "${name}"`, Boolean(wb.getWorksheet(name)));
  }
  check("ชีตรายการตัวเลือกถูกซ่อน", wb.getWorksheet(SHEET.lists)?.state === "veryHidden");

  const sheetSpecs = [
    [SHEET.participants, PARTICIPANT_COLUMNS],
    [SHEET.pairEvents, PAIR_EVENT_COLUMNS],
    [SHEET.draw, DRAW_COLUMNS],
    [SHEET.lineups, LINEUP_COLUMNS],
  ] as const;
  for (const [name, cols] of sheetSpecs) {
    const ws = wb.getWorksheet(name)!;
    const wrong = cols.findIndex((c, i) => text(ws.getRow(1).getCell(i + 1).value) !== c.header);
    check(`หัวตารางชีต "${name}" ตรงกับข้อกำหนด`, wrong === -1, wrong === -1 ? "" : `คอลัมน์ที่ ${wrong + 1}`);
  }

  const wsP = wb.getWorksheet(SHEET.participants)!;
  check("จำนวนแถวรายชื่อครบทุกคน", wsP.rowCount - 1 === participants, `ไฟล์ ${wsP.rowCount - 1} / ระบบ ${participants}`);

  const wsE = wb.getWorksheet(SHEET.pairEvents)!;
  check("จำนวนแถวประเภทคู่ครบทุกคู่", wsE.rowCount - 1 === pairs.length, `ไฟล์ ${wsE.rowCount - 1} / ระบบ ${pairs.length}`);

  const slotTokens = new Set<string>();
  for (const m of matches) {
    for (const src of [m.sideASource, m.sideBSource]) {
      if (src.startsWith("SEED:") || src.startsWith("GROUP:")) slotTokens.add(src);
    }
  }
  const wsD = wb.getWorksheet(SHEET.draw)!;
  check("จำนวนช่องจับสลากครบทุกช่องในสาย", wsD.rowCount - 1 === slotTokens.size, `ไฟล์ ${wsD.rowCount - 1} / สาย ${slotTokens.size}`);

  const expectedLineupRows = ties.reduce((n, t) => n + (t.teamACode ? 3 : 0) + (t.teamBCode ? 3 : 0), 0);
  const wsL = wb.getWorksheet(SHEET.lineups)!;
  check("จำนวนแถวซองตรงกับคู่สีที่รู้สีแล้ว", wsL.rowCount - 1 === expectedLineupRows, `ไฟล์ ${wsL.rowCount - 1} / คาด ${expectedLineupRows}`);

  // ───────── 2. อ่านกลับโดยไม่แก้อะไร ต้องไม่เปลี่ยนข้อมูล ─────────
  console.log("\nอ่านไฟล์เดิมกลับเข้าไป (ไม่ควรเกิดการเปลี่ยนแปลง)");
  const roundTrip = await importDataEntryWorkbook(buffer, { actorId: "verify-script" });
  check("ไฟล์ผ่านการตรวจทั้งหมด", roundTrip.ok, roundTrip.issues.map((i) => `${i.sheet}#${i.row}: ${i.message}`).join(" | "));
  check("ไม่มีรายการใดถูกบันทึก", roundTrip.totalApplied === 0, `บันทึกไป ${roundTrip.totalApplied} รายการ`);

  // ───────── 3. ไฟล์ที่ผิด ต้องถูกจับได้ ─────────
  console.log("\nไฟล์ที่กรอกผิด (ต้องไม่บันทึกอะไรเลย)");

  const cSkill = idxOf(PARTICIPANT_COLUMNS, "skillRank");
  const cEmp = idxOf(PARTICIPANT_COLUMNS, "employeeId");
  const cName = idxOf(PARTICIPANT_COLUMNS, "actualName");
  const cGender = idxOf(PARTICIPANT_COLUMNS, "gender");
  const cUid = idxOf(PARTICIPANT_COLUMNS, "participantUid");

  const badRank = await importDataEntryWorkbook(
    await mutate(buffer, [{ sheet: SHEET.participants, row: 2, col: cSkill, value: "มือเทพ" }]),
    { actorId: "verify-script" },
  );
  check(
    "ระดับมือที่ไม่มีในรายการถูกปฏิเสธ",
    !badRank.ok && badRank.issues.some((i) => i.row === 2 && i.message.includes("ระดับมือ")),
    JSON.stringify(badRank.issues.slice(0, 2)),
  );

  const dupEmp = await importDataEntryWorkbook(
    await mutate(buffer, [
      { sheet: SHEET.participants, row: 2, col: cEmp, value: "TEST-DUP-001" },
      { sheet: SHEET.participants, row: 3, col: cEmp, value: "TEST-DUP-001" },
    ]),
    { actorId: "verify-script" },
  );
  check(
    "รหัสพนักงานซ้ำถูกปฏิเสธ",
    !dupEmp.ok && dupEmp.issues.some((i) => i.message.includes("ซ้ำ")),
    JSON.stringify(dupEmp.issues.slice(0, 2)),
  );

  const badHeader = await importDataEntryWorkbook(
    await mutate(buffer, [{ sheet: SHEET.participants, row: 1, col: cName, value: "ชื่อ" }]),
    { actorId: "verify-script" },
  );
  check(
    "หัวตารางที่ถูกแก้ถูกปฏิเสธ",
    !badHeader.ok && badHeader.issues.some((i) => i.row === 1),
    JSON.stringify(badHeader.issues.slice(0, 2)),
  );

  const badSkillLevel = await importDataEntryWorkbook(
    await mutate(buffer, [{ sheet: SHEET.participants, row: 2, col: cSkill, value: "S" }]),
    { actorId: "verify-script" },
  );
  const row2Level = text(wsP.getRow(2).getCell(3).value);
  if (row2Level.includes("ทั่วไป")) {
    skip("ระดับมือเกินเกณฑ์ถูกปฏิเสธ", "แถวแรกเป็นมือทั่วไปซึ่งรับได้ทุกระดับ");
  } else {
    check(
      "ระดับมือเกินเกณฑ์ของระดับที่ลงแข่งถูกปฏิเสธ",
      !badSkillLevel.ok,
      JSON.stringify(badSkillLevel.issues.slice(0, 2)),
    );
  }

  // จับสลาก: ใส่คู่ผิดระดับลงช่อง — ทดสอบได้เฉพาะช่องที่ยังไม่เริ่มแข่ง
  const lockedTokens = new Set<string>();
  for (const m of matches) {
    if (m.status === "WAITING") continue;
    for (const src of [m.sideASource, m.sideBSource]) {
      if (src.startsWith("SEED:") || src.startsWith("GROUP:")) lockedTokens.add(src);
    }
  }
  const cToken = idxOf(DRAW_COLUMNS, "token");
  const cChoice = idxOf(DRAW_COLUMNS, "pairChoice");
  const freeRow = findRow(wsD, (row) => !lockedTokens.has(text(row.getCell(cToken).value)));
  const otherLevelPair = pairs.find((p) => p.levelCode === "LEVEL4");
  if (freeRow === null) {
    skip("คู่ผิดระดับในช่องจับสลากถูกปฏิเสธ", "ทุกช่องมีแมตช์ที่เริ่มแข่งแล้ว");
  } else if (!otherLevelPair) {
    skip("คู่ผิดระดับในช่องจับสลากถูกปฏิเสธ", "ไม่มีคู่ระดับอื่นให้ทดสอบ");
  } else {
    const token = text(wsD.getRow(freeRow).getCell(cToken).value);
    const expectLevel = token.split(":")[1];
    const wrongLevel = await importDataEntryWorkbook(
      await mutate(buffer, [
        { sheet: SHEET.draw, row: freeRow, col: cChoice, value: `${otherLevelPair.pairUid} | ทดสอบ` },
      ]),
      { actorId: "verify-script" },
    );
    check(
      `คู่ผิดระดับในช่องจับสลาก (${token}) ถูกปฏิเสธ`,
      !wrongLevel.ok && wrongLevel.issues.some((i) => i.sheet === SHEET.draw),
      expectLevel === "L4" ? "ช่องทดสอบเป็น L4 เอง" : JSON.stringify(wrongLevel.issues.slice(0, 2)),
    );
  }

  // ซอง: กรอกไม่ครบ 3 ลำดับ
  const cLineChoice = idxOf(LINEUP_COLUMNS, "pairChoice");
  const cOrder = idxOf(LINEUP_COLUMNS, "orderNo");
  const emptyOrder1 = findRow(
    wsL,
    (row) => text(row.getCell(cOrder).value) === "1" && text(row.getCell(cLineChoice).value) === "",
  );
  const anyL4Pair = pairs.find((p) => p.levelCode === "LEVEL4");
  if (emptyOrder1 === null || !anyL4Pair) {
    skip("ซองที่กรอกไม่ครบ 3 ลำดับถูกปฏิเสธ", "ไม่มีคู่สีที่ยังว่างให้ทดสอบ");
  } else {
    const partial = await importDataEntryWorkbook(
      await mutate(buffer, [
        { sheet: SHEET.lineups, row: emptyOrder1, col: cLineChoice, value: `${anyL4Pair.pairUid} | ทดสอบ` },
      ]),
      { actorId: "verify-script" },
    );
    check(
      "ซองที่กรอกไม่ครบ 3 ลำดับถูกปฏิเสธ",
      !partial.ok && partial.issues.some((i) => i.message.includes("ครบทั้ง 3")),
      JSON.stringify(partial.issues.slice(0, 2)),
    );
  }

  // ───────── 4. ยืนยันว่าไฟล์ผิดไม่ได้เขียนอะไรลงฐานข้อมูลจริง ─────────
  const afterBad = await prisma.participant.count({ where: { employeeId: "TEST-DUP-001" } });
  check("ไฟล์ที่ผิดไม่ได้เขียนอะไรลงฐานข้อมูล", afterBad === 0, `พบ ${afterBad} แถว`);

  // ───────── 5. ทดสอบการเขียนจริง (ต้องสั่ง --write) ─────────
  console.log("\nการเขียนจริง");
  if (!WRITE) {
    skip("นำเข้าค่าที่ถูกต้องแล้วบันทึกจริง", "สั่ง npm run verify:excel -- --write เพื่อทดสอบ");
  } else {
    // audit log ผูก foreign key กับผู้ใช้จริง จึงต้องยืมบัญชีผู้ดูแลคนแรกมาเป็นผู้ทำรายการ
    const actorAdmin = await prisma.adminUser.findFirst({ orderBy: { createdAt: "asc" } });
    const target = await prisma.participant.findFirst({
      where: { actualName: null, employeeId: null },
      orderBy: { participantUid: "asc" },
    });
    if (!actorAdmin) {
      skip("นำเข้าค่าที่ถูกต้องแล้วบันทึกจริง", "ยังไม่มีบัญชีผู้ดูแลในระบบ");
    } else if (!target) {
      skip("นำเข้าค่าที่ถูกต้องแล้วบันทึกจริง", "ไม่มีนักกีฬาที่ยังว่างทั้งชื่อและรหัสพนักงาน");
    } else {
      const row = findRow(wsP, (r) => text(r.getCell(cUid).value) === target.participantUid);
      if (row === null) {
        check("หาแถวของนักกีฬาที่จะทดสอบเจอในไฟล์", false, target.participantUid);
      } else {
        const NAME = "ทดสอบ ระบบนำเข้า";
        const EMP = "VERIFY-0001";
        const actorId = actorAdmin.adminId;
        const auditMark = (await prisma.auditLog.aggregate({ _max: { id: true } }))._max.id ?? 0n;
        try {
          const res = await importDataEntryWorkbook(
            await mutate(buffer, [
              { sheet: SHEET.participants, row, col: cName, value: NAME },
              { sheet: SHEET.participants, row, col: cEmp, value: EMP },
              { sheet: SHEET.participants, row, col: cGender, value: "ชาย" },
            ]),
            { actorId },
          );
          check("ไฟล์ที่ถูกต้องผ่านการตรวจ", res.ok, JSON.stringify(res.issues.slice(0, 3)));
          check("บันทึก 1 รายการ", res.totalApplied === 1, `ได้ ${res.totalApplied}`);

          const saved = await prisma.participant.findUnique({ where: { participantUid: target.participantUid } });
          check("ชื่อที่บันทึกตรงกับที่กรอก", saved?.actualName === NAME, saved?.actualName ?? "ว่าง");
          check("รหัสพนักงานที่บันทึกตรงกับที่กรอก", saved?.employeeId === EMP, saved?.employeeId ?? "ว่าง");
          check("เพศที่บันทึกตรงกับที่กรอก", saved?.gender === "M", saved?.gender ?? "ว่าง");

          const audits = await prisma.auditLog.count({
            where: { entityId: target.participantUid, id: { gt: auditMark } },
          });
          check("มี audit log ของการนำเข้า", audits > 0, `พบ ${audits} รายการ`);

          // อ่านไฟล์เดิม (ที่ยังไม่มีค่าใหม่) ซ้ำ ต้องไม่ลบค่าที่เพิ่งบันทึก
          const again = await importDataEntryWorkbook(buffer, { actorId });
          const stillThere = await prisma.participant.findUnique({
            where: { participantUid: target.participantUid },
          });
          check("ช่องว่างในไฟล์ไม่ลบค่าที่มีอยู่", stillThere?.actualName === NAME && again.ok);
        } finally {
          await prisma.auditLog.deleteMany({ where: { id: { gt: auditMark } } });
          await prisma.participant.update({
            where: { participantUid: target.participantUid },
            data: {
              actualName: target.actualName,
              employeeId: target.employeeId,
              gender: target.gender,
              skillRank: target.skillRank,
              eligibilityChecked: target.eligibilityChecked,
            },
          });
          console.log(`  ↺ คืนค่าเดิมของ ${target.participantUid} และลบ audit log ที่สคริปต์สร้างแล้ว`);
        }
      }
    }
  }

  console.log("\n" + "─".repeat(70));
  if (failures === 0) {
    console.log(`ผ่านทั้งหมด ✓${skipped > 0 ? `  (ข้าม ${skipped} ข้อ)` : ""}\n`);
  } else {
    console.log(`ไม่ผ่าน ${failures} ข้อ\n`);
    process.exitCode = 1;
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
