// =====================================================================
// KasSurs — T-20: GET & POST /api/payments (FR-06, FR-07, FR-21)
// Source of truth: .agents/2-TECH-SPEC.md (Bagian 3 PaymentDTO/
// CreatePaymentRequest/PaymentConflictResponse + Bagian 4 alur catat
// pembayaran) & .agents/1-PRD.md FR-06/FR-07/FR-21.
// RBAC: middleware (T-12) memisah per method — GET = ADMIN|ANGGOTA,
// POST = ADMIN only. Handler TIDAK cek role lagi untuk POST, TAPI GET
// wajib RBAC data-level: ANGGOTA hanya boleh lihat payment miliknya
// sendiri (memberId di-clamp ke session.memberId) — middleware cuma
// cek method, bukan ownership.
//
// POST atomicity (FR-21): cek member exists (404) → cek duplikat (409) →
// create → recordAuditLog dalam SATU prisma.$transaction (txClient).
// Jaring race P2002 di luar tx: constraint unique [memberId, bulan, tahun]
// DB melindungi dua POST bersamaan → re-query untuk existingPaymentId →
// 409 ALREADY_PAID juga (TIDAK ada auto-redirect ke edit).
//
// Keputusan (disetujui orchestrator): member TARGET NONAKTIF BOLEH dicatat
// payment (rapel/sumbangan historis) — hanya cek keberadaan, bukan status.
//
// Snapshot audit: tanggal serialisasi ISO 8601 (Date Prisma → string).
// =====================================================================

import { z } from "zod";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordAuditLog } from "@/lib/audit";
import { dateOnly, parseBulanTahunQuery } from "@/lib/validation";
import { getSessionOr401 } from "@/lib/api/session";
import { badRequest, invalidInput, sessionMemberGone } from "@/lib/api/respond";
import { alreadyPaid, paymentSnapshot, toPaymentDTO } from "@/lib/dto/payment";
import { memberNotFound } from "@/lib/dto/member";
import type { PaymentDTO } from "@/lib/types";

// Jumlah > 0 divalidasi di application layer (business rule Bagian 4) —
// BUKAN DB constraint; nominal boleh beda dari 30000 (rapel/sumbangan).
// tanggalBayar: dateOnly dari lib/validation (roundtrip guard gotcha #12).
const createPaymentSchema = z.object({
  memberId: z.string().trim().min(1, "Member wajib diisi"),
  bulan: z.number().int().min(1, "Bulan harus 1-12").max(12, "Bulan harus 1-12"),
  tahun: z.number().int().min(1000, "Tahun harus 4 digit").max(9999, "Tahun harus 4 digit"),
  jumlah: z.number().int().positive("Jumlah harus lebih dari 0"),
  tanggalBayar: dateOnly("tanggalBayar"),
});

export async function GET(request: Request) {
  const session = await getSessionOr401();
  if (session instanceof NextResponse) return session;

  const url = new URL(request.url);
  const memberIdRaw = url.searchParams.get("memberId");

  // Filter bulan/tahun harus muncul berpasangan & valid (lib/validation) —
  // satu tanpa pasangan atau invalid → 400 (bukan diabaikan diam-diam).
  const periode = parseBulanTahunQuery(url.searchParams);
  if (periode === "INVALID") {
    return badRequest("Query bulan (1-12) dan tahun (4 digit) wajib valid");
  }
  const bulan = periode?.bulan ?? null;
  const tahun = periode?.tahun ?? null;
  const memberId = memberIdRaw && memberIdRaw.trim() !== "" ? memberIdRaw : null;

  // RBAC data-level (KRITIS): ANGGOTA hanya boleh lihat payment miliknya
  // sendiri — filter memberId di-clamp, abaikan query memberId apa pun.
  // ADMIN bebas filter. (Member nonaktif tetap muncul di historis — tanpa
  // filter statusAktif, karena statusAktif bukan kolom Payment.)
  const effectiveMemberId = session.role === "ANGGOTA" ? session.memberId : memberId;

  const payments = await prisma.payment.findMany({
    where: {
      ...(bulan !== null ? { bulan } : {}),
      ...(tahun !== null ? { tahun } : {}),
      ...(effectiveMemberId !== null ? { memberId: effectiveMemberId } : {}),
    },
    include: { member: { select: { nama: true } } },
    orderBy: [{ tahun: "desc" }, { bulan: "desc" }],
  });

  const dtos: PaymentDTO[] = payments.map((p) => toPaymentDTO(p));
  return NextResponse.json(dtos);
}

export async function POST(request: Request) {
  const session = await getSessionOr401();
  if (session instanceof NextResponse) return session;
  const actorId = session.memberId;

  const raw = await request.json().catch(() => null);
  const parsed = createPaymentSchema.safeParse(raw);
  if (!parsed.success) return invalidInput(parsed);
  const body = parsed.data;

  try {
    // FR-21 atomicity: cek 404/409 + create + audit dalam SATU transaksi —
    // sukses/gagal bersama (pola T-17). Tidak ada bcrypt di sini → semua
    // query bisa masuk satu tx.
    const result = await prisma.$transaction(async (tx) => {
      // Cek member exists — termasuk nonaktif (rapel/historis, lihat header).
      // select nama saja: jangan load pinHash (defense-in-depth, T-21).
      const member = await tx.member.findUnique({
        where: { id: body.memberId },
        select: { id: true, nama: true },
      });
      if (!member) return { kind: "not_found" as const };

      // Cek duplikat (constraint unique [memberId, bulan, tahun]) — 409
      // pesan jelas + existingPaymentId. Jaring P2002 di bawah untuk race.
      const existing = await tx.payment.findUnique({
        where: {
          memberId_bulan_tahun: {
            memberId: body.memberId,
            bulan: body.bulan,
            tahun: body.tahun,
          },
        },
      });
      if (existing) return { kind: "conflict" as const, existingId: existing.id };

      const payment = await tx.payment.create({
        data: {
          memberId: body.memberId,
          bulan: body.bulan,
          tahun: body.tahun,
          jumlah: body.jumlah,
          tanggalBayar: new Date(body.tanggalBayar),
        },
      });
      await recordAuditLog(actorId, "CREATE", "Payment", payment.id, null, paymentSnapshot(payment), tx);
      return { kind: "ok" as const, payment, memberNama: member.nama };
    });

    if (result.kind === "not_found") return memberNotFound();
    if (result.kind === "conflict") return alreadyPaid(result.existingId);

    const dto = toPaymentDTO({ ...result.payment, member: { nama: result.memberNama } });
    return NextResponse.json(dto, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      // Race condition: dua POST bersamaan lolos cek aplikasi → constraint
      // unique DB melempar P2002. Re-query untuk existingPaymentId → 409 sama
      // (bukan silent overwrite, bukan redirect ke edit).
      if (err.code === "P2002") {
        const existing = await prisma.payment.findUnique({
          where: {
            memberId_bulan_tahun: {
              memberId: body.memberId,
              bulan: body.bulan,
              tahun: body.tahun,
            },
          },
        });
        return alreadyPaid(existing?.id ?? "");
      }
      // FK violation (P2003): actorId audit log merujuk member sesi yang
      // sudah dihapus manual di DB (tidak ada endpoint hapus member — hanya
      // soft delete). 401, bukan 500 — sesi sudah tidak valid.
      if (err.code === "P2003") {
        return sessionMemberGone();
      }
    }
    throw err;
  }
}
