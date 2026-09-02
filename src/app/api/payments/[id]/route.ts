// =====================================================================
// KasSurs — T-21: PATCH & DELETE /api/payments/[id] (FR-06, FR-21)
// Source of truth: .agents/2-TECH-SPEC.md (Bagian 3 UpdatePaymentRequest/
// PaymentConflictResponse + Bagian 4 alur edit/hapus: snapshot dataLama
// WAJIB diambil sebelum update) & .agents/1-PRD.md FR-06/FR-21.
// RBAC: middleware (T-12) sudah menolak non-ADMIN sebelum handler ini —
// handler TIDAK cek role lagi, hanya memastikan session valid untuk
// mengambil actorId (audit log).
//
// PATCH: koreksi salah input admin. Semua field opsional (minimal 1 — body
// kosong → 400). memberId TIDAK bisa diubah (payment pindah tangan bukan
// use case; body memberId di-strip Zod). Kalau bulan/tahun diubah ke
// kombinasi yang sudah lunas untuk member SAMA → 409 ALREADY_PAID (kontrak
// EXACT PaymentConflictResponse, sama POST T-20).
//
// DELETE: HARD delete record — satu-satunya entitas yang boleh hard delete
// (koreksi salah catat). Jejak tidak hilang: audit row DELETE menyimpan
// snapshot dataLama lengkap (FR-21 append-only). Status 200 + body
// { deleted: true, id } (bukan 204): UI butuh konfirmasi sukses untuk toast
// + update state (body 204 kosong menyulitkan).
//
// Atomicity (FR-21): snapshot → cek 409 → update/delete → recordAuditLog
// dalam SATU prisma.$transaction (txClient) — sukses/gagal bersama (pola
// T-17/T-20). Jaring P2002 (race) → re-query → 409; P2003 (actor sesi
// hilang di DB) → 401, bukan 500.
// =====================================================================

import { z } from "zod";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import { dateOnly, minimalSatuField } from "@/lib/validation";
import type {
  DeletePaymentResponse,
  PaymentConflictResponse,
  PaymentDTO,
  PaymentItemErrorResponse,
} from "@/lib/types";

// Validasi sama T-20 (jumlah > 0 di application layer, bulan 1-12, tahun 4
// digit, tanggalBayar date-only) — semua opsional; minimalSatuField menjamin
// minimal satu field diisi (body {} → 400). memberId sengaja TIDAK ada di
// skema: unknown key di-strip Zod default, jadi field memberId di body
// diabaikan (keputusan didokumentasikan di types.ts UpdatePaymentRequest).
const updatePaymentSchema = minimalSatuField(
  z.object({
    jumlah: z.number().int().positive("Jumlah harus lebih dari 0").optional(),
    tanggalBayar: dateOnly("tanggalBayar").optional(),
    bulan: z.number().int().min(1, "Bulan harus 1-12").max(12, "Bulan harus 1-12").optional(),
    tahun: z.number().int().min(1000, "Tahun harus 4 digit").max(9999, "Tahun harus 4 digit").optional(),
  }),
);

function badRequest(message: string): NextResponse<PaymentItemErrorResponse> {
  return NextResponse.json({ error: "INVALID_INPUT", message }, { status: 400 });
}

function unauthorized(): NextResponse<PaymentItemErrorResponse> {
  // Fallback defensif — normalnya middleware (T-12) sudah menolak duluan.
  return NextResponse.json(
    { error: "UNAUTHORIZED", message: "Belum login atau sesi kedaluwarsa" },
    { status: 401 },
  );
}

function notFound(): NextResponse<PaymentItemErrorResponse> {
  return NextResponse.json(
    { error: "PAYMENT_NOT_FOUND", message: "Pembayaran tidak ditemukan" },
    { status: 404 },
  );
}

// Body EXACT PaymentConflictResponse (kontrak wajib — pesan literal, sama
// POST T-20): jangan ubah message.
function alreadyPaid(existingPaymentId: string): NextResponse<PaymentConflictResponse> {
  return NextResponse.json(
    { error: "ALREADY_PAID", message: "Sudah lunas bulan ini", existingPaymentId },
    { status: 409 },
  );
}

