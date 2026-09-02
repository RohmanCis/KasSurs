// =====================================================================
// KasSurs — T-33: Logika snapshot laporan (FR-23)
// getOrCreateSnapshot: cek ReportSnapshot [bulan, tahun] → ada &
// !regenerate → return payload BEKU (tidak dihitung ulang); tidak ada /
// regenerate → hitung live (semantik T-27) lalu upsert. Dipakai bersama
// route /api/reports/pdf & /api/reports/excel — PDF & Excel periode sama
// bersumber SATU snapshot → angka identik antar format.
//
// Semantik hitung (T-27 — snapshot hanya membekukan HASIL, tidak mengubah
// cara hitung):
//   - totalMasuk/detailMasuk   = Payment WHERE bulan/tahun = periode (accrual,
//     kolom bulan/tahun = "iuran utk bulan apa", bukan tanggal catat).
//   - totalKeluar/detailKeluar = Expense WHERE tanggal dalam rentang periode
//     [awal bulan, awal bulan berikutnya) — pola rentang T-24.
//   - saldoAkhirPeriode = Σ Payment.tanggalBayar s.d. AKHIR periode −
//     Σ Expense.tanggal s.d. AKHIR periode — saldo HISTORIS cash-flow
//     dipotong di akhir periode (bukan saldo hari export). Payment masuk
//     lewat tanggalBayar di sini (saat uang diterima), konsisten definisi
//     saldo T-27 = Σ seluruh histori, di-cut s.d. akhir periode.
//   - jumlahLunas = count Payment periode milik anggota statusAktif=true
//     (M1: payment anggota NONAKTIF tetap masuk totalMasuk & detailMasuk —
//     uang tetap masuk kas — tapi tidak mengurangi utang anggota aktif).
//     jumlahBelumBayar = count anggota statusAktif=true − jumlahLunas.
//     Konsisten: jumlahLunas + jumlahBelumBayar = jumlah anggota aktif
//     (angka beku saat export, pola T-27).
//
// RACE (export pertama periode bersamaan / regenerate): hitung+upsert
// diserialkan dengan advisory lock DB `pg_advisory_xact_lock` (kunci unik
// per periode). Penulis kedua menunggu lock, lalu MENEMUKAN snapshot sudah
// ada → render payload BEKU milik penulis pertama → kedua response export
// pertama BYTE-IDENTIKAL (FR-23 single-source, dijamin — bukan selisih tipis
// yang diterima). Fix race ditemukan oleh test race report-snapshots
// (tanpa lock: tiap panggilan me-render payload lokalnya sendiri, dibuatPada
// beda milidetik → PDF beda byte). Fast path re-export (snapshot sudah ada)
// tetap TANPA lock.
//
// Snapshot TIDAK dicatat ke audit log (keputusan user) — bukan mutasi
// data keuangan Payment/Expense.
// =====================================================================

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { ReportSnapshotPayload } from "@/lib/types";

// Validasi query export (dipakai kedua route pdf & excel).
// bulan/tahun opsional → default bulan berjalan (FR-17) diterapkan route.
// regenerate: hanya "true" yang memicu hitung ulang.
export const reportQuerySchema = z.object({
  bulan: z
    .string()
    .regex(/^\d{1,2}$/, "bulan harus 1-2 digit")
    .transform(Number)
    .pipe(z.number().int().min(1).max(12))
    .optional(),
  tahun: z
    .string()
    .regex(/^\d{4}$/, "tahun harus 4 digit")
    .transform(Number)
    .pipe(z.number().int().min(1000).max(9999))
    .optional(),
  regenerate: z.enum(["true", "false"]).optional(),
});

