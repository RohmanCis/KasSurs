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
import { cookies } from "next/headers";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import type {
  PaymentDTO,
  PaymentConflictResponse,
  PaymentInputErrorResponse,
} from "@/lib/types";

// Jumlah > 0 divalidasi di application layer (business rule Bagian 4) —
// BUKAN DB constraint; nominal boleh beda dari 30000 (rapel/sumbangan).
const createPaymentSchema = z.object({
  memberId: z.string().trim().min(1, "Member wajib diisi"),
  bulan: z.number().int().min(1, "Bulan harus 1-12").max(12, "Bulan harus 1-12"),
  tahun: z.number().int().min(1000, "Tahun harus 4 digit").max(9999, "Tahun harus 4 digit"),
  jumlah: z.number().int().positive("Jumlah harus lebih dari 0"),
  tanggalBayar: z
    .string()
    .refine(
      (s) =>
        /^\d{4}-\d{2}-\d{2}$/.test(s) &&
        !Number.isNaN(Date.parse(s)) &&
        new Date(s).toISOString().slice(0, 10) === s,
      "tanggalBayar harus tanggal ISO (YYYY-MM-DD)",
    ),
});

function badRequest(message: string): NextResponse<PaymentInputErrorResponse> {
  return NextResponse.json({ error: "INVALID_INPUT", message }, { status: 400 });
}

function unauthorized(): NextResponse<PaymentInputErrorResponse> {
  // Fallback defensif — normalnya middleware (T-12) sudah menolak duluan.
  // Error code disamakan dengan middleware (UNAUTHORIZED) agar konsisten.
  return NextResponse.json(
    { error: "UNAUTHORIZED", message: "Belum login atau sesi kedaluwarsa" },
    { status: 401 },
  );
}

function notFound(): NextResponse<PaymentInputErrorResponse> {
  return NextResponse.json(
    { error: "MEMBER_NOT_FOUND", message: "Anggota tidak ditemukan" },
    { status: 404 },
  );
}

// Body EXACT PaymentConflictResponse (kontrak wajib — pesan literal, bukan
// interpolasi): jangan ubah message.
function alreadyPaid(existingPaymentId: string): NextResponse<PaymentConflictResponse> {
  return NextResponse.json(
    { error: "ALREADY_PAID", message: "Sudah lunas bulan ini", existingPaymentId },
    { status: 409 },
  );
}

// Serialisasi ke PaymentDTO. memberNama adalah field denormalized (bukan
// field asli tabel Payment) — berasal dari relasi member, untuk kemudahan
// render list. Tanggal selalu ISO 8601 (konvensi proyek).
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

// Snapshot aman untuk audit log (FR-21) — tanggal sebagai ISO string.
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

export async function GET(request: Request) {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!token) return unauthorized();
  const session = await verifySession(token);
  if (!session) return unauthorized();

  const url = new URL(request.url);
  const bulanRaw = url.searchParams.get("bulan");
  const tahunRaw = url.searchParams.get("tahun");
  const memberIdRaw = url.searchParams.get("memberId");

  // Filter bulan/tahun harus muncul berpasangan & valid (pola T-16) — satu
  // tanpa pasangan atau invalid → 400 (bukan diabaikan diam-diam).
  let bulan: number | null = null;
  let tahun: number | null = null;
  if (bulanRaw !== null || tahunRaw !== null) {
    const bulanOk = /^\d{1,2}$/.test(bulanRaw ?? "") && Number(bulanRaw) >= 1 && Number(bulanRaw) <= 12;
    const tahunOk = /^\d{4}$/.test(tahunRaw ?? "");
    if (!bulanOk || !tahunOk) {
      return badRequest("Query bulan (1-12) dan tahun (4 digit) wajib valid");
    }
    bulan = Number(bulanRaw);
    tahun = Number(tahunRaw);
  }
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

  const dtos: PaymentDTO[] = payments.map((p) =>
    toPaymentDTO({
      id: p.id,
      memberId: p.memberId,
      memberNama: p.member.nama, // denormalized
      bulan: p.bulan,
      tahun: p.tahun,
      jumlah: p.jumlah,
      tanggalBayar: p.tanggalBayar,
      createdAt: p.createdAt,
    }),
  );
  return NextResponse.json(dtos);
}

export async function POST(request: Request) {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!token) return unauthorized();
  const session = await verifySession(token);
  if (!session) return unauthorized();
  const actorId = session.memberId;

  const raw = await request.json().catch(() => null);
  const parsed = createPaymentSchema.safeParse(raw);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Input tidak valid");
  }
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

    if (result.kind === "not_found") return notFound();
    if (result.kind === "conflict") return alreadyPaid(result.existingId);

    const dto = toPaymentDTO({
      id: result.payment.id,
      memberId: result.payment.memberId,
      memberNama: result.memberNama, // denormalized
      bulan: result.payment.bulan,
      tahun: result.payment.tahun,
      jumlah: result.payment.jumlah,
      tanggalBayar: result.payment.tanggalBayar,
      createdAt: result.payment.createdAt,
    });
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
        return NextResponse.json(
          { error: "UNAUTHORIZED", message: "Sesi merujuk ke anggota yang tidak ada lagi" },
          { status: 401 },
        );
      }
    }
    throw err;
  }
}
