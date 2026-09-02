// =====================================================================
// KasSurs — API Handler Kit #1: builder DTO/snapshot/response Payment
// Unify duplikat yang tadinya inline per-file:
// - toPaymentDTO: payments/route.ts + payments/[id]/route.ts + status page
// - paymentSnapshot: payments/route.ts + payments/[id]/route.ts (audit, FR-21)
// Sumber literal response: T-20/T-21 (kontrak types.ts) — JANGAN diubah.
// =====================================================================

import { NextResponse } from "next/server";
import type { Payment } from "@prisma/client";
import type { PaymentDTO } from "@/lib/types";

// Serialisasi ke PaymentDTO. memberNama adalah field denormalized (bukan
// field asli tabel Payment) — berasal dari relasi member, untuk kemudahan
// render list. Tanggal selalu ISO 8601: tanggalBayar date-only,
// createdAt datetime (konvensi proyek).
export function toPaymentDTO(p: Payment & { member: { nama: string } }): PaymentDTO {
  return {
    id: p.id,
    memberId: p.memberId,
    memberNama: p.member.nama, // denormalized — bukan field asli tabel
    bulan: p.bulan,
    tahun: p.tahun,
    jumlah: p.jumlah,
    tanggalBayar: p.tanggalBayar.toISOString().slice(0, 10),
    createdAt: p.createdAt.toISOString(),
  };
}

// Snapshot aman untuk audit log (FR-21) — tanggal sebagai ISO string.
// Field dipilih persis seperti implementasi awal: updatedAt tidak ikut.
export function paymentSnapshot(p: Payment): Record<string, unknown> {
  return {
    id: p.id,
    memberId: p.memberId,
    bulan: p.bulan,
    tahun: p.tahun,
    jumlah: p.jumlah,
    tanggalBayar: p.tanggalBayar.toISOString().slice(0, 10),
    createdAt: p.createdAt.toISOString(),
  };
}

// 404 — payment target tidak ada (T-21).
export function paymentNotFound(): NextResponse {
  return NextResponse.json(
    { error: "PAYMENT_NOT_FOUND", message: "Pembayaran tidak ditemukan" },
    { status: 404 },
  );
}

// 409 kontrak EXACT PaymentConflictResponse. existingPaymentId selalu
// disertakan — seluruh call site (payments + payments/[id]) mengirim id
// (atau "" jika re-query keburu hilang).
export function alreadyPaid(existingPaymentId: string): NextResponse {
  return NextResponse.json(
    {
      error: "ALREADY_PAID",
      message: "Sudah lunas bulan ini",
      existingPaymentId,
    },
    { status: 409 },
  );
}
