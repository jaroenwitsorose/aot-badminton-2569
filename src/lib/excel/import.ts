/**
 * อ่านไฟล์ Excel ที่กรอกแล้วกลับเข้าระบบ
 *
 * หลักการที่ยึด:
 *   1. ตรวจทั้งไฟล์ให้จบก่อน ถ้ามีข้อผิดพลาดแม้ข้อเดียว จะไม่บันทึกอะไรเลย
 *      (ไฟล์ที่นำเข้าครึ่ง ๆ กลาง ๆ อันตรายกว่าไฟล์ที่นำเข้าไม่ได้)
 *   2. ช่องที่เว้นว่าง = ไม่แก้ ไม่ใช่ลบ — การลบค่าต้องทำผ่านหน้าเว็บ
 *      เพื่อกันกรณีเผลอลบทั้งคอลัมน์แล้วอัปโหลด
 *   3. ตรวจด้วยกติกาชุดเดียวกับหน้าเว็บ (ระดับมือ · เพศ vs ประเภท · ลำดับซอง)
 *      เพื่อไม่ให้ import เป็นทางลัดข้ามกติกา
 *   4. ตรวจกับ "สถานะหลังนำเข้า" ไม่ใช่สถานะปัจจุบัน — ผู้ใช้จึงกรอกเพศ ล็อกประเภท
 *      และจับสลาก มาในไฟล์เดียวกันได้
 */

// ไม่ใส่ "server-only" เพื่อให้สคริปต์ตรวจ (scripts/verify-excel.ts) เรียกได้ตรง ๆ
// ความปลอดภัยมาจากผู้เรียกฝั่งเซิร์ฟเวอร์ที่ตรวจสิทธิ์ก่อนเสมอ
import ExcelJS from "exceljs";
import type { EventType, Gender, Prisma, SkillRank } from "@prisma/client";
import { prisma } from "../prisma";
import { EVENT_TH } from "../labels";
import {
  validateEventGender,
  validateLineupOrder,
  validateSkillEligibility,
} from "../validation";
import {
  DRAW_COLUMNS,
  LINEUP_COLUMNS,
  PAIR_EVENT_COLUMNS,
  PARTICIPANT_COLUMNS,
  SHEET,
  eventToDb,
  genderToDb,
  normalizePersonName,
  pairUidFromChoice,
  skillRankToDb,
} from "./shared";

export interface ImportIssue {
  sheet: string;
  row: number | null;
  message: string;
}

export interface SheetSummary {
  sheet: string;
  present: boolean;
  applied: number;
  unchanged: number;
  notes: string[];
}

export interface ImportReport {
  ok: boolean;
  issues: ImportIssue[];
  summaries: SheetSummary[];
  totalApplied: number;
}

type Col = { key: string; header: string; editable: boolean };

/** อ่านค่าในเซลล์ให้ออกมาเป็นข้อความเสมอ ไม่ว่าจะเป็นตัวเลข สูตร หรือ rich text */
function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const v = value as unknown as Record<string, unknown>;
    if (Array.isArray(v.richText)) {
      return (v.richText as { text: string }[]).map((t) => t.text).join("").trim();
    }
    if ("text" in v) return String(v.text ?? "").trim();
    if ("result" in v) return cellText(v.result as ExcelJS.CellValue);
    if ("hyperlink" in v) return String(v.hyperlink ?? "").trim();
  }
  return String(value).trim();
}

const LEVEL_SHORT: Record<string, string> = { L1: "LEVEL1", L2: "LEVEL2", L3: "LEVEL3", L4: "LEVEL4" };

