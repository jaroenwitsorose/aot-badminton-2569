/**
 * คืนฐานข้อมูลกลับสู่สถานะ "ก่อนแข่ง" ทั้งหมด
 *
 *   npx tsx scripts/reset-demo-data.ts
 *
 * ล้างผลการแข่งขัน การจับสลาก ซองรายชื่อ และค่าที่ทดลองกรอก (วัน/สถานที่)
 * ใช้หลังซ้อมระบบ — ไม่แตะโครงสร้างตารางแมตช์ คู่แข่งขัน และรายชื่อนักกีฬา
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const tournament = await prisma.tournament.findFirst();
  if (!tournament) throw new Error("ยังไม่ได้นำเข้าข้อมูลตั้งต้น");

  await prisma.matchGame.deleteMany({});
  const matches = await prisma.match.updateMany({
    data: {
      status: "WAITING",
      walkover: false,
      walkoverSide: null,
      winnerPairUid: null,
      adminNote: null,
      publicUpdatedAt: null,
      updatedById: null,
    },
  });
  const draws = await prisma.drawAssignment.deleteMany({});
  const lineups = await prisma.level4Lineup.deleteMany({});
  await prisma.tiebreakDecision.deleteMany({});
  await prisma.level4Tie.updateMany({ data: { status: "WAITING", winnerTeamCode: null } });
  await prisma.tournamentDay.updateMany({ data: { actualDate: null } });
  await prisma.tournament.update({
    where: { tournamentId: tournament.tournamentId },
    data: { startDate: null, endDate: null, venueConfirmed: false, simulationEnabled: false },
  });

  console.log(
    `คืนค่าแล้ว: แมตช์ ${matches.count} รายการ, ล้างการจับสลาก ${draws.count} ช่อง, ล้างซอง ${lineups.count} รายการ, ล้างวันจริงและการยืนยันสถานที่`,
  );
  console.log("หมายเหตุ: ประวัติการแก้ไข (audit log) ไม่ถูกลบ เพื่อให้ตรวจย้อนหลังได้");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
