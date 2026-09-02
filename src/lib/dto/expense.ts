// =====================================================================
// KasSurs — API Handler Kit #1: builder DTO/snapshot/response Expense
// Unify duplikat yang tadinya inline per-file:
// - toExpenseDTO: expenses/route.ts + expenses/[id]/route.ts
// - expenseSnapshot: expenses/route.ts + expenses/[id]/route.ts (audit, FR-21)
// Sumber literal response: T-24/T-25 (kontrak types.ts) — JANGAN diubah.
// =====================================================================

import { NextResponse } from "next/server";
import type { Expense } from "@prisma/client";
import type { ExpenseDTO } from "@/lib/types";

// Serialisasi ke ExpenseDTO. categoryNama adalah field denormalized (bukan
// field asli tabel Expense) — berasal dari relasi category. Tanggal selalu
// ISO 8601: tanggal date-only, createdAt datetime (konvensi proyek).
export function toExpenseDTO(e: Expense & { category: { nama: string } }): ExpenseDTO {
  return {
    id: e.id,
    categoryId: e.categoryId,
    categoryNama: e.category.nama, // denormalized — bukan field asli tabel
    deskripsi: e.deskripsi,
    jumlah: e.jumlah,
    tanggal: e.tanggal.toISOString().slice(0, 10),
    createdAt: e.createdAt.toISOString(),
  };
}

// Snapshot aman untuk audit log (FR-21) — tanggal sebagai ISO string.
// Field dipilih persis seperti implementasi awal: updatedAt tidak ikut.
export function expenseSnapshot(e: Expense): Record<string, unknown> {
  return {
    id: e.id,
    categoryId: e.categoryId,
    deskripsi: e.deskripsi,
    jumlah: e.jumlah,
    tanggal: e.tanggal.toISOString().slice(0, 10),
    createdAt: e.createdAt.toISOString(),
  };
}

// 404 — expense target tidak ada (T-25).
export function expenseNotFound(): NextResponse {
  return NextResponse.json(
    { error: "EXPENSE_NOT_FOUND", message: "Pengeluaran tidak ditemukan" },
    { status: 404 },
  );
}

// 404 — categoryId di body tidak ditemukan (T-24/T-25).
export function categoryNotFound(): NextResponse {
  return NextResponse.json(
    { error: "CATEGORY_NOT_FOUND", message: "Kategori tidak ditemukan" },
    { status: 404 },
  );
}
