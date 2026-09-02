// =====================================================================
// KasSurs — Validation module (architecture review #4, 2026-09-03)
// Satu sumber untuk aturan Zod/query yang sebelumnya disalin antar route
// handler: date-only roundtrip refine ×4, "minimal satu field" refine ×3,
// query bulan/tahun berpasangan ×3.
//
// KRITIS — jangan regressed (gotcha #12): Date.parse TIDAK menolak tanggal
// kalender invalid ("2026-02-30" lolos regex + NaN check, V8 silent
// rollover → Mar 2). Validasi date-only WAJIB roundtrip:
//   new Date(s).toISOString().slice(0,10) === s
// =====================================================================

import { z } from "zod";

// Field tanggal date-only YYYY-MM-DD. Factory (bukan konstanta) karena
// pesan error memuat nama field — pesan literal adalah kontrak response
// 400 yang di-assert integration test ("tanggalBayar …" vs "tanggal …").
export function dateOnly(fieldName: string) {
  return z
    .string()
    .refine(
      (s) =>
        /^\d{4}-\d{2}-\d{2}$/.test(s) &&
        !Number.isNaN(Date.parse(s)) &&
        new Date(s).toISOString().slice(0, 10) === s,
      `${fieldName} harus tanggal ISO (YYYY-MM-DD)`,
    );
}

// Wrapper PATCH: semua field opsional, minimal satu wajib diisi
// (body {} → 400). Dipakai payments/[id], expenses/[id], members/[id].
export function minimalSatuField<Shape extends z.ZodRawShape>(
  schema: z.ZodObject<Shape>,
) {
  return schema.refine((v) => Object.keys(v).length > 0, "Minimal satu field wajib diisi");
}

// Query ?bulan=&tahun= harus muncul BERPASANGAN & valid — satu tanpa
// pasangan atau invalid → "INVALID" (caller memetakan ke 400 dengan pesan
// literal masing-masing). Absen keduanya → null (tanpa filter).
export type BulanTahun = { bulan: number; tahun: number };

export function parseBulanTahunQuery(
  searchParams: URLSearchParams,
): BulanTahun | null | "INVALID" {
  const bulanRaw = searchParams.get("bulan");
  const tahunRaw = searchParams.get("tahun");
  if (bulanRaw === null && tahunRaw === null) return null;
  const bulanOk =
    /^\d{1,2}$/.test(bulanRaw ?? "") && Number(bulanRaw) >= 1 && Number(bulanRaw) <= 12;
  const tahunOk = /^\d{4}$/.test(tahunRaw ?? "");
  if (!bulanOk || !tahunOk) return "INVALID";
  return { bulan: Number(bulanRaw), tahun: Number(tahunRaw) };
}
