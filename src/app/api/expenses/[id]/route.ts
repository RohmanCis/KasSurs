// =====================================================================
// KasSurs — T-25: PATCH & DELETE /api/expenses/[id] (FR-09, FR-21)
// Source of truth: .agents/2-TECH-SPEC.md (Bagian 3 UpdateExpenseRequest/
// ExpenseDTO + Bagian 4 alur edit/hapus: snapshot dataLama WAJIB diambil
// sebelum update) & .agents/1-PRD.md FR-09/FR-21.
// RBAC: middleware (T-12) sudah menolak non-ADMIN sebelum handler ini —
// handler TIDAK cek role lagi, hanya memastikan session valid untuk
// mengambil actorId (audit log). Fallback defensif 401 UNAUTHORIZED.
//
// PATCH: partial update (koreksi salah input admin). Semua field opsional
// (minimal 1 — body kosong → 400). Validasi Zod identik POST T-24: jumlah
// int > 0, tanggal date-only + roundtrip rollover check, deskripsi trim
// min 1, categoryId non-empty. categoryId BARU wajib exists (404).
//
// DELETE: HARD delete record (koreksi salah catat). Jejak tidak hilang:
// audit row DELETE menyimpan snapshot dataLama lengkap (FR-21 append-only).
// Status 200 + body { deleted: true, id } (bukan 204) — UI butuh konfirmasi
// sukses + update state (pola T-21).
//
// Atomicity (FR-21): snapshot dataLama → cek 404 → update/delete →
// recordAuditLog dalam SATU prisma.$transaction (txClient) — sukses/gagal
// bersama (pola T-17/T-20/T-21). P2003 (actor sesi hilang di DB) → 401,
// bukan 500. Tidak ada P2002: Expense tidak punya constraint unique.
// =====================================================================

import { z } from "zod";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import type { DeleteExpenseResponse, ExpenseDTO, ExpenseErrorResponse } from "@/lib/types";