export async function importDataEntryWorkbook(
  buffer: ArrayBuffer,
  actor: { actorId: string; ip?: string | null; userAgent?: string | null },
): Promise<ImportReport> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const issues: ImportIssue[] = [];
  const summaries: SheetSummary[] = [];
  const add = (sheet: string, row: number | null, message: string) => issues.push({ sheet, row, message });

  const [pairs, participants, teams, levels, matches, draws, ties, lineups] = await Promise.all([
    prisma.pair.findMany(),
    prisma.participant.findMany(),
    prisma.team.findMany(),
    prisma.level.findMany(),
    prisma.match.findMany({
      select: { matchUid: true, sideASource: true, sideBSource: true, status: true, tieId: true },
    }),
    prisma.drawAssignment.findMany(),
    prisma.level4Tie.findMany(),
    prisma.level4Lineup.findMany(),
  ]);

  const pairById = new Map(pairs.map((p) => [p.pairUid, p]));
  const personById = new Map(participants.map((p) => [p.participantUid, p]));
  const teamName = new Map(teams.map((t) => [t.teamCode, t.nameTh]));
  const levelEvents = new Map(levels.map((l) => [l.levelCode, l.eventTypes.split(/[,/]/).map((s) => s.trim())]));
  const peopleOfPair = new Map<string, typeof participants>();
  for (const p of participants) {
    const list = peopleOfPair.get(p.pairUid) ?? [];
    list.push(p);
    peopleOfPair.set(p.pairUid, list);
  }

  /** ช่องในสายที่แมตช์เริ่มไปแล้ว — แก้ผลจับสลากไม่ได้ */
  const lockedTokens = new Set<string>();
  for (const m of matches) {
    if (m.status === "WAITING") continue;
    for (const src of [m.sideASource, m.sideBSource]) {
      if (src.startsWith("SEED:") || src.startsWith("GROUP:")) lockedTokens.add(src);
    }
  }
  const startedTies = new Set(matches.filter((m) => m.tieId && m.status !== "WAITING").map((m) => m.tieId!));

  // ───────── สถานะหลังนำเข้า (ใช้ตรวจข้ามชีต) ─────────
  type PersonPatch = { actualName?: string; skillRank?: SkillRank; gender?: Gender };
  const personPatch = new Map<string, PersonPatch>();
  const eventPatch = new Map<string, EventType>();
  const drawPatch = new Map<string, string>(); // token -> pairUid
  const lineupPatch = new Map<string, string[]>(); // `${tieId}|${teamCode}` -> [uid1,uid2,uid3]

  const finalGender = (uid: string): Gender | null =>
    personPatch.get(uid)?.gender ?? personById.get(uid)?.gender ?? null;
  const finalSkill = (uid: string): SkillRank | null =>
    personPatch.get(uid)?.skillRank ?? personById.get(uid)?.skillRank ?? null;
  const finalEvent = (pairUid: string): EventType | null =>
    eventPatch.get(pairUid) ?? pairById.get(pairUid)?.eventType ?? null;

  // ───────── ตรวจหัวตาราง ─────────
  function sheetOf(name: string, columns: readonly Col[]): ExcelJS.Worksheet | null {
    const ws = wb.getWorksheet(name);
    if (!ws) {
      summaries.push({ sheet: name, present: false, applied: 0, unchanged: 0, notes: ["ไม่มีชีตนี้ในไฟล์ — ข้ามไป"] });
      return null;
    }
    const header = ws.getRow(1);
    for (let i = 0; i < columns.length; i += 1) {
      const got = cellText(header.getCell(i + 1).value);
      if (got !== columns[i].header) {
        add(name, 1, `คอลัมน์ที่ ${i + 1} ควรเป็น "${columns[i].header}" แต่ในไฟล์เป็น "${got || "(ว่าง)"}" — อย่าแก้หรือสลับหัวตาราง`);
        return null;
      }
    }
    return ws;
  }

  const idxOf = (columns: readonly Col[], key: string) => columns.findIndex((c) => c.key === key) + 1;

  // ═════════ 1. รายชื่อนักกีฬา ═════════
  const wsP = sheetOf(SHEET.participants, PARTICIPANT_COLUMNS);
  if (wsP) {
    const c = {
      uid: idxOf(PARTICIPANT_COLUMNS, "participantUid"),
      name: idxOf(PARTICIPANT_COLUMNS, "actualName"),
      skill: idxOf(PARTICIPANT_COLUMNS, "skillRank"),
      gender: idxOf(PARTICIPANT_COLUMNS, "gender"),
    };
    const seenRows = new Map<string, number>();

    for (let r = 2; r <= wsP.rowCount; r += 1) {
      const row = wsP.getRow(r);
      const uid = cellText(row.getCell(c.uid).value);
      if (!uid) continue;

      const person = personById.get(uid);
      if (!person) {
        add(SHEET.participants, r, `ไม่พบรหัสนักกีฬา ${uid} ในระบบ`);
        continue;
      }
      const dup = seenRows.get(uid);
      if (dup) {
        add(SHEET.participants, r, `รหัสนักกีฬา ${uid} ซ้ำกับแถวที่ ${dup}`);
        continue;
      }
      seenRows.set(uid, r);

      const patch: PersonPatch = {};
      const name = cellText(row.getCell(c.name).value);
      if (name) patch.actualName = name;

      const skillRaw = cellText(row.getCell(c.skill).value);
      if (skillRaw) {
        const v = skillRankToDb(skillRaw);
        if (v === undefined) add(SHEET.participants, r, `ระดับมือ "${skillRaw}" ไม่อยู่ในรายการ (มือใหม่ / D / C / B- / B+ / A / S)`);
        else if (v) {
          const err = validateSkillEligibility(person.levelCode, v);
          if (err) add(SHEET.participants, r, err);
          else patch.skillRank = v as SkillRank;
        }
      }

      const genderRaw = cellText(row.getCell(c.gender).value);
      if (genderRaw) {
        const v = genderToDb(genderRaw);
        if (v === undefined) add(SHEET.participants, r, `เพศ "${genderRaw}" ต้องเป็น ชาย หรือ หญิง`);
        else if (v) patch.gender = v as Gender;
      }

      if (Object.keys(patch).length > 0) personPatch.set(uid, patch);
    }

    /*
     * คนเดียวกันลงได้คู่เดียวต่อ "ระดับมือ + ประเภท" (ลงข้ามประเภทได้)
     *
     * เดิมใช้รหัสพนักงานเป็นตัวเทียบว่าเป็นคนเดียวกัน แต่ช่องนั้นถูกเอาออกแล้ว
     * จึงเทียบด้วยชื่อที่ตัดคำนำหน้าและช่องว่างออก — เคยเจอของจริงที่คนหนึ่ง
     * ถูกใส่ไว้สองคู่ในคู่ผสมของระดับเดียวกัน ทำให้ต้องลงแข่งกับตัวเอง
     *
     * ตรวจกับสถานะหลังนำเข้า ไม่ใช่แค่แถวที่อยู่ในไฟล์
     */
    const slotOwner = new Map<string, string>();
    for (const p of participants) {
      const name = personPatch.get(p.participantUid)?.actualName ?? p.actualName;
      if (!name) continue;
      const pair = pairById.get(p.pairUid);
      if (!pair) continue;
      const event = finalEvent(p.pairUid);
      const key = `${normalizePersonName(name)}|${pair.levelCode}|${event ?? "ยังไม่ล็อกประเภท"}`;
      const prev = slotOwner.get(key);
      if (prev && prev !== p.participantUid) {
        const rowNo = seenRows.get(p.participantUid) ?? seenRows.get(prev) ?? null;
        add(
          SHEET.participants,
          rowNo,
          `"${name}" ถูกใส่ไว้มากกว่า 1 คู่ในระดับและประเภทเดียวกัน (${prev} กับ ${p.participantUid}) — 1 คนลงได้คู่เดียวต่อประเภท`,
        );
      } else if (!prev) {
        slotOwner.set(key, p.participantUid);
      }
    }
  }

  // ═════════ 2. ประเภทคู่ ═════════
  const wsE = sheetOf(SHEET.pairEvents, PAIR_EVENT_COLUMNS);
  if (wsE) {
    const cUid = idxOf(PAIR_EVENT_COLUMNS, "pairUid");
    const cEv = idxOf(PAIR_EVENT_COLUMNS, "eventTh");

    for (let r = 2; r <= wsE.rowCount; r += 1) {
      const row = wsE.getRow(r);
      const pairUid = cellText(row.getCell(cUid).value);
      if (!pairUid) continue;
      const pair = pairById.get(pairUid);
      if (!pair) {
        add(SHEET.pairEvents, r, `ไม่พบรหัสคู่ ${pairUid} ในระบบ`);
        continue;
      }
      const raw = cellText(row.getCell(cEv).value);
      if (!raw) continue;

      const ev = eventToDb(raw);
      if (ev === undefined) {
        add(SHEET.pairEvents, r, `ประเภท "${raw}" ต้องเป็น ชายคู่ / หญิงคู่ / คู่ผสม`);
        continue;
      }
      if (!ev) continue;

      if (pair.eventLockedAt && pair.eventType !== ev) {
        add(SHEET.pairEvents, r, `คู่ ${pairUid} ล็อกประเภทเป็น ${pair.eventType ? EVENT_TH[pair.eventType] : "-"} ไปแล้ว — เปลี่ยนที่หน้าเว็บเท่านั้น`);
        continue;
      }
      if (pair.levelCode === "LEVEL2" && ev === "MD") {
        add(SHEET.pairEvents, r, "มือ D ไม่มีประเภทชายคู่");
        continue;
      }
      const allowed = levelEvents.get(pair.levelCode);
      if (allowed && allowed.length > 0 && !allowed.includes(ev)) {
        add(SHEET.pairEvents, r, `ระดับนี้ไม่มีประเภท ${EVENT_TH[ev as EventType]}`);
        continue;
      }
      // ค่าเดิมอยู่แล้ว = ไม่ต้องทำอะไร — ดาวน์โหลดแล้วอัปโหลดกลับเฉย ๆ ต้องไม่เปลี่ยนสถานะใด ๆ
      // (ประเภทของมือใหม่ถูกกำหนดโดยโครงสาย ไม่ได้ตั้งใจให้ล็อกผ่าน Excel)
      if (pair.eventType === ev) continue;
      eventPatch.set(pairUid, ev as EventType);
    }

    // เพศต้องตรงกับประเภท และรหัสคู่สาธารณะห้ามซ้ำ — ตรวจกับสถานะหลังนำเข้า
    const codeOwner = new Map<string, string>();
    for (const pair of pairs) {
      const ev = finalEvent(pair.pairUid);
      if (!ev) continue;
      const people = peopleOfPair.get(pair.pairUid) ?? [];
      const err = validateEventGender(ev, people.map((p) => finalGender(p.participantUid)));
      if (err && eventPatch.has(pair.pairUid)) {
        add(SHEET.pairEvents, null, `คู่ ${pair.pairUid}: ${err}`);
      }
      const code = `${pair.levelCode}-${pair.teamCode}-${ev}-${String(pair.slotNo).padStart(2, "0")}`;
      const prev = codeOwner.get(code);
      if (prev) add(SHEET.pairEvents, null, `รหัสคู่ ${code} ซ้ำกันระหว่าง ${prev} กับ ${pair.pairUid}`);
      else codeOwner.set(code, pair.pairUid);
    }
  }

  // ═════════ 3. จับสลาก ═════════
  const wsD = sheetOf(SHEET.draw, DRAW_COLUMNS);
  const drawNotes: string[] = [];
  if (wsD) {
    const cToken = idxOf(DRAW_COLUMNS, "token");
    const cChoice = idxOf(DRAW_COLUMNS, "pairChoice");
    const currentByToken = new Map(draws.map((d) => [d.token, d.pairUid]));

    for (let r = 2; r <= wsD.rowCount; r += 1) {
      const row = wsD.getRow(r);
      const token = cellText(row.getCell(cToken).value);
      if (!token) continue;
      const raw = cellText(row.getCell(cChoice).value);
      if (!raw) continue;

      const pairUid = pairUidFromChoice(raw);
      if (!pairUid) continue;
      const pair = pairById.get(pairUid);
      if (!pair) {
        add(SHEET.draw, r, `ไม่พบคู่ ${pairUid} — ให้เลือกจากรายการในช่อง อย่าพิมพ์เอง`);
        continue;
      }
      if (currentByToken.get(token) === pairUid) continue; // เหมือนเดิม

      if (lockedTokens.has(token)) {
        drawNotes.push(`ช่อง ${token} มีแมตช์ที่เริ่มแข่งแล้ว — ข้ามให้`);
        continue;
      }

      const parts = token.split(":");
      const levelCode = LEVEL_SHORT[parts[1]];
      if (!levelCode) {
        add(SHEET.draw, r, `รหัสช่อง ${token} ไม่ถูกต้อง (ห้ามแก้คอลัมน์นี้)`);
        continue;
      }
      if (pair.levelCode !== levelCode) {
        add(SHEET.draw, r, `ช่องนี้เป็นของ ${levelCode} แต่คู่ที่เลือกอยู่ ${pair.levelCode}`);
        continue;
      }
      if (pair.withdrawn) {
        add(SHEET.draw, r, `คู่ ${pairUid} ถอนตัวแล้ว`);
        continue;
      }
      const ev = finalEvent(pairUid);
      if (!ev) {
        add(SHEET.draw, r, `คู่ ${pairUid} ยังไม่ได้ล็อกประเภท — กรอกในชีต ${SHEET.pairEvents} ก่อน`);
        continue;
      }
      if (parts[0] === "SEED" && ev !== parts[2]) {
        add(SHEET.draw, r, `ช่องนี้เป็นประเภท ${EVENT_TH[parts[2] as EventType] ?? parts[2]} แต่คู่ที่เลือกเป็น ${EVENT_TH[ev]}`);
        continue;
      }
      drawPatch.set(token, pairUid);
    }

    // หนึ่งคู่ลงได้ช่องเดียวต่อระดับ — ตรวจกับสถานะหลังนำเข้า (ค่าใหม่ทับค่าเดิมของช่องนั้น)
    const finalDraw = new Map(currentByToken);
    for (const [token, pairUid] of drawPatch) finalDraw.set(token, pairUid);

    const slotOwner = new Map<string, string>(); // `${levelCode}|${pairUid}` -> token
    for (const [token, pairUid] of finalDraw) {
      const levelCode = LEVEL_SHORT[token.split(":")[1]];
      const key = `${levelCode}|${pairUid}`;
      const prev = slotOwner.get(key);
      if (prev && prev !== token) {
        add(SHEET.draw, null, `คู่ ${pairUid} ถูกใส่ไว้สองช่องในระดับเดียวกัน (${prev} และ ${token})`);
      } else {
        slotOwner.set(key, token);
      }
    }
  }

  // ═════════ 4. ซองมือทั่วไป ═════════
  const wsL = sheetOf(SHEET.lineups, LINEUP_COLUMNS);
  const lineupNotes: string[] = [];
  if (wsL) {
    const cTie = idxOf(LINEUP_COLUMNS, "tieId");
    const cTeam = idxOf(LINEUP_COLUMNS, "teamNameTh");
    const cOrder = idxOf(LINEUP_COLUMNS, "orderNo");
    const cChoice = idxOf(LINEUP_COLUMNS, "pairChoice");

    const teamByName = new Map(teams.map((t) => [t.nameTh, t.teamCode]));
    const tieById = new Map(ties.map((t) => [t.tieId, t]));
    const currentLineup = new Map(lineups.map((l) => [`${l.tieId}|${l.teamCode}|${l.orderNo}`, l.pairUid]));
    const sealed = new Set(lineups.filter((l) => l.sealedAt).map((l) => `${l.tieId}|${l.teamCode}`));

    /** รวมค่าต่อ (คู่สี, สี) แล้วค่อยตรวจทีเดียว เพราะกติกาซองดูทั้ง 3 ลำดับพร้อมกัน */
    const collected = new Map<string, { rows: (number | null)[]; uids: (string | null)[]; touched: boolean; tieId: string; teamCode: string }>();

    for (let r = 2; r <= wsL.rowCount; r += 1) {
      const row = wsL.getRow(r);
      const tieId = cellText(row.getCell(cTie).value);
      if (!tieId) continue;
      const tie = tieById.get(tieId);
      if (!tie) {
        add(SHEET.lineups, r, `ไม่พบคู่สี ${tieId} ในระบบ`);
        continue;
      }
      const teamCode = teamByName.get(cellText(row.getCell(cTeam).value));
      if (!teamCode) {
        add(SHEET.lineups, r, `ไม่รู้จักสี "${cellText(row.getCell(cTeam).value)}" (ห้ามแก้คอลัมน์นี้)`);
        continue;
      }
      const orderNo = Number(cellText(row.getCell(cOrder).value));
      if (![1, 2, 3].includes(orderNo)) {
        add(SHEET.lineups, r, "ลำดับคู่ต้องเป็น 1, 2 หรือ 3 (ห้ามแก้คอลัมน์นี้)");
        continue;
      }

      const key = `${tieId}|${teamCode}`;
      const entry = collected.get(key) ?? {
        rows: [null, null, null],
        uids: [
          currentLineup.get(`${key}|1`) ?? null,
          currentLineup.get(`${key}|2`) ?? null,
          currentLineup.get(`${key}|3`) ?? null,
        ],
        touched: false,
        tieId,
        teamCode,
      };
      entry.rows[orderNo - 1] = r;

      const raw = cellText(row.getCell(cChoice).value);
      if (raw) {
        const pairUid = pairUidFromChoice(raw);
        if (pairUid && pairUid !== entry.uids[orderNo - 1]) {
          entry.uids[orderNo - 1] = pairUid;
          entry.touched = true;
        }
      }
      collected.set(key, entry);
    }

    for (const [key, entry] of collected) {
      if (!entry.touched) continue;
      const label = `${entry.tieId} · ${teamName.get(entry.teamCode) ?? entry.teamCode}`;
      const anyRow = entry.rows.find((r) => r !== null) ?? null;

      if (sealed.has(key)) {
        lineupNotes.push(`${label}: ซองเปิดแล้ว — ข้ามให้`);
        continue;
      }
      if (startedTies.has(entry.tieId)) {
        lineupNotes.push(`${label}: คู่สีนี้เริ่มแข่งแล้ว — ข้ามให้`);
        continue;
      }
      if (entry.uids.some((u) => !u)) {
        add(SHEET.lineups, anyRow, `${label}: ต้องกรอกให้ครบทั้ง 3 ลำดับ`);
        continue;
      }

      const uids = entry.uids as string[];
      const chosen = uids.map((u) => pairById.get(u));
      const missing = uids.filter((u) => !pairById.has(u));
      if (missing.length > 0) {
        add(SHEET.lineups, anyRow, `${label}: ไม่พบคู่ ${missing.join(", ")}`);
        continue;
      }
      if (chosen.some((p) => p!.levelCode !== "LEVEL4")) {
        add(SHEET.lineups, anyRow, `${label}: ต้องเป็นคู่ของมือทั่วไปเท่านั้น`);
        continue;
      }
      if (chosen.some((p) => p!.teamCode !== entry.teamCode)) {
        add(SHEET.lineups, anyRow, `${label}: ต้องเป็นคู่ของสีเดียวกันทั้งหมด`);
        continue;
      }
      if (chosen.some((p) => p!.withdrawn)) {
        add(SHEET.lineups, anyRow, `${label}: มีคู่ที่ถอนตัวอยู่ในรายชื่อ`);
        continue;
      }
      const orderError = validateLineupOrder(
        uids.map((uid) => ({
          pairUid: uid,
          ranks: (peopleOfPair.get(uid) ?? []).map((p) => finalSkill(p.participantUid)),
        })),
      );
      if (orderError) {
        add(SHEET.lineups, anyRow, `${label}: ${orderError}`);
        continue;
      }
      lineupPatch.set(key, uids);
    }
  }

  // ───────── มีข้อผิดพลาด = ไม่บันทึกอะไรเลย ─────────
  if (issues.length > 0) {
    return { ok: false, issues, summaries, totalApplied: 0 };
  }

  // ───────── บันทึกทั้งหมดในทรานแซกชันเดียว ─────────
  const auditRows: Prisma.AuditLogCreateManyInput[] = [];
  const audit = (action: string, entityType: string, entityId: string, before: unknown, after: unknown) => {
    auditRows.push({
      actorId: actor.actorId,
      action,
      entityType,
      entityId,
      beforeJson: (before ?? null) as Prisma.InputJsonValue,
      afterJson: (after ?? null) as Prisma.InputJsonValue,
      ip: actor.ip ?? null,
      userAgent: actor.userAgent ?? null,
    });
  };

  let appliedPeople = 0;
  let appliedEvents = 0;
  let appliedDraws = 0;
  let appliedLineups = 0;

  await prisma.$transaction(
    async (tx) => {
      // 1. รายชื่อ
      for (const [uid, patch] of personPatch) {
        const before = personById.get(uid)!;
        const after = {
          actualName: patch.actualName ?? before.actualName,
          skillRank: patch.skillRank ?? before.skillRank,
          gender: patch.gender ?? before.gender,
        };
        const same =
          after.actualName === before.actualName &&
          after.skillRank === before.skillRank &&
          after.gender === before.gender;
        if (same) continue;

        await tx.participant.update({
          where: { participantUid: uid },
          data: {
            ...after,
            eligibilityChecked: Boolean(after.actualName && after.skillRank && after.gender),
          },
        });
        audit(
          "PARTICIPANT_UPDATE",
          "participant",
          uid,
          { actualName: before.actualName, skillRank: before.skillRank, gender: before.gender },
          { ...after, source: "EXCEL_IMPORT" },
        );
        appliedPeople += 1;
      }

      // 2. ล็อกประเภทคู่
      for (const [pairUid, ev] of eventPatch) {
        const pair = pairById.get(pairUid)!;
        const publicPairCode = `${pair.levelCode}-${pair.teamCode}-${ev}-${String(pair.slotNo).padStart(2, "0")}`;
        await tx.pair.update({
          where: { pairUid },
          data: { eventType: ev, publicPairCode, eventLockedAt: new Date() },
        });
        await tx.participant.updateMany({ where: { pairUid }, data: { eventType: ev } });
        for (const person of peopleOfPair.get(pairUid) ?? []) {
          await tx.participant.update({
            where: { participantUid: person.participantUid },
            data: {
              displayCode: `${teamName.get(pair.teamCode) ?? pair.teamCode}_${pair.levelCode}_${ev}_${pair.slotNo}-${person.playerNo}`,
            },
          });
        }
        audit(
          "PAIR_EVENT_LOCK",
          "pair",
          pairUid,
          { eventType: pair.eventType, publicPairCode: pair.publicPairCode },
          { eventType: ev, publicPairCode, source: "EXCEL_IMPORT" },
        );
        appliedEvents += 1;
      }

      // 3. จับสลาก
      for (const [token, pairUid] of drawPatch) {
        const parts = token.split(":");
        const levelCode = LEVEL_SHORT[parts[1]];
        const before = draws.find((d) => d.token === token) ?? null;
        // คู่นี้อาจเคยถูกจัดไว้ช่องอื่นในระดับเดียวกัน ต้องเอาออกก่อน (unique [levelCode, pairUid])
        await tx.drawAssignment.deleteMany({
          where: { levelCode, pairUid, token: { not: token } },
        });
        await tx.drawAssignment.upsert({
          where: { token },
          update: { pairUid, assignedBy: actor.actorId, assignedAt: new Date() },
          create: {
            token,
            levelCode,
            groupKey: parts[0] === "GROUP" ? parts[2] : null,
            slotNo: parts[0] === "GROUP" ? Number(parts[3].replace("SLOT", "")) : Number(parts[3]),
            pairUid,
            assignedBy: actor.actorId,
          },
        });
        audit("DRAW_ASSIGN", "draw_assignment", token, before ? { pairUid: before.pairUid } : null, {
          pairUid,
          source: "EXCEL_IMPORT",
        });
        appliedDraws += 1;
      }

      // 4. ซองมือทั่วไป
      for (const [key, uids] of lineupPatch) {
        const [tieId, teamCode] = key.split("|");
        const before = lineups
          .filter((l) => l.tieId === tieId && l.teamCode === teamCode)
          .map((l) => ({ orderNo: l.orderNo, pairUid: l.pairUid }));
        await tx.level4Lineup.deleteMany({ where: { tieId, teamCode } });
        await tx.level4Lineup.createMany({
          data: uids.map((pairUid, i) => ({ tieId, teamCode, orderNo: i + 1, pairUid })),
        });
        audit("LINEUP_SUBMIT", "level4_lineup", key, before, {
          lineup: uids.map((pairUid, i) => ({ orderNo: i + 1, pairUid })),
          source: "EXCEL_IMPORT",
        });
        appliedLineups += 1;
      }

      if (auditRows.length > 0) await tx.auditLog.createMany({ data: auditRows });
    },
    { timeout: 60000, maxWait: 15000 },
  );

  const put = (sheet: string, applied: number, seen: number, notes: string[]) => {
    const i = summaries.findIndex((s) => s.sheet === sheet);
    const summary: SheetSummary = { sheet, present: true, applied, unchanged: Math.max(seen - applied, 0), notes };
    if (i >= 0) summaries[i] = summary;
    else summaries.push(summary);
  };
  if (wsP) put(SHEET.participants, appliedPeople, personPatch.size, []);
  if (wsE) put(SHEET.pairEvents, appliedEvents, eventPatch.size, []);
  if (wsD) put(SHEET.draw, appliedDraws, drawPatch.size, drawNotes);
  if (wsL) put(SHEET.lineups, appliedLineups, lineupPatch.size, lineupNotes);

  return {
    ok: true,
    issues: [],
    summaries,
    totalApplied: appliedPeople + appliedEvents + appliedDraws + appliedLineups,
  };
}
