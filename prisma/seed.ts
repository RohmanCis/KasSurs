// =====================================================================
// KasSurs — T-14: Seed script (FR-22 bootstrap admin + kategori default)
// Dijalankan via `npx prisma db seed` — Prisma CLI auto-load `.env`,
// jadi env var (SEED_ADMIN_PHONE/PIN, DATABASE_URL) sudah tersedia.
// IDEMPOTEN: admin dibuat hanya jika belum ada role=ADMIN di DB;
// kategori default di-skip jika nama sudah ada.
// =====================================================================

import { PrismaClient } from "@prisma/client";
import { hashPin } from "../src/lib/auth";

const prisma = new PrismaClient();

const DEFAULT_CATEGORIES = ["Konsumsi", "Acara", "ATK", "Sumbangan", "Lain-lain"];

async function main() {
  // 1) Akun admin pertama — skip jika sudah ada role=ADMIN (FR-22).
  const existingAdmin = await prisma.member.findFirst({ where: { role: "ADMIN" } });
  if (existingAdmin) {
    console.log("Seed: admin sudah ada, skip pembuatan admin.");
  } else {
    const phone = process.env.SEED_ADMIN_PHONE;
    const pin = process.env.SEED_ADMIN_PIN;
    if (!phone || !pin) {
      throw new Error(
        "SEED_ADMIN_PHONE dan SEED_ADMIN_PIN wajib diset di .env untuk seed admin pertama",
      );
    }
    await prisma.member.create({
      data: { nama: "Admin", noHp: phone, pinHash: await hashPin(pin), role: "ADMIN" },
    });
    console.log("Seed: admin pertama dibuat (nama default 'Admin').");
  }

  // 2) Kategori default — skip yang sudah ada (nama unik di DB).
  for (const nama of DEFAULT_CATEGORIES) {
    const exists = await prisma.category.findUnique({ where: { nama } });
    if (!exists) {
      await prisma.category.create({ data: { nama, isDefault: true } });
      console.log(`Seed: kategori "${nama}" dibuat.`);
    }
  }
  console.log("Seed selesai.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
