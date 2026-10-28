// =====================================================================
// KasSurs — T-33: Logika snapshot laporan (FR-23)
// getOrCreateSnapshot: cek ReportSnapshot [bulan, tahun] → ada → return
// payload BEKU (tidak dihitung ulang); tidak ada → hitung live (semantik
// T-27) lalu upsert. Dipakai bersama route /api/reports/pdf &
// /api/reports/excel — PDF & Excel periode sama bersumber SATU snapshot →
// angka identik antar format.
//
// REGENERATE (L-01): koreksi snapshot pindah dari query param
// `?regenerate=true` ke POST /api/reports/regenerate → regenerateSnapshot()
// di bawah. Jalur GET export jadi MURNI BACA (schema strict menolak param
// asing) + hanya regenerate yang dicatat ke audit log (FR-21).
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
// Snapshot TIDAK dicatat ke audit log (keputusan user, HANDOFF:22) — bukan
// mutasi data keuangan Payment/Expense. PENGECUALIAN (keputusan user
// 2026-10-29, L-01): regenerate MENIMPA angka beku yang sudah dilaporkan →
// WAJIB tercatat (aksi UPDATE, entityType "ReportSnapshot"), dalam tx yang
// sama dengan hitung+upsert.
// =====================================================================

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordAuditLog } from "@/lib/audit";
import type { ReportSnapshotPayload } from "@/lib/types";

// Validasi query export (dipakai kedua route pdf & excel).
// bulan/tahun opsional → default bulan berjalan (FR-17) diterapkan route.
// .strict(): param asing DITOLAK 400 — jalur GET export murni baca, jadi
// sisa `?regenerate=true` dari kontrak lama tidak boleh lolos diam-diam
// (zod object default men-strip key tak dikenal). Route memberi seluruh
// searchParams ke schema ini, bukan hanya bulan/tahun.
export const reportQuerySchema = z
  .object({
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
  })
  .strict();

// Body POST /api/reports/regenerate (L-01): periode target opsional —
// body kosong / {} → default bulan berjalan WIB (diterapkan route). Angka
// (bukan string seperti query) dan .strict() agar salah tulis field gagal
// loud, bukan diam-diam regenerate periode default.
export const regenerateBodySchema = z
  .object({
    bulan: z.number().int().min(1, "bulan harus 1-12").max(12, "bulan harus 1-12").optional(),
    tahun: z.number().int().min(1000, "tahun harus 4 digit").max(9999, "tahun harus 4 digit").optional(),
  })
  .strict();

// Kelas error tx sibuk keluar dari helper ini (dilempar mentah oleh Prisma
// sebagai PrismaClientKnownRequestError P2028 timeout / P2034 write conflict).
// Dipetakan route: POST regenerate → 409 REGENERATE_BUSY, GET export → 503
// SERVICE_BUSY. Tanpa kelas ini route harus tahu kode Prisma mentah.
export class RegenerateBusyError extends Error {
  constructor() {
    super("transaksi snapshot laporan timeout/bentrok (P2028/P2034)");
    this.name = "RegenerateBusyError";
  }
}

// Ekstrak `dibuatPada` dari payload Json tersimpan. Defensif: payload cacat /
// baris lama tanpa field ini → null → gate freshness dianggap GAGAL → hitung
// ulang (fail-safe ke data terbaru, bukan render payload rusak).
function payloadDibuatPada(payload: Prisma.JsonValue): string | null {
  const value = (payload as unknown as { dibuatPada?: unknown } | null)?.dibuatPada;
  return typeof value === "string" ? value : null;
}

// Serialisasi hitung+upsert per periode + pemetaan error tx.
// Lock: advisory lock DB (kunci unik per periode) — penulis kedua menunggu,
// lalu MEMENUKAN snapshot sudah ada → memakai payload pemenang (single source
// → response byte-identikal). $executeRaw (bukan $queryRaw):
// pg_advisory_xact_lock mengembalikan void — $queryRaw gagal deserialisasi
// kolom void; $executeRaw membuang hasilnya.
// maxWait/timeout eksplisit: hitung = 5 query lewat pooler (±2,5s) sedangkan
// default interaktif Prisma hanya 5s → terlalu mepet; lewat batas → P2028.
async function lockedTransaction<T>(
  bulan: number,
  tahun: number,
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const lockKey = bulan * 100000 + tahun;
  try {
    return await prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;
        return fn(tx);
      },
      { maxWait: 5_000, timeout: 20_000 },
    );
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      (err.code === "P2028" || err.code === "P2034")
    ) {
      throw new RegenerateBusyError();
    }
    throw err;
  }
}

