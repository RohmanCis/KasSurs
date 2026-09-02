// =====================================================================
// KasSurs — getDashboardSummary(session): agregat ringkasan kas org-wide.
// Sumber: di-extract bulat dari GET /api/dashboard/summary (T-27) saat
// FASE 3 (2026-09-03) — dipakai bersama API route (handler thin) & RSC
// dashboard/status (tanpa fetch client). Behavior & kontrak response
// IDENTIK dgn route asli.
//
// FR-14: ringkasan saldo = organisasi-wide (SEMUA anggota) utk KEDUA role;
// jumlahBelumBayar admin-only (optional field — undefined → hilang JSON).
// FR-12: saldo = seluruh histori; totalMasuk/KeluarBulanIni subset bulan
// berjalan. Periode Payment kolom bulan/tahun (eksplisit), Expense rentang
// tanggal. Tidak ada mutasi → tanpa tx, Promise.all utk paralel.
// =====================================================================

import { prisma } from "@/lib/prisma";
import type { VerifiedSession } from "@/lib/auth";
import type { DashboardSummaryResponse } from "@/lib/types";

export async function getDashboardSummary(
  session: VerifiedSession,
): Promise<DashboardSummaryResponse> {
  // Bulan/tahun berjalan = waktu server UTC (konsisten dgn storage UTC).
  const now = new Date();
  const tahun = now.getUTCFullYear();
  const bulan = now.getUTCMonth() + 1;
  const rangeBulanIni = {
    gte: new Date(Date.UTC(tahun, bulan - 1, 1)),
    lt: new Date(Date.UTC(tahun, bulan, 1)),
  };

  const [payAll, expAll, payBulanIni, expBulanIni, totalAktif, sudahBayarBulanIni] =
    await Promise.all([
      // Saldo: SUM seluruh histori (FR-12) — bukan findMany+reduce, aggregate.
      prisma.payment.aggregate({ _sum: { jumlah: true } }),
      prisma.expense.aggregate({ _sum: { jumlah: true } }),
      // totalMasukBulanIni: kolom bulan/tahun (bukan tanggalBayar).
      prisma.payment.aggregate({ where: { bulan, tahun }, _sum: { jumlah: true } }),
      // totalKeluarBulanIni: rentang tanggal (pola T-24).
      prisma.expense.aggregate({ where: { tanggal: rangeBulanIni }, _sum: { jumlah: true } }),
      prisma.member.count({ where: { statusAktif: true } }),
      // Jumlah anggota AKTIF yg sudah bayar bulan berjalan (distinct memberId
      // via relasi member.statusAktif) — dipakai jumlahLunas (kedua role) DAN
      // jumlahBelumBayar (ADMIN). Member NONAKTIF dgn payment rapel bulan ini
      // TIDAK dihitung sbg "sudah bayar" (semantik jumlahBelumBayar).
      prisma.payment.findMany({
        where: { bulan, tahun, member: { statusAktif: true } },
        select: { memberId: true },
        distinct: ["memberId"],
      }),
    ]);

  const response: DashboardSummaryResponse = {
    saldo: (payAll._sum.jumlah ?? 0) - (expAll._sum.jumlah ?? 0),
    totalMasukBulanIni: payBulanIni._sum.jumlah ?? 0,
    totalKeluarBulanIni: expBulanIni._sum.jumlah ?? 0,
    jumlahAnggotaAktif: totalAktif,
    jumlahLunas: sudahBayarBulanIni.length,
  };

  if (session.role === "ADMIN") {
    // jumlahBelumBayar = jumlah anggota AKTIF tanpa payment bulan berjalan
    // (totalAktif − sudahBayarBulanIni.length).
    response.jumlahBelumBayar = totalAktif - sudahBayarBulanIni.length;
  }

  // ANGGOTA: jumlahBelumBayar undefined → hilang dari JSON (bukan null).
  return response;
}