export async function getOrCreateSnapshot(
  bulan: number,
  tahun: number,
  actorId: string,
  regenerate: boolean,
): Promise<ReportSnapshotPayload> {
  const existing = await prisma.reportSnapshot.findUnique({
    where: { bulan_tahun: { bulan, tahun } },
  });
  if (existing && !regenerate) {
    // FR-23: re-export periode sama → render dari payload beku. Cast aman:
    // payload ditulis oleh helper ini (bentuk ReportSnapshotPayload penuh).
    return existing.payload as unknown as ReportSnapshotPayload;
  }

  // Serialisasi hitung+upsert utk export pertama / regenerate (race):
  // advisory lock DB per periode — penulis kedua menunggu, lalu memakai
  // payload pemenang (single source → byte-identikal). $executeRaw (bukan
  // $queryRaw): pg_advisory_xact_lock mengembalikan void — $queryRaw gagal
  // deserialisasi kolom void; $executeRaw membuang hasilnya.
  const lockKey = bulan * 100000 + tahun;
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;

    // Cek ulang SETELAH lock: penulis pertama mungkin sudah selesai —
    // kalah race → render payload beku miliknya (bukan hitung ulang).
    const current = await tx.reportSnapshot.findUnique({
      where: { bulan_tahun: { bulan, tahun } },
    });
    if (current && !regenerate) {
      return current.payload as unknown as ReportSnapshotPayload;
    }

    const payload = await computeSnapshot(tx, bulan, tahun);
    await tx.reportSnapshot.upsert({
      where: { bulan_tahun: { bulan, tahun } },
      create: { bulan, tahun, payload: payload as unknown as Prisma.InputJsonValue, createdById: actorId },
      // update tidak menyentuh createdById/createdAt — creator pertama dipertahankan.
      update: { payload: payload as unknown as Prisma.InputJsonValue },
    });

    return payload;
  });
}

// Hitung live payload (semantik T-27) — query via db (tx client dari
// $transaction). Semua query READ-ONLY: aman dipakai dalam transaksi.
async function computeSnapshot(
  db: Prisma.TransactionClient,
  bulan: number,
  tahun: number,
): Promise<ReportSnapshotPayload> {
  // Akhir periode eksklusif = awal bulan berikutnya (UTC). Payment/Expense
  // tanggal disimpan sebagai UTC midnight → rentang [awal, awal+1 bln) dan
  // bound "< awal bulan berikutnya" mencakup seluruh tanggal ≤ akhir bulan.
  const startPeriode = new Date(Date.UTC(tahun, bulan - 1, 1));
  const endExclusive = new Date(Date.UTC(tahun, bulan, 1));

  const [payments, expenses, saldoPay, saldoExp, totalAktif] = await Promise.all([
    // Accrual masuk: kolom bulan/tahun (rapel bulan lalu tidak ikut).
    db.payment.findMany({
      where: { bulan, tahun },
      include: { member: { select: { nama: true, statusAktif: true } } },
      orderBy: [{ member: { nama: "asc" } }, { id: "asc" }],
    }),
    // Cash-flow keluar: rentang tanggal (pola T-24).
    db.expense.findMany({
      where: { tanggal: { gte: startPeriode, lt: endExclusive } },
      include: { category: { select: { nama: true } } },
      orderBy: [{ tanggal: "asc" }, { id: "asc" }],
    }),
    // Saldo historis s.d. AKHIR periode (semua histori, tanggalBayar cut).
    db.payment.aggregate({
      where: { tanggalBayar: { lt: endExclusive } },
      _sum: { jumlah: true },
    }),
    db.expense.aggregate({
      where: { tanggal: { lt: endExclusive } },
      _sum: { jumlah: true },
    }),
    db.member.count({ where: { statusAktif: true } }),
  ]);

  // jumlahLunas = payment periode milik anggota AKTIF saja (M1) — payment
  // anggota nonaktif (rapel) TIDAK mengurangi utang anggota aktif. Detail
  // baris detailMasuk tetap memuat SEMUA payment (rapel tetap tampil).
  const jumlahLunas = payments.filter((p) => p.member.statusAktif).length;

  const payload: ReportSnapshotPayload = {
    periode: { bulan, tahun },
    ringkasan: {
      totalMasuk: payments.reduce((a, p) => a + p.jumlah, 0),
      totalKeluar: expenses.reduce((a, e) => a + e.jumlah, 0),
      saldoAkhirPeriode: (saldoPay._sum.jumlah ?? 0) - (saldoExp._sum.jumlah ?? 0),
      jumlahLunas,
      // Anggota AKTIF saat export − lunas periode ini (dibekukan).
      jumlahBelumBayar: totalAktif - jumlahLunas,
    },
    detailMasuk: payments.map((p) => ({
      memberNama: p.member.nama, // denormalized & dibekukan — rename/deactivate member tidak mengubah laporan lama
      bulan: p.bulan,
      tahun: p.tahun,
      jumlah: p.jumlah,
      tanggalBayar: p.tanggalBayar.toISOString().slice(0, 10), // ISO date
    })),
    detailKeluar: expenses.map((e) => ({
      categoryNama: e.category.nama, // denormalized & dibekukan
      deskripsi: e.deskripsi,
      jumlah: e.jumlah,
      tanggal: e.tanggal.toISOString().slice(0, 10), // ISO date
    })),
    dibuatPada: new Date().toISOString(),
  };

  return payload;
}
