// =====================================================================
// KasSurs — T-23: GET & POST /api/categories (FR-08)
// Source of truth: .agents/2-TECH-SPEC.md (Bagian 3 tabel API + CategoryDTO)
// & .agents/1-PRD.md FR-08.
// RBAC: middleware (T-12) sudah menolak non-ADMIN sebelum handler ini —
// handler TIDAK cek role lagi, hanya memastikan session valid (verifikasi
// saja, tanpa duplikasi cek role; fallback defensif 401 UNAUTHORIZED).
//
// TIDAK ada audit log di sini: spec Bagian 2/5 — audit wajib HANYA untuk
// create/update/delete Payment & Expense (FR-21), bukan Category/Member-
// kecuali Member tercatat di T-16 sebagai keputusan tambahan.
//
// Duplikat nama (Category.nama @unique) → pre-check 409 CATEGORY_EXISTS
// + jaring P2002 untuk race condition (pola T-16/T-17). Sukses → 201
// CategoryDTO (isDefault=false — kategori custom, default hanya dari seed).
// =====================================================================

import { z } from "zod";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionOr401 } from "@/lib/api/session";
import { invalidInput } from "@/lib/api/respond";
import { categoryExists, toCategoryDTO } from "@/lib/dto/category";
import type { CategoryDTO } from "@/lib/types";

// nama: trim, min 1, max 50 — batasan wajar (task T-23); repo tidak punya
// max string lain, jadi 50 dipakai eksplisit untuk nama kategori.
const createCategorySchema = z.object({
  nama: z.string().trim().min(1, "Nama kategori wajib diisi").max(50, "Nama kategori maksimal 50 karakter"),
});

export async function GET() {
  const session = await getSessionOr401();
  if (session instanceof NextResponse) return session;

  // Urutan: isDefault desc (kategori default seed di atas) lalu nama asc.
  const categories = await prisma.category.findMany({
    orderBy: [{ isDefault: "desc" }, { nama: "asc" }],
  });

  const dtos: CategoryDTO[] = categories.map((c) => toCategoryDTO(c));
  return NextResponse.json(dtos);
}

export async function POST(request: Request) {
  const session = await getSessionOr401();
  if (session instanceof NextResponse) return session;

  const raw = await request.json().catch(() => null);
  const parsed = createCategorySchema.safeParse(raw);
  if (!parsed.success) return invalidInput(parsed);
  const body = parsed.data;

  // Pre-check duplikat (409 pesan jelas) — jaring P2002 di bawah untuk race.
  const existing = await prisma.category.findUnique({ where: { nama: body.nama } });
  if (existing) return categoryExists();

  try {
    const category = await prisma.category.create({
      data: { nama: body.nama, isDefault: false },
    });
    // Tanpa tx & tanpa audit: create tunggal, bukan Payment/Expense (FR-21).
    const dto = toCategoryDTO(category);
    return NextResponse.json(dto, { status: 201 });
  } catch (err) {
    // Race: dua POST nama sama bersamaan → constraint unique DB melempar
    // P2002 → 409 sama (bukan 500).
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return categoryExists();
    }
    throw err;
  }
}