export async function getOrCreateSnapshot(
  bulan: number,
  tahun: number,
  actorId: string,
): Promise<ReportSnapshotPayload> {
  const existing = await prisma.reportSnapshot.findUnique({
    where: { bulan_tahun: { bulan, tahun } },
  });
  if (existing) {
    // FR-23: re-export periode sama → render dari payload beku. Fast path
    // TANPA lock. Cast aman: payload ditulis oleh helper ini (bentuk
    // ReportSnapshotPayload penuh).
    return existing.payload as unknown as ReportSnapshotPayload;
  }

  return lockedTransaction(bulan, tahun, async (tx) => {
    // Cek ulang SETELAH lock: penulis pertama mungkin sudah selesai —
    // kalah race → render payload beku miliknya (bukan hitung ulang).
    const current = await tx.reportSnapshot.findUnique({
      where: { bulan_tahun: { bulan, tahun } },
    });
    if (current) {
      return current.payload as unknown as ReportSnapshotPayload;
    }

    return computeAndSave(tx, bulan, tahun, actorId);
  });
}

// Hitung live + upsert snapshot (dipakai export pertama periode & regenerate).
// TIDAK mencatat audit log — jalur ini bukan koreksi, dan transaksi yang
// melempar P2003 di sini hanya bisa berasal dari createdById (route export
// memetakan ke 401 lewat sessionMemberGone).
async function computeAndSave(
  tx: Prisma.TransactionClient,
  bulan: number,
  tahun: number,
  actorId: string,
): Promise<ReportSnapshotPayload> {
  const payload = await computeSnapshot(tx, bulan, tahun);
  await tx.reportSnapshot.upsert({
    where: { bulan_tahun: { bulan, tahun } },
    create: {
      bulan,
      tahun,
      payload: payload as unknown as Prisma.InputJsonValue,
      createdById: actorId,
    },
    // update tidak menyentuh createdById/createdAt — creator pertama dipertahankan.
    update: { payload: payload as unknown as Prisma.InputJsonValue },
  });
  return payload;
}

// POST /api/reports/regenerate (L-01): hitung ulang + TIMPA snapshot periode,
// lalu catat audit (FR-21) — semuanya dalam satu transaksi + lock per periode.
export async function regenerateSnapshot(
  bulan: number,
  tahun: number,
  actorId: string,
): Promise<ReportSnapshotPayload> {
  // Dicatat SEBELUM transaksi/antre lock → jadi batas "fresh": payload yang
  // dibekukan SETELAH titik ini sudah mencerminkan data terbaru, jadi tidak
  // perlu dihitung ulang. Penutup celah C3 (dua regenerate bersamaan
  // sama-sama hitung lalu saling menimpa): penulis kedua menemukan payload
  // penulis pertama ber-dibuatPada ≥ requestStart-nya → return payload ITU.
  // Asumsi: clock app-server tunggal & monotonik — gate membandingkan stempel
  // waktu yang keduanya dibuat oleh proses ini (`toISOString`), bukan now()
  // DB, jadi skew clock antar-mesin tidak terlibat.
  const requestStartedAt = new Date();

  return lockedTransaction(bulan, tahun, async (tx) => {
    const current = await tx.reportSnapshot.findUnique({
      where: { bulan_tahun: { bulan, tahun } },
    });

    let dibuatPadaLama: string | null = null;
    if (current) {
      dibuatPadaLama = payloadDibuatPada(current.payload);
      // ISO 8601 UTC dari toISOString() → perbandingan leksikografis ==
      // perbandingan waktu (format & panjang identik, presisi milidetik).
      if (dibuatPadaLama !== null && dibuatPadaLama >= requestStartedAt.toISOString()) {
        return current.payload as unknown as ReportSnapshotPayload;
      }
    }

    const payload = await computeSnapshot(tx, bulan, tahun);
    const saved = await tx.reportSnapshot.upsert({
      where: { bulan_tahun: { bulan, tahun } },
      create: {
        bulan,
        tahun,
        payload: payload as unknown as Prisma.InputJsonValue,
        createdById: actorId,
      },
      // createdById/createdAt TIDAK diubah — regenerate hanya menimpa payload.
      update: { payload: payload as unknown as Prisma.InputJsonValue },
    });

    // FR-21 atomicity: audit di txClient yang sama → snapshot tertimpa ⇔
    // audit tercatat (rollback bersama). dataLama cukup `dibuatPada` versi
    // sebelumnya (payload penuh tidak perlu — yang dibuktikan adalah KAPAN
    // versi lama dibekukan); null = snapshot baru dibuat oleh regenerate ini.
    await recordAuditLog(
      actorId,
      "UPDATE",
      "ReportSnapshot",
      saved.id,
      { dibuatPada: dibuatPadaLama },
      { dibuatPada: payload.dibuatPada, ringkasan: payload.ringkasan },
      tx,
    );

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
