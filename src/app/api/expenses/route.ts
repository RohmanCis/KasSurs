// =====================================================================
// KasSurs — T-24: GET & POST /api/expenses (FR-09, FR-21)
// Source of truth: .agents/2-TECH-SPEC.md (Bagian 3 tabel API + ExpenseDTO/
// CreateExpenseRequest, Bagian 4 alur, Bagian 5 audit wajib) &
// .agents/1-PRD.md FR-09/FR-21.
// RBAC: middleware (T-12) sudah menolak non-ADMIN sebelum handler ini —
// handler TIDAK cek role lagi, hanya memastikan session valid untuk
// mengambil actorId (audit log). Fallback defensif 401 UNAUTHORIZED.
//
// POST atomicity (FR-21, full-tx pola T-20/T-17 — tanpa bcrypt): cek
// category exists (404) → create expense → recordAuditLog CREATE dalam
// SATU prisma.$transaction (txClient). P2003 (actor sesi hilang dari DB)
// → 401, pola T-20.
//
// Kontrak tanggal (keputusan T-20, HANDOFF): date-only `YYYY-MM-DD` —
// datetime ISO ("2026-08-30T10:00:00Z") ditolak 400 (silent-truncate lebih
// buruk dari 400 jelas). Frontend pakai <input type="date">.
//
// Filter GET: Expense TIDAK punya kolom bulan/tahun (beda Payment) — filter
// periode dihitung sebagai rentang tanggal [awal bulan, awal bulan berikut)
// dari string YYYY-MM-DD (stored sebagai UTC midnight via new Date).
// =====================================================================

import { z } from "zod";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recordAuditLog } from "@/lib/audit";
import { dateOnly, parseBulanTahunQuery } from "@/lib/validation";
import { getSessionOr401 } from "@/lib/api/session";
import { badRequest, invalidInput, sessionMemberGone } from "@/lib/api/respond";
import { categoryNotFound, expenseSnapshot, toExpenseDTO } from "@/lib/dto/expense";
import type { ExpenseDTO } from "@/lib/types";

// deskripsi: trim min 1, TANPA max — konsisten dengan pola string lain di
// repo (members.nama/noHp juga tanpa max). jumlah > 0 di application layer
// (business rule FR-10), bukan DB constraint — nominal bebas (rapel/sumbangan).
// tanggal: dateOnly dari lib/validation (keputusan T-20, roundtrip guard
// gotcha #12 — "2026-02-30" ditolak, bukan silent rollover).
const createExpenseSchema = z.object({
  categoryId: z.string().trim().min(1, "Kategori wajib diisi"),
  deskripsi: z.string().trim().min(1, "Deskripsi wajib diisi"),
  jumlah: z.number().int().positive("Jumlah harus lebih dari 0"),
  tanggal: dateOnly("tanggal"),
});

export async function GET(request: Request) {
  const session = await getSessionOr401();
  if (session instanceof NextResponse) return session;

  const url = new URL(request.url);
  const categoryIdRaw = url.searchParams.get("categoryId");

  // Filter bulan/tahun harus muncul berpasangan & valid (lib/validation) —
  // satu tanpa pasangan atau invalid → 400 (bukan diabaikan diam-diam).
  let dateRange: { gte: Date; lt: Date } | null = null;
  const periode = parseBulanTahunQuery(url.searchParams);
  if (periode === "INVALID") {
    return badRequest("Query bulan (1-12) dan tahun (4 digit) wajib valid");
  }
  if (periode) {
    const { bulan, tahun } = periode;
    // Expense.tanggal disimpan sebagai UTC midnight (new Date("YYYY-MM-DD"))
    // → rentang [awal bulan, awal bulan berikutnya) cocok, tanpa isu timezone.
    dateRange = { gte: new Date(Date.UTC(tahun, bulan - 1, 1)), lt: new Date(Date.UTC(tahun, bulan, 1)) };
  }
  const categoryId = categoryIdRaw && categoryIdRaw.trim() !== "" ? categoryIdRaw : null;

  const expenses = await prisma.expense.findMany({
    where: {
      ...(categoryId !== null ? { categoryId } : {}),
      ...(dateRange !== null ? { tanggal: dateRange } : {}),
    },
    include: { category: { select: { nama: true } } },
    orderBy: [{ tanggal: "desc" }, { createdAt: "desc" }],
  });

  const dtos: ExpenseDTO[] = expenses.map((e) => toExpenseDTO(e));
  return NextResponse.json(dtos);
}

export async function POST(request: Request) {
  const session = await getSessionOr401();
  if (session instanceof NextResponse) return session;
  const actorId = session.memberId;

  const raw = await request.json().catch(() => null);
  const parsed = createExpenseSchema.safeParse(raw);
  if (!parsed.success) return invalidInput(parsed);
  const body = parsed.data;

  try {
    // FR-21 atomicity: cek 404 + create + audit dalam SATU transaksi —
    // sukses/gagal bersama (pola T-20). Tidak ada bcrypt → semua query
    // bisa masuk satu tx.
    const result = await prisma.$transaction(async (tx) => {
      // Cek category exists — select nama saja untuk categoryNama DTO.
      const category = await tx.category.findUnique({
        where: { id: body.categoryId },
        select: { id: true, nama: true },
      });
      if (!category) return { kind: "not_found" as const };

      const expense = await tx.expense.create({
        data: {
          categoryId: body.categoryId,
          deskripsi: body.deskripsi,
          jumlah: body.jumlah,
          tanggal: new Date(body.tanggal),
        },
      });
      await recordAuditLog(actorId, "CREATE", "Expense", expense.id, null, expenseSnapshot(expense), tx);
      return { kind: "ok" as const, expense, categoryNama: category.nama };
    });

    if (result.kind === "not_found") return categoryNotFound();

    const dto = toExpenseDTO({ ...result.expense, category: { nama: result.categoryNama } });
    return NextResponse.json(dto, { status: 201 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      // FK violation (P2003): actorId audit log merujuk member sesi yang
      // sudah dihapus manual di DB (tidak ada endpoint hapus member — hanya
      // soft delete). 401, bukan 500 — sesi sudah tidak valid (pola T-20).
      // Catatan (latent V2, oracle concern): catch ini generik untuk SEMUA
      // FK — satu-satunya FK yang bisa kena di sini adalah actorId audit
      // (categoryId sudah dicek exists di tx). Jika suatu saat ada FK lain,
      // inspeksi `err.meta?.field_name` untuk membedakan — JANGAN ubah
      // perilaku sekarang.
      if (err.code === "P2003") {
        return sessionMemberGone();
      }
    }
    throw err;
  }
}
