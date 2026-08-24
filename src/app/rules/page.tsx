"use client";

import { useSnapshot } from "@/components/snapshot-provider";
import { LevelChip, SectionHeading } from "@/components/ui";

export default function RulesPage() {
  const { snapshot } = useSnapshot();
  const { tournament, levels } = snapshot;

  return (
    <main>
      <section className="page-hero">
        <div className="shell">
          <p className="eyebrow">RULES &amp; FORMAT</p>
          <h1>กติกาและรูปแบบการแข่งขัน</h1>
          <p>
            สรุปกติกาที่ใช้ตัดสินจริงในระบบ — ทั้งรูปแบบของแต่ละระดับมือ การนับคะแนนสี
            และเกณฑ์ตัดสินเมื่อผลเสมอกัน
          </p>
        </div>
      </section>

      <div className="page-shell shell">
        <SectionHeading eyebrow="FORMAT" title="รูปแบบของแต่ละระดับมือ" />
        <div className="level-grid" style={{ marginBottom: 34 }}>
          {levels.map((level) => (
            <article className="level-card" key={level.levelCode}>
              <LevelChip levelCode={level.levelCode} nameTh={level.nameTh} />
              <h3>{level.format}</h3>
              <p>คุณสมบัติ: {level.eligibility}</p>
              <dl>
                <div>
                  <dt>คู่แข่งขัน</dt>
                  <dd>{level.pairSlots} คู่</dd>
                </div>
                <div>
                  <dt>จำนวนแมตช์</dt>
                  <dd className="tabular">{level.matchCount}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>

        <SectionHeading eyebrow="MATCH RULES" title="กติกาการแข่งขัน" />
        <div className="rules-grid">
          <article className="rule-card">
            <h2>การนับคะแนนในแมตช์</h2>
            <ul>
              <li>แข่งแบบ Best of 3 เกม ฝ่ายที่ชนะครบ 2 เกมเป็นผู้ชนะแมตช์</li>
              <li>ชนะเกมที่ 21 แต้ม แต่ต้องห่างกันอย่างน้อย 2 แต้ม</li>
              <li>ถ้าไล่กันถึง 29 เท่า ฝ่ายที่ถึง 30 ก่อนเป็นผู้ชนะเกมนั้น</li>
              <li>เกมที่ 3 จะเกิดขึ้นเมื่อผลเสมอกัน 1-1 เท่านั้น</li>
            </ul>
          </article>

          <article className="rule-card">
            <h2>การรายงานตัวและ Walkover</h2>
            <ul>
              <li>มาถึงสนามก่อนเวลาแข่งขัน {tournament.reportingMinutesBefore} นาที</li>
              <li>ไม่มารายงานตัวภายใน {tournament.walkoverGraceMinutes} นาทีหลังเวลาแข่ง ถือเป็น Walkover</li>
              <li>Walkover บันทึกผลเป็น {tournament.walkoverScore} ให้ฝ่ายที่มาแข่งขัน</li>
              <li>ทุกครั้งที่บันทึก Walkover ต้องระบุเหตุผล และถูกบันทึกไว้ตรวจย้อนหลังได้</li>
            </ul>
          </article>

          <article className="rule-card">
            <h2>มือทั่วไป — การแข่งแบบทีมสี</h2>
            <ul>
              <li>1 คู่สี = 3 แมตช์ แข่งพร้อมกัน 3 คอร์ต</li>
              <li>ชนะ 2 ใน 3 แมตช์ถือว่าชนะคู่สีนั้น</li>
              <li>
                <strong>ต้องแข่งครบทั้ง 3 แมตช์</strong> แม้จะรู้ผู้ชนะแล้ว
                เพราะผลทุกแมตช์ใช้คิดอันดับตอนเสมอกัน
              </li>
              <li>ส่งซองรายชื่อพร้อมกันทั้งสองสี · คู่ที่ 1 ต้องมีระดับมือไม่ต่ำกว่าคู่ที่ 2 และคู่ที่ 3</li>
              <li>รอบพบกันหมด 6 คู่สี แล้วเข้าสู่ Page Playoff (Qualifier 1 · Eliminator · Qualifier 2 · ชิงชนะเลิศ)</li>
            </ul>
          </article>

          <article className="rule-card">
            <h2>มือ D และมือ C — สายบน/สายล่าง</h2>
            <ul>
              <li>แบ่ง 4 กลุ่ม กลุ่มละ 4 คู่ แข่งพบกันหมดภายในกลุ่ม</li>
              <li>อันดับ 1-2 ของแต่ละกลุ่มเข้าสายบน · อันดับ 3-4 เข้าสายล่าง</li>
              <li>สายบนแข่งชิงเหรียญ ทอง/เงิน/ทองแดง</li>
              <li>
                สายล่าง: ผู้ชนะเลิศได้ 0.5 คะแนนสะสมให้สี ส่วนแมตช์ชิงอันดับ 3 ของสายล่าง
                <strong> ยังแข่งตามโปรแกรมแต่ไม่มีคะแนนและไม่มีอันดับ</strong>
              </li>
              <li>มือ D ไม่มีประเภทชายคู่</li>
            </ul>
          </article>

          <article className="rule-card">
            <h2>คะแนนสี (รวมสูงสุด 37 คะแนน)</h2>
            <div className="scroll-x">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>รายการ</th>
                    <th>อันดับ 1</th>
                    <th>อันดับ 2</th>
                    <th>อันดับ 3</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>มือใหม่ (ชายคู่ · หญิงคู่ · คู่ผสม)</td>
                    <td>3</td>
                    <td>2</td>
                    <td>1</td>
                  </tr>
                  <tr>
                    <td>มือ D — สายบน</td>
                    <td>3</td>
                    <td>2</td>
                    <td>1</td>
                  </tr>
                  <tr>
                    <td>มือ C — สายบน</td>
                    <td>3</td>
                    <td>2</td>
                    <td>1</td>
                  </tr>
                  <tr>
                    <td>มือทั่วไป — ทีมสี</td>
                    <td>3</td>
                    <td>2</td>
                    <td>1</td>
                  </tr>
                  <tr>
                    <td>สายล่าง (มือ D และมือ C)</td>
                    <td>0.5</td>
                    <td>—</td>
                    <td>0 (ไม่มีอันดับ)</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p style={{ marginBottom: 0 }}>
              เกณฑ์ตัดสินเมื่อคะแนนสีรวมเท่ากัน: เหรียญทองมากกว่า → เหรียญเงินมากกว่า → เหรียญทองแดงมากกว่า
            </p>
          </article>

          <article className="rule-card">
            <h2>เกณฑ์จัดอันดับเมื่อผลเสมอกัน</h2>
            <p>ใช้ทั้งรอบแบ่งกลุ่มของมือ D / มือ C และอันดับสีของมือทั่วไป ตามลำดับ</p>
            <ol>
              <li>จำนวนที่ชนะมากกว่า</li>
              <li>ผลการเจอกันเองระหว่างคู่/สีที่เสมอกัน</li>
              <li>ผลต่างเกม (เกมที่ได้ ลบ เกมที่เสีย)</li>
              <li>ผลต่างแต้ม (แต้มที่ได้ ลบ แต้มที่เสีย)</li>
              <li>คำชี้ขาดของคณะกรรมการ</li>
            </ol>
            <p style={{ marginBottom: 0 }}>
              ถ้าเกณฑ์ 1-4 ยังแยกไม่ออก ระบบจะไม่ตัดสินเอง แต่จะแจ้งผู้ดูแลให้เสนอคณะกรรมการชี้ขาด
              และบันทึกคำตัดสินไว้ตรวจย้อนหลังได้
            </p>
          </article>
        </div>

        <div className="notice" style={{ marginTop: 26 }}>
          หน้านี้สรุปจากประกาศการแข่งขัน หากมีข้อขัดแย้ง ให้ยึดตามประกาศและมติของคณะกรรมการจัดการแข่งขันเป็นสำคัญ
        </div>
      </div>
    </main>
  );
}
