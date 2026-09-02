// =====================================================================
// KasSurs — API Handler Kit #1: builder DTO/response Category
// Unify inline CategoryDTO di categories/route.ts (GET + POST).
// Sumber literal response: T-23 (kontrak types.ts) — JANGAN diubah.
// =====================================================================

import { NextResponse } from "next/server";
import type { Category } from "@prisma/client";
import type { CategoryDTO } from "@/lib/types";

export function toCategoryDTO(c: Category): CategoryDTO {
  return {
    id: c.id,
    nama: c.nama,
    isDefault: c.isDefault,
  };
}

// 409 — nama kategori sudah ada (pre-check + jaring P2002). Re-query tidak
// ada: response no-op langsung (T-23).
export function categoryExists(): NextResponse {
  return NextResponse.json(
    { error: "CATEGORY_EXISTS", message: "Kategori sudah ada" },
    { status: 409 },
  );
}
