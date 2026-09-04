// KasSurs — globalSetup E2E: purge data sisa "E2E ..." dari test DB (Docker
// 5433) sebelum setiap run. Run sebelumnya gagal/tidak sempat cleanup → ~192
// member "E2E ..." menumpuk → roster /pembayaran besar & drawer lambat.
// Urutan FK wajib (semua relation onDelete: Restrict): anak dulu, member terakhir.
import { PrismaClient } from "@prisma/client";

process.env.DATABASE_URL = "postgresql://postgres:kassurs_test@localhost:5433/postgres";

export default async function globalSetup(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const namaE2E = { nama: { startsWith: "E2E" } };
    const whereAnak = { member: namaE2E };
    const [la, al, rs, p] = await prisma.$transaction([
      prisma.loginAttempt.deleteMany({ where: whereAnak }),
      prisma.auditLog.deleteMany({ where: { actor: namaE2E } }),
      prisma.reportSnapshot.deleteMany({ where: { createdBy: namaE2E } }),
      prisma.payment.deleteMany({ where: whereAnak }),
    ]);
    const member = await prisma.member.deleteMany({ where: namaE2E });
    console.log(
      `global-setup: purge ${member.count} member "E2E ..." (loginAttempt ${la.count}, auditLog ${al.count}, reportSnapshot ${rs.count}, payment ${p.count})`,
    );
  } finally {
    await prisma.$disconnect();
  }
}