// Snapshot aman untuk audit log (FR-21) — tanggal sebagai ISO string.
// Duplikat lokal dari T-20 (paymentSnapshot) agar file ini mandiri; pola
// sama, perubahan konsisten di kedua tempat.
function paymentSnapshot(p: {
  id: string;
  memberId: string;
  bulan: number;
  tahun: number;
  jumlah: number;
  tanggalBayar: Date;
  createdAt: Date;
}): Record<string, unknown> {
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

// Serialisasi ke PaymentDTO (duplikat lokal T-20 — memberNama denormalized).
function toPaymentDTO(p: {
  id: string;
  memberId: string;
  memberNama: string;
  bulan: number;
  tahun: number;
  jumlah: number;
  tanggalBayar: Date | string;
  createdAt: Date | string;
}): PaymentDTO {
  return {
    id: p.id,
    memberId: p.memberId,
    memberNama: p.memberNama, // denormalized — bukan field asli tabel
    bulan: p.bulan,
    tahun: p.tahun,
    jumlah: p.jumlah,
    tanggalBayar:
      typeof p.tanggalBayar === "string" ? p.tanggalBayar : p.tanggalBayar.toISOString().slice(0, 10),
    createdAt: typeof p.createdAt === "string" ? p.createdAt : p.createdAt.toISOString(),
  };
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!token) return unauthorized();
  const session = await verifySession(token);
  if (!session) return unauthorized();
  const actorId = session.memberId;

  const { id } = params;

  const raw = await request.json().catch(() => null);
  const parsed = updatePaymentSchema.safeParse(raw);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Input tidak valid");
  }
  const body = parsed.data;

  try {
    // FR-21 atomicity: snapshot dataLama → cek duplikat → update → audit
    // dalam SATU transaksi — sukses/gagal bersama (pola T-17).
    const result = await prisma.$transaction(async (tx) => {
      // Snapshot dataLama WAJIB diambil SEBELUM update (Bagian 4 alur edit).
      const existing = await tx.payment.findUnique({ where: { id } });
      if (!existing) return { kind: "not_found" as const };

      // Duplikat BARU: bulan/tahun diubah ke kombinasi yang sudah ada untuk
      // member SAMA → 409 (kontrak EXACT). Kombinasi yang tidak berubah
      // adalah record ini sendiri — tidak perlu dicek.
      if (body.bulan !== undefined || body.tahun !== undefined) {
        const bulanBaru = body.bulan ?? existing.bulan;
        const tahunBaru = body.tahun ?? existing.tahun;
        if (bulanBaru !== existing.bulan || tahunBaru !== existing.tahun) {
          const dup = await tx.payment.findUnique({
            where: {
              memberId_bulan_tahun: {
                memberId: existing.memberId,
                bulan: bulanBaru,
                tahun: tahunBaru,
              },
            },
          });
          if (dup) return { kind: "conflict" as const, existingId: dup.id };
        }
      }

      // include member: memberNama untuk DTO (denormalized) — memberId tidak
      // berubah di PATCH, jadi nama member ini valid tanpa query terpisah.
      const updated = await tx.payment.update({
        where: { id },
        data: {
          ...(body.jumlah !== undefined ? { jumlah: body.jumlah } : {}),
          ...(body.tanggalBayar !== undefined ? { tanggalBayar: new Date(body.tanggalBayar) } : {}),
          ...(body.bulan !== undefined ? { bulan: body.bulan } : {}),
          ...(body.tahun !== undefined ? { tahun: body.tahun } : {}),
        },
        include: { member: { select: { nama: true } } },
      });

      await recordAuditLog(
        actorId,
        "UPDATE",
        "Payment",
        id,
        paymentSnapshot(existing),
        paymentSnapshot(updated),
        tx,
      );
      return { kind: "ok" as const, payment: updated };
    });

    if (result.kind === "not_found") return notFound();
    if (result.kind === "conflict") return alreadyPaid(result.existingId);

    const dto = toPaymentDTO({
      id: result.payment.id,
      memberId: result.payment.memberId,
      memberNama: result.payment.member.nama, // denormalized
      bulan: result.payment.bulan,
      tahun: result.payment.tahun,
      jumlah: result.payment.jumlah,
      tanggalBayar: result.payment.tanggalBayar,
      createdAt: result.payment.createdAt,
    });
    return NextResponse.json(dto, { status: 200 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      // Race: dua PATCH bersamaan mengubah ke kombinasi bulan/tahun baru yang
      // sama → constraint unique DB melempar P2002 → re-query → 409 sama.
      if (err.code === "P2002") {
        const existing = await prisma.payment.findUnique({ where: { id } });
        if (!existing) return notFound();
        const bulanBaru = body.bulan ?? existing.bulan;
        const tahunBaru = body.tahun ?? existing.tahun;
        const dup = await prisma.payment.findUnique({
          where: {
            memberId_bulan_tahun: {
              memberId: existing.memberId,
              bulan: bulanBaru,
              tahun: tahunBaru,
            },
          },
        });
        return alreadyPaid(dup?.id ?? "");
      }
      // FK violation actorId audit log → member sesi hilang di DB → 401.
      if (err.code === "P2003") {
        return NextResponse.json(
          { error: "UNAUTHORIZED", message: "Sesi merujuk ke anggota yang tidak ada lagi" },
          { status: 401 },
        );
      }
    }
    throw err;
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!token) return unauthorized();
  const session = await verifySession(token);
  if (!session) return unauthorized();
  const actorId = session.memberId;

  const { id } = params;

  const result = await prisma.$transaction(async (tx) => {
    // Snapshot dataLama SEBELUM delete — jejak historis tetap ada walau
    // record payment terhapus (hard delete = koreksi salah catat; audit row
    // menyimpan snapshot lengkap, FR-21 append-only).
    const existing = await tx.payment.findUnique({ where: { id } });
    if (!existing) return { kind: "not_found" as const };

    await tx.payment.delete({ where: { id } });
    await recordAuditLog(actorId, "DELETE", "Payment", id, paymentSnapshot(existing), null, tx);
    return { kind: "ok" as const };
  });

  if (result.kind === "not_found") return notFound();

  const body: DeletePaymentResponse = { deleted: true, id };
  return NextResponse.json(body, { status: 200 });
}
