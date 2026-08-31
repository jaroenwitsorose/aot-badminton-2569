/**
 * ตรวจตารางแข่งกับ "Concept" ที่เจ้าของงานวางไว้
 *
 *   npx tsx scripts/check-concept.ts                      ตรวจ data/seed-data.json
 *   npx tsx scripts/check-concept.ts <ไฟล์.xlsx>          ตรวจไฟล์ Excel (ชีต "ตารางแข่งขัน")
 *
 * แยกเป็นสองชั้น
 *   ก. ข้อบังคับ — ผิดแล้วแข่งไม่ได้จริง (คอร์ตชน · คนลงสองที่พร้อมกัน · ลำดับสาย)
 *   ข. Concept   — ผิดแล้วยังแข่งได้ แต่ไม่ตรงเจตนาที่ออกแบบไว้
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import ExcelJS from "exceljs";

const here = path.dirname(fileURLToPath(import.meta.url));
const xlsxArg = process.argv.slice(2).find((a) => a.endsWith(".xlsx"));

interface Row {
  no: number;
  day: number;
  start: string;
  end: string;
  court: number;
  level: string;
  event: string;
  round: string;
  sideA: string;
  sideB: string;
  code: string;
}

const LEVEL_TH: Record<string, string> = {
  LEVEL1: "มือใหม่",
  LEVEL2: "มือ D",
  LEVEL3: "มือ C",
  LEVEL4: "มือทั่วไป",
};
const EVENT_TH: Record<string, string> = { MD: "ชายคู่", WD: "หญิงคู่", XD: "คู่ผสม" };

async function load(): Promise<Row[]> {
  if (xlsxArg) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(xlsxArg);
    const ws = wb.getWorksheet("ตารางแข่งขัน");
    if (!ws) throw new Error('ไม่พบชีต "ตารางแข่งขัน" ในไฟล์');
    const out: Row[] = [];
    for (let r = 2; r <= ws.rowCount; r += 1) {
      const v = (i: number) => String(ws.getRow(r).getCell(i).value ?? "").trim();
      if (!v(1)) continue;
      out.push({
        no: Number(v(1)),
        day: Number(v(2).replace(/\D/g, "")),
        start: v(3),
        end: v(4),
        court: Number(v(5)),
        level: v(6),
        event: v(7) === "—" ? "" : v(7),
        round: v(8),
        sideA: v(9),
        sideB: v(10),
        code: v(11),
      });
    }
    return out.sort((a, b) => a.no - b.no);
  }
  const seed = JSON.parse(readFileSync(path.join(here, "..", "data", "seed-data.json"), "utf-8"));
  return seed.matches
    .map((m: Record<string, unknown>) => ({
      no: m.matchNo as number,
      day: m.dayNo as number,
      start: m.startTime as string,
      end: m.endTime as string,
      court: m.courtNo as number,
      level: LEVEL_TH[m.levelCode as string],
      event: m.eventType ? EVENT_TH[m.eventType as string] : "",
      round: m.roundLabel as string,
      sideA: m.sideASource as string,
      sideB: m.sideBSource as string,
      code: m.sourceMatchCode as string,
    }))
    .sort((a: Row, b: Row) => a.no - b.no);
}

// ───────────────────────── ตัวช่วย ─────────────────────────
const mins = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};
let fails = 0;
let warns = 0;
function head(t: string) {
  console.log(`\n${t}`);
  console.log("─".repeat(74));
}
function ok(label: string) {
  console.log(`  ✓ ${label}`);
}
function bad(label: string, detail = "", hard = true) {
  console.log(`  ${hard ? "✗" : "!"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (hard) fails += 1;
  else warns += 1;
}
function check(label: string, pass: boolean, detail = "", hard = true) {
  if (pass) ok(label);
  else bad(label, detail, hard);
}

async function main() {
  const M = await load();
  const days = [...new Set(M.map((m) => m.day))].sort();
  const slotKey = (m: Row) => `${m.day}|${m.start}`;
  const slots = [...new Set(M.map(slotKey))].sort((a, b) => {
    const [d1, t1] = a.split("|");
    const [d2, t2] = b.split("|");
    return Number(d1) - Number(d2) || mins(t1) - mins(t2);
  });
  const idx = new Map(slots.map((s, i) => [s, i]));
  const at = (m: Row) => idx.get(slotKey(m))!;
  const byCode = new Map(M.map((m) => [m.code, m]));
  const isMorning = (m: Row) => mins(m.start) < 12 * 60;

  console.log(`\nตรวจตารางแข่ง: ${xlsxArg ?? "data/seed-data.json"}`);
  console.log(`${M.length} นัด · ${days.length} วัน`);

  // ═════════ ก. ข้อบังคับ ═════════
  head("ก. ข้อบังคับ — ผิดแล้วแข่งไม่ได้จริง");

  const courtSeen = new Map<string, number>();
  const clashes: string[] = [];
  for (const m of M) {
    const k = `${slotKey(m)}|${m.court}`;
    if (courtSeen.has(k)) clashes.push(`${k} (#${courtSeen.get(k)} กับ #${m.no})`);
    else courtSeen.set(k, m.no);
  }
  check("ไม่มีสองนัดลงคอร์ตเดียวกันในเวลาเดียวกัน", clashes.length === 0, clashes.slice(0, 3).join(" · "));

  // คู่เดียวกันลงสองคอร์ตพร้อมกัน — ดูจากป้ายฝั่งที่ผูกกับคู่จริงแล้ว
  const fixed = (s: string) =>
    /^(SEED|GROUP|LINEUP):/.test(s) || /(คู่ที่ \d|สาย \d|กลุ่ม [A-D] คู่ที่ \d)/.test(s);
  const tokenSeen = new Map<string, number>();
  const dbl: string[] = [];
  for (const m of M) {
    for (const s of [m.sideA, m.sideB]) {
      if (!fixed(s)) continue;
      const k = `${slotKey(m)}|${s}`;
      if (tokenSeen.has(k)) dbl.push(`${s} @ ${slotKey(m)} (#${tokenSeen.get(k)}, #${m.no})`);
      else tokenSeen.set(k, m.no);
    }
  }
  check("ไม่มีคู่ไหนถูกจัดให้ลงสองคอร์ตพร้อมกัน", dbl.length === 0, dbl.slice(0, 3).join(" · "));

  // ลำดับสาย + เวลาพัก
  const order: string[] = [];
  const rest: string[] = [];
  for (const m of M) {
    const refs: Row[] = [];
    for (const s of [m.sideA, m.sideB]) {
      const w = /ผู้(?:ชนะ|แพ้)นัดที่ (\d+)/.exec(s);
      if (w) {
        const r = M.find((x) => x.no === Number(w[1]));
        if (r) refs.push(r);
      }
      const t = /^(WINNER|LOSER):(.+)$/.exec(s);
      if (t && byCode.has(t[2])) refs.push(byCode.get(t[2])!);
    }
    for (const r of refs) {
      const gap = at(m) - at(r);
      if (gap <= 0) order.push(`#${m.no} ต้องอยู่หลัง #${r.no}`);
      else if (gap < 2) rest.push(`#${r.no} → #${m.no} ห่างแค่ ${gap} ช่วง`);
    }
  }
  check("ทุกนัดอยู่หลังนัดที่ผลต่อกัน", order.length === 0, order.slice(0, 3).join(" · "));
  check("พักอย่างน้อย 30 นาทีก่อนลงรอบถัดไป", rest.length === 0, rest.slice(0, 3).join(" · "));

  // ═════════ ข. Concept คอร์ต ═════════
  head("ข. Concept คอร์ต — C1,5 มือใหม่ · C2,4 มือ C/D · C3 มือทั่วไป");
  const want: Record<string, number[]> = {
    "มือใหม่": [1, 5],
    "มือ D": [2, 4],
    "มือ C": [2, 4],
    "มือทั่วไป": [3],
  };
  for (const [lv, courts] of Object.entries(want)) {
    const wrong = M.filter((m) => m.level === lv && !courts.includes(m.court));
    const total = M.filter((m) => m.level === lv).length;
    check(
      `${lv} ลงเฉพาะคอร์ต ${courts.join(",")}`,
      wrong.length === 0,
      `หลุด ${wrong.length}/${total} นัด (เช่น #${wrong.slice(0, 4).map((m) => `${m.no}@C${m.court}`).join(", #")})`,
      false,
    );
  }
  // ความจุที่ concept นี้ต้องการ
  console.log("");
  for (const [lv, courts] of Object.entries(want)) {
    if (lv === "มือ C") continue;
    const n = M.filter((m) => (lv === "มือ D" ? m.level === "มือ D" || m.level === "มือ C" : m.level === lv)).length;
    const cap = slots.length * courts.length;
    const label = lv === "มือ D" ? "มือ C + มือ D" : lv;
    console.log(
      `    ${label.padEnd(14)} ต้องลง ${String(n).padStart(3)} นัด · มี ${courts.length} คอร์ต × ${slots.length} ช่วง = ${cap} ช่อง ${n <= cap ? "พอ" : `ไม่พอ ขาด ${n - cap}`}`,
    );
  }

  // ═════════ ค. Concept วันที่ 1 ═════════
  head("ค. Concept วันที่ 1");
  const d1 = M.filter((m) => m.day === 1);
  const l1r16 = (ev: string) => d1.filter((m) => m.level === "มือใหม่" && m.event === ev && m.round.includes("16"));
  for (const ev of ["ชายคู่", "หญิงคู่"]) {
    const list = l1r16(ev);
    const pm = list.filter((m) => !isMorning(m));
    check(
      `มือใหม่ ${ev} รอบ 16 คู่ อยู่ช่วงเช้าเป็นหลัก`,
      list.length > 0 && pm.length <= 2,
      list.length === 0 ? "ไม่พบในวันที่ 1" : `หลุดไปบ่าย ${pm.length} นัด (#${pm.map((m) => m.no).join(", #")})`,
      false,
    );
  }
  const xd16 = l1r16("คู่ผสม");
  const xdAm = xd16.filter(isMorning);
  check(
    "มือใหม่ คู่ผสม รอบ 16 คู่ อยู่ช่วงบ่ายทั้งหมด",
    xd16.length > 0 && xdAm.length === 0,
    xd16.length === 0 ? "ไม่พบในวันที่ 1" : `อยู่ช่วงเช้า ${xdAm.length} นัด (#${xdAm.map((m) => m.no).join(", #")})`,
    false,
  );

  // มือ C/D กลุ่มเดียวกันต้องลงพร้อมกัน (กันล็อกผล)
  const groupOf = (m: Row) => {
    const g = /กลุ่ม ([A-D])/.exec(m.round);
    const r = /รอบ (\d)/.exec(m.round);
    return g && r ? `${m.level}|${g[1]}|${r[1]}` : null;
  };
  const notSimul: string[] = [];
  const groups = new Map<string, Row[]>();
  for (const m of M) {
    const k = groupOf(m);
    if (!k) continue;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(m);
  }
  for (const [k, list] of groups) {
    if (list.length < 2) continue;
    if (new Set(list.map(slotKey)).size > 1) {
      notSimul.push(`${k} (${list.map((m) => `#${m.no}@${m.start}`).join(" ")})`);
    }
  }
  check(
    "มือ C/D: รอบเดียวกันของกลุ่มเดียวกันลงพร้อมกัน (กันล็อกผล)",
    notSimul.length === 0,
    `ไม่พร้อมกัน ${notSimul.length} ชุด — ${notSimul.slice(0, 2).join(" · ")}`,
    false,
  );

  // มือ C/D แต่ละคู่ลงกี่นัดต่อวัน
  for (const day of days) {
    for (const lv of ["มือ D", "มือ C"]) {
      const per = new Map<string, number>();
      for (const m of M.filter((x) => x.day === day && x.level === lv)) {
        for (const s of [m.sideA, m.sideB]) {
          if (!/กลุ่ม [A-D] คู่ที่ \d/.test(s) && !/^GROUP:/.test(s)) continue;
          per.set(s, (per.get(s) ?? 0) + 1);
        }
      }
      if (per.size === 0) continue;
      const counts = [...new Set(per.values())].sort();
      const target = day === 3 ? null : 2;
      const pass = target === null || counts.every((c) => c === target);
      check(
        `วันที่ ${day} · ${lv} แต่ละคู่ลง ${target ?? "?"} นัด`,
        pass,
        `พบ ${counts.join(", ")} นัด/คู่`,
        false,
      );
    }
  }

  // มือทั่วไป แบ่งเช้า-บ่าย
  const l4d1 = d1.filter((m) => m.level === "มือทั่วไป");
  check(
    "วันที่ 1 · มือทั่วไป มีทั้งช่วงเช้าและช่วงบ่าย",
    l4d1.some(isMorning) && l4d1.some((m) => !isMorning(m)),
    `เช้า ${l4d1.filter(isMorning).length} · บ่าย ${l4d1.filter((m) => !isMorning(m)).length}`,
    false,
  );

  // ═════════ ง. Concept วันที่ 2 ═════════
  head("ง. Concept วันที่ 2");
  const d2 = M.filter((m) => m.day === 2);
  const l1round = (day: number, ev: string, key: string) =>
    M.filter((m) => m.day === day && m.level === "มือใหม่" && m.event === ev && m.round.includes(key));

  for (const [key, label] of [["ก่อนรอง", "รอบ 8 คู่"], ["รองชนะเลิศ", "รอบ 4 คู่"]] as const) {
    const md = l1round(2, "ชายคู่", key);
    const wd = l1round(2, "หญิงคู่", key);
    const xd = l1round(2, "คู่ผสม", key);
    if (md.length === 0 && wd.length === 0) continue;
    const mdEnd = Math.max(...[...md, ...wd].map((m) => at(m)));
    const xdStart = xd.length ? Math.min(...xd.map((m) => at(m))) : null;
    const needGap = key === "ก่อนรอง" ? 1 : 2; // 30 นาที / 1 ชั่วโมง
    check(
      `มือใหม่ ${label}: คู่ผสมลงหลังชายคู่/หญิงคู่ และเว้น ${needGap === 1 ? "30 นาที" : "1 ชั่วโมง"}`,
      xdStart !== null && xdStart - mdEnd >= needGap,
      xdStart === null ? "ไม่พบคู่ผสมในวันที่ 2" : `ห่าง ${xdStart - mdEnd} ช่วง`,
      false,
    );
    if (xdStart !== null && xdStart - mdEnd >= 1) {
      const between = M.filter((m) => at(m) > mdEnd && at(m) < xdStart && (m.level === "มือ C" || m.level === "มือ D"));
      check(`   มีนัดมือ C/D มาคั่นระหว่างนั้น`, between.length > 0, `คั่น ${between.length} นัด`, false);
    }
  }

  const grpD2 = d2.filter((m) => m.round.includes("กลุ่ม"));
  check(
    "วันที่ 2 · มือ C/D จบรอบแบ่งกลุ่มภายในช่วงเช้า",
    grpD2.length > 0 && grpD2.every(isMorning),
    grpD2.length === 0 ? "ไม่พบรอบแบ่งกลุ่มในวันที่ 2" : `มี ${grpD2.filter((m) => !isMorning(m)).length} นัดอยู่ช่วงบ่าย`,
    false,
  );

  const ko2 = d2.filter((m) => (m.level === "มือ C" || m.level === "มือ D") && !m.round.includes("กลุ่ม"));
  const upper = ko2.filter((m) => m.round.includes("สายบน") || m.sideA.includes("อันดับ 1") || m.sideA.includes("อันดับ 2"));
  const lower = ko2.filter((m) => m.round.includes("สายล่าง") || m.sideA.includes("อันดับ 3") || m.sideA.includes("อันดับ 4"));
  check(
    "วันที่ 2 · มือ C/D เริ่มรอบน็อกเอาต์ในช่วงบ่าย",
    ko2.length > 0 && ko2.every((m) => !isMorning(m)),
    ko2.length === 0 ? "ไม่มีรอบน็อกเอาต์ในวันที่ 2" : `มี ${ko2.filter(isMorning).length} นัดอยู่ช่วงเช้า`,
    false,
  );
  if (upper.length && lower.length) {
    check(
      "วันที่ 2 · สายบนแข่งก่อนสายล่าง",
      Math.max(...upper.map(at)) <= Math.min(...lower.map(at)),
      `สายบนจบช่วง ${Math.max(...upper.map(at))} · สายล่างเริ่มช่วง ${Math.min(...lower.map(at))}`,
      false,
    );
  }
  const deepD2 = ko2.filter((m) => m.round.includes("รองชนะเลิศ") || m.round.includes("ชิง"));
  check(
    "วันที่ 2 · มือ C/D จบแค่รอบ 8 คู่ (ไม่เลยไปรอบลึกกว่านั้น)",
    deepD2.length === 0,
    `เลยไป ${deepD2.length} นัด (#${deepD2.slice(0, 4).map((m) => m.no).join(", #")})`,
    false,
  );

  const l4d2 = d2.filter((m) => m.level === "มือทั่วไป");
  const rr3 = l4d2.filter((m) => m.round.includes("รอบ 3"));
  const koL4 = l4d2.filter((m) => !m.round.includes("พบกันหมด"));
  check("วันที่ 2 · มือทั่วไป แข่งนัดที่ 3 ของแต่ละสีช่วงเช้า", rr3.length > 0 && rr3.every(isMorning), `${rr3.length} นัด`, false);
  check("วันที่ 2 · มือทั่วไป เริ่มรอบน็อกเอาต์ช่วงบ่าย", koL4.length > 0 && koL4.every((m) => !isMorning(m)), `${koL4.length} นัด`, false);

  // ═════════ จ. Concept วันที่ 3 ═════════
  head("จ. Concept วันที่ 3");
  const d3 = M.filter((m) => m.day === 3);
  const third = d3.filter((m) => m.level === "มือใหม่" && m.round.includes("ชิงอันดับ 3"));
  const finals = d3.filter((m) => m.level === "มือใหม่" && m.round.includes("ชิงชนะเลิศ"));
  check("วันที่ 3 · มือใหม่ ชิงอันดับ 3 อยู่ช่วงเช้า", third.length > 0 && third.every(isMorning), `${third.length} นัด`, false);
  check("วันที่ 3 · มือใหม่ ชิงชนะเลิศ อยู่ช่วงบ่าย", finals.length > 0 && finals.every((m) => !isMorning(m)), `${finals.length} นัด`, false);
  const fMd = finals.filter((m) => m.event !== "คู่ผสม");
  const fXd = finals.filter((m) => m.event === "คู่ผสม");
  if (fMd.length && fXd.length) {
    check(
      "วันที่ 3 · ชิงชนะเลิศคู่ผสมอยู่หลังชายคู่/หญิงคู่",
      Math.min(...fXd.map(at)) > Math.max(...fMd.map(at)),
      `ชายคู่/หญิงคู่ช่วง ${fMd.map(at).join(",")} · คู่ผสมช่วง ${fXd.map(at).join(",")}`,
      false,
    );
  }
  const sf3 = d3.filter((m) => (m.level === "มือ C" || m.level === "มือ D") && m.round.includes("รองชนะเลิศ"));
  const fin3 = d3.filter((m) => (m.level === "มือ C" || m.level === "มือ D") && m.round.includes("ชิง"));
  check("วันที่ 3 · มือ C/D รอบ 4 ทีม อยู่ช่วงเช้า", sf3.length > 0 && sf3.every(isMorning), `${sf3.length} นัด · เช้า ${sf3.filter(isMorning).length}`, false);
  check("วันที่ 3 · มือ C/D ชิงอันดับ 3 และชิงชนะเลิศ อยู่ช่วงบ่าย", fin3.length > 0 && fin3.every((m) => !isMorning(m)), `${fin3.length} นัด · บ่าย ${fin3.filter((m) => !isMorning(m)).length}`, false);
  const l4f = d3.filter((m) => m.level === "มือทั่วไป" && m.round.includes("ชิงชนะเลิศ"));
  check("วันที่ 3 · มือทั่วไป ชิงชนะเลิศ อยู่ช่วงบ่าย", l4f.length > 0 && l4f.every((m) => !isMorning(m)), `${l4f.length} นัด`, false);

  console.log("\n" + "─".repeat(74));
  console.log(`ข้อบังคับ: ${fails === 0 ? "ผ่านทั้งหมด ✓" : `ไม่ผ่าน ${fails} ข้อ ✗`}`);
  console.log(`Concept  : ${warns === 0 ? "ตรงทั้งหมด ✓" : `ไม่ตรง ${warns} ข้อ`}\n`);
  if (fails > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