// Validasi sama POST T-24 — semua opsional; refine menjamin minimal satu
// field diisi (body {} → 400).
const updateExpenseSchema = z
  .object({
    categoryId: z.string().trim().min(1, "Kategori wajib diisi").optional(),
    deskripsi: z.string().trim().min(1, "Deskripsi wajib diisi").optional(),
    jumlah: z.number().int().positive("Jumlah harus lebih dari 0").optional(),
    tanggal: z
      .string()
      .refine(
        (s) =>
          /^\d{4}-\d{2}-\d{2}$/.test(s) &&
          !Number.isNaN(Date.parse(s)) &&
          new Date(s).toISOString().slice(0, 10) === s,
        "tanggal harus tanggal ISO (YYYY-MM-DD)",
      )
      .optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Minimal satu field wajib diisi");

function badRequest(message: string): NextResponse<ExpenseErrorResponse> {
  return NextResponse.json({ error: "INVALID_INPUT", message }, { status: 400 });
}

function unauthorized(): NextResponse<ExpenseErrorResponse> {
  // Fallback defensif — normalnya middleware (T-12) sudah menolak duluan.
  return NextResponse.json(
    { error: "UNAUTHORIZED", message: "Belum login atau sesi kedaluwarsa" },
    { status: 401 },
  );
}

function notFound(): NextResponse<ExpenseErrorResponse> {
  return NextResponse.json(
    { error: "EXPENSE_NOT_FOUND", message: "Pengeluaran tidak ditemukan" },
    { status: 404 },
  );
}

function categoryNotFound(): NextResponse<ExpenseErrorResponse> {
  return NextResponse.json(
    { error: "CATEGORY_NOT_FOUND", message: "Kategori tidak ditemukan" },
    { status: 404 },
  );
}

// Snapshot aman untuk audit log (FR-21) — tanggal sebagai ISO date string.
// Duplikat lokal dari T-24 (expenseSnapshot) agar file ini mandiri; pola
// sama, perubahan konsisten di kedua tempat.
function expenseSnapshot(e: {
  id: string;
  categoryId: string;
  deskripsi: string;
  jumlah: number;
  tanggal: Date;
  createdAt: Date;
}): Record<string, unknown> {
  return {
    id: e.id,
    categoryId: e.categoryId,
    deskripsi: e.deskripsi,
    jumlah: e.jumlah,
    tanggal: e.tanggal.toISOString().slice(0, 10),
    createdAt: e.createdAt.toISOString(),
  };
}

// Serialisasi ke ExpenseDTO (duplikat lokal T-24 — categoryNama denormalized).
function toExpenseDTO(e: {
  id: string;
  categoryId: string;
  categoryNama: string;
  deskripsi: string;
  jumlah: number;
  tanggal: Date | string;
  createdAt: Date | string;
}): ExpenseDTO {
  return {
    id: e.id,
    categoryId: e.categoryId,
    categoryNama: e.categoryNama, // denormalized — bukan field asli tabel
    deskripsi: e.deskripsi,
    jumlah: e.jumlah,
    tanggal: typeof e.tanggal === "string" ? e.tanggal : e.tanggal.toISOString().slice(0, 10),
    createdAt: typeof e.createdAt === "string" ? e.createdAt : e.createdAt.toISOString(),
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
  const parsed = updateExpenseSchema.safeParse(raw);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Input tidak valid");
  }
  const body = parsed.data;

  try {
    // FR-21 atomicity: snapshot dataLama → cek category baru → update →
    // audit dalam SATU transaksi — sukses/gagal bersama (pola T-21).
    const result = await prisma.$transaction(async (tx) => {
      // Snapshot dataLama WAJIB diambil SEBELUM update (Bagian 4 alur edit).
      const existing = await tx.expense.findUnique({ where: { id } });
      if (!existing) return { kind: "not_found" as const };

      // categoryId baru wajib ada di DB (404) — dicek DI DALAM tx agar
      // rollback bersama audit kalau update gagal.
      if (body.categoryId !== undefined) {
        const category = await tx.category.findUnique({
          where: { id: body.categoryId },
          select: { id: true },
        });
        if (!category) return { kind: "category_not_found" as const };
      }

      // include category: categoryNama untuk DTO (denormalized).
      const updated = await tx.expense.update({
        where: { id },
        data: {
          ...(body.categoryId !== undefined ? { categoryId: body.categoryId } : {}),
          ...(body.deskripsi !== undefined ? { deskripsi: body.deskripsi } : {}),
          ...(body.jumlah !== undefined ? { jumlah: body.jumlah } : {}),
          ...(body.tanggal !== undefined ? { tanggal: new Date(body.tanggal) } : {}),
        },
        include: { category: { select: { nama: true } } },
      });

      await recordAuditLog(
        actorId,
        "UPDATE",
        "Expense",
        id,
        expenseSnapshot(existing),
        expenseSnapshot(updated),
        tx,
      );
      return { kind: "ok" as const, expense: updated };
    });

    if (result.kind === "not_found") return notFound();
    if (result.kind === "category_not_found") return categoryNotFound();

    const dto = toExpenseDTO({
      id: result.expense.id,
      categoryId: result.expense.categoryId,
      categoryNama: result.expense.category.nama, // denormalized
      deskripsi: result.expense.deskripsi,
      jumlah: result.expense.jumlah,
      tanggal: result.expense.tanggal,
      createdAt: result.expense.createdAt,
    });
    return NextResponse.json(dto, { status: 200 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      // FK violation actorId audit log → member sesi hilang di DB → 401.
      // (categoryId sudah dicek exists di tx — satu-satunya FK lain adalah
      // actorId; jika suatu saat ada FK lain, inspeksi err.meta?.field_name.)
      return NextResponse.json(
        { error: "UNAUTHORIZED", message: "Sesi merujuk ke anggota yang tidak ada lagi" },
        { status: 401 },
      );
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
    // record expense terhapus (hard delete = koreksi salah catat; audit row
    // menyimpan snapshot lengkap, FR-21 append-only).
    const existing = await tx.expense.findUnique({ where: { id } });
    if (!existing) return { kind: "not_found" as const };

    await tx.expense.delete({ where: { id } });
    await recordAuditLog(actorId, "DELETE", "Expense", id, expenseSnapshot(existing), null, tx);
    return { kind: "ok" as const };
  });

  if (result.kind === "not_found") return notFound();

  const body: DeleteExpenseResponse = { deleted: true, id };
  return NextResponse.json(body, { status: 200 });
}
