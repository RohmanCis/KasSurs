// =====================================================================
// KasSurs — T-27: GET /api/dashboard/summary (FR-12, FR-14)
// Source of truth: .agents/2-TECH-SPEC.md (Bagian 3 DashboardSummaryResponse
// + Bagian 4 alur logika) & .agents/1-PRD.md FR-12/FR-14.
// RBAC: middleware (T-12) sengaja TIDAK memblokir /api/dashboard — endpoint
// ini role-differentiated DI HANDLER (FR-14): ANGGOTA HARUS bisa akses
// ringkasan saldo umum. Handler hanya memastikan session valid (401 fallback).
//
// FR-14: ringkasan saldo = organisasi-wide (SEMUA anggota, tanpa filter
// memberId) untuk KEDUA role. Bedanya hanya: jumlahBelumBayar admin-only
// (optional field — undefined → hilang dari JSON, bukan null).
//
// FR-12: saldo = seluruh histori transaksi (bukan hanya bulan berjalan);
// totalMasuk/KeluarBulanIni = subset bulan berjalan (UTC, konsisten dgn
// penyimpanan tanggal UTC midnight & filter T-24).
//
// Periode Payment pakai kolom bulan/tahun (eksplisit di schema, ter-index
// [bulan, tahun]) — konsisten dgn GET /api/payments (T-20). Kolom bulan/
// tahun = "iuran utk bulan apa", BUKAN tanggal catat → totalMasukBulanIni
// tidak tercemar rapel: iuran bulan lalu yg dicatat bulan ini tetap masuk
// bulan lalu (dan rapel bulan ini utk bulan lalu TIDAK dihitung bulan ini).
// Expense tak punya kolom bulan/tahun → rentang tanggal [awal, awal+1 bln)
// pada `tanggal` (pola T-24).
//
// Tidak ada mutasi → tidak ada audit log, tidak ada $transaction (hanya
// baca; Promise.all utk paralel — snapshot "satu waktu" tanpa tx, skala ≤30).
// =====================================================================

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth";
import type { DashboardSummaryResponse } from "@/lib/types";

function unauthorized(): NextResponse<{ error: string; message: string }> {
  return NextResponse.json(
    { error: "UNAUTHORIZED", message: "Belum login atau sesi kedaluwarsa" },
    { status: 401 },
  );
}

export async function GET() {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!token) return unauthorized();
  const session = await verifySession(token);
  if (!session) return unauthorized();

  // Bulan/tahun berjalan = waktu server UTC (konsisten dgn storage UTC).
  const now = new Date();
  const tahun = now.getUTCFullYear();
  const bulan = now.getUTCMonth() + 1;
  const rangeBulanIni = {
    gte: new Date(Date.UTC(tahun, bulan - 1, 1)),
    lt: new Date(Date.UTC(tahun, bulan, 1)),
  };

  const [payAll, expAll, payBulanIni, expBulanIni, totalAktif, sudahBayarBulanIni] = await Promise.all([
    // Saldo: SUM seluruh histori (FR-12) — bukan findMany+reduce, aggregate.
    prisma.payment.aggregate({ _sum: { jumlah: true } }),
    prisma.expense.aggregate({ _sum: { jumlah: true } }),
    // totalMasukBulanIni: kolom bulan/tahun (lihat header — bukan tanggalBayar).
    prisma.payment.aggregate({ where: { bulan, tahun }, _sum: { jumlah: true } }),
    // totalKeluarBulanIni: rentang tanggal (pola T-24).
    prisma.expense.aggregate({ where: { tanggal: rangeBulanIni }, _sum: { jumlah: true } }),
    prisma.member.count({ where: { statusAktif: true } }),
    // jumlahBelumBayar admin-only — ANGGOTA skip query ini (tak terpakai).
    session.role === "ADMIN"
      ? prisma.payment.findMany({
          where: { bulan, tahun, member: { statusAktif: true } },
          select: { memberId: true },
          distinct: ["memberId"],
        })
      : Promise.resolve([] as { memberId: string }[]),
  ]);

  const response: DashboardSummaryResponse = {
    saldo: (payAll._sum.jumlah ?? 0) - (expAll._sum.jumlah ?? 0),
    totalMasukBulanIni: payBulanIni._sum.jumlah ?? 0,
    totalKeluarBulanIni: expBulanIni._sum.jumlah ?? 0,
  };

  if (session.role === "ADMIN") {
    // jumlahBelumBayar = jumlah anggota AKTIF tanpa payment bulan berjalan
    // (totalAktif − banyaknya anggota AKTIF yg sudah bayar bulan ini, distinct
    // memberId via relasi member.statusAktif). Member NONAKTIF dgn payment
    // rapel bulan ini TIDAK dihitung sbg "sudah bayar" — mereka bukan
    // penanggung iuran berjalan, jadi tidak mengurangi hitungan utang aktif.
    response.jumlahBelumBayar = totalAktif - sudahBayarBulanIni.length;
  }

  // ANGGOTA: jumlahBelumBayar undefined → hilang dari JSON (bukan null) —
  // kontrak DashboardSummaryResponse optional field.
  return NextResponse.json(response);
}
