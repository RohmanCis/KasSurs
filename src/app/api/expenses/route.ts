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
import { cookies } from "next/headers";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import { dateOnly, parseBulanTahunQuery } from "@/lib/validation";
import type { ExpenseDTO, ExpenseErrorResponse } from "@/lib/types";

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

function badRequest(message: string): NextResponse<ExpenseErrorResponse> {
  return NextResponse.json({ error: "INVALID_INPUT", message }, { status: 400 });
}

function unauthorized(): NextResponse<ExpenseErrorResponse> {
  // Fallback defensif — normalnya middleware (T-12) sudah menolak duluan.
  // Error code disamakan dengan middleware (UNAUTHORIZED) agar konsisten.
  return NextResponse.json(
    { error: "UNAUTHORIZED", message: "Belum login atau sesi kedaluwarsa" },
    { status: 401 },
  );
}

function notFound(): NextResponse<ExpenseErrorResponse> {
  return NextResponse.json(
    { error: "CATEGORY_NOT_FOUND", message: "Kategori tidak ditemukan" },
    { status: 404 },
  );
}

// Serialisasi ke ExpenseDTO. categoryNama adalah field denormalized (bukan
// field asli tabel Expense) — berasal dari relasi category, untuk kemudahan
// render list. Tanggal selalu ISO 8601 date-only (konvensi proyek).
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

// Snapshot aman untuk audit log (FR-21) — tanggal sebagai ISO date string.
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

export async function GET(request: Request) {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!token) return unauthorized();
  const session = await verifySession(token);
  if (!session) return unauthorized();

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

  const dtos: ExpenseDTO[] = expenses.map((e) =>
    toExpenseDTO({
      id: e.id,
      categoryId: e.categoryId,
      categoryNama: e.category.nama, // denormalized
      deskripsi: e.deskripsi,
      jumlah: e.jumlah,
      tanggal: e.tanggal,
      createdAt: e.createdAt,
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
  const parsed = createExpenseSchema.safeParse(raw);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Input tidak valid");
  }
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

    if (result.kind === "not_found") return notFound();

    const dto = toExpenseDTO({
      id: result.expense.id,
      categoryId: result.expense.categoryId,
      categoryNama: result.categoryNama, // denormalized
      deskripsi: result.expense.deskripsi,
      jumlah: result.expense.jumlah,
      tanggal: result.expense.tanggal,
      createdAt: result.expense.createdAt,
    });
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
        return NextResponse.json(
          { error: "UNAUTHORIZED", message: "Sesi merujuk ke anggota yang tidak ada lagi" },
          { status: 401 },
        );
      }
    }
    throw err;
  }
}
