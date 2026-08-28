/**
 * ตรวจไฟล์ .xlsx ที่เพิ่งสร้าง ว่า Excel จะเปิดได้จริงไหม
 *
 * มีไฟล์นี้เพราะเคยส่งไฟล์เสียออกไปแล้วครั้งหนึ่ง — exceljs เขียน
 * `<pane state="frozen"/>` ที่ไม่มีค่า split ให้ (มาจากการสั่ง ySplit: 0)
 * ซึ่งผิดสเปก OOXML แล้ว Excel ขึ้นกล่อง "พบปัญหากับเนื้อหาบางอย่าง"
 *
 * ตัวอ่านไฟล์ทั่วไป (openpyxl, exceljs เอง) ยอมรับไฟล์แบบนี้โดยไม่บ่น
 * จึงจับไม่ได้ถ้าไม่แกะ XML ออกมาดูตรง ๆ
 */

import { readFileSync } from "node:fs";
import JSZip from "jszip";

const PANE_TAG = /<pane\b[^>]*>/g;
const X_SPLIT = /xSplit="(\d+)"/;
const Y_SPLIT = /ySplit="(\d+)"/;
const UNIQUE_COUNT = /uniqueCount="(\d+)"/;
const SI_TAG = /<si>/g;

export async function validateXlsx(file: string): Promise<string[]> {
  const zip = await JSZip.loadAsync(readFileSync(file));
  const problems: string[] = [];

  for (const name of Object.keys(zip.files)) {
    if (zip.files[name].dir) continue;
    if (!name.endsWith(".xml") && !name.endsWith(".rels")) continue;
    const xml = await zip.files[name].async("string");

    // ไฟล์ที่เขียนไม่จบจะไม่ปิดท้ายด้วยแท็ก
    if (!xml.trimEnd().endsWith(">")) {
      problems.push(`${name}: XML ไม่จบด้วยแท็กปิด`);
    }

    // pane ที่ตรึงหน้าจอต้องมี xSplit หรือ ySplit มากกว่า 0 อย่างน้อยหนึ่งอัน
    for (const pane of xml.match(PANE_TAG) ?? []) {
      const x = Number(X_SPLIT.exec(pane)?.[1] ?? 0);
      const y = Number(Y_SPLIT.exec(pane)?.[1] ?? 0);
      if (x === 0 && y === 0) {
        problems.push(`${name}: ${pane} ไม่มีค่า split — Excel จะฟ้องว่าไฟล์เสีย`);
      }
    }
  }

  const shared = zip.files["xl/sharedStrings.xml"];
  if (shared) {
    const xml = await shared.async("string");
    const declared = Number(UNIQUE_COUNT.exec(xml)?.[1] ?? -1);
    const actual = (xml.match(SI_TAG) ?? []).length;
    if (declared !== actual) {
      problems.push(`xl/sharedStrings.xml: แจ้ง uniqueCount=${declared} แต่มีจริง ${actual}`);
    }
  }

  for (const required of ["[Content_Types].xml", "xl/workbook.xml", "_rels/.rels"]) {
    if (!zip.files[required]) problems.push(`ขาดไฟล์ที่จำเป็น: ${required}`);
  }

  return problems;
}
