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
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordAuditLog } from "@/lib/audit";
import { dateOnly, minimalSatuField } from "@/lib/validation";
import { getSessionOr401 } from "@/lib/api/session";
import { invalidInput, sessionMemberGone } from "@/lib/api/respond";
import { alreadyPaid, paymentNotFound, paymentSnapshot, toPaymentDTO } from "@/lib/dto/payment";
import type { DeletePaymentResponse } from "@/lib/types";

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

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionOr401();
  if (session instanceof NextResponse) return session;
  const actorId = session.memberId;

  const { id } = params;

  const raw = await request.json().catch(() => null);
  const parsed = updatePaymentSchema.safeParse(raw);
  if (!parsed.success) return invalidInput(parsed);
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

    if (result.kind === "not_found") return paymentNotFound();
    if (result.kind === "conflict") return alreadyPaid(result.existingId);

    const dto = toPaymentDTO(result.payment);
    return NextResponse.json(dto, { status: 200 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      // Race: dua PATCH bersamaan mengubah ke kombinasi bulan/tahun baru yang
      // sama → constraint unique DB melempar P2002 → re-query → 409 sama.
      if (err.code === "P2002") {
        const existing = await prisma.payment.findUnique({ where: { id } });
        if (!existing) return paymentNotFound();
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
        return sessionMemberGone();
      }
    }
    throw err;
  }
}

export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionOr401();
  if (session instanceof NextResponse) return session;
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

  if (result.kind === "not_found") return paymentNotFound();

  const body: DeletePaymentResponse = { deleted: true, id };
  return NextResponse.json(body, { status: 200 });
}
