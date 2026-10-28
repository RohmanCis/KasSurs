// =====================================================================
// KasSurs — T-33: GET /api/reports/excel (FR-16, FR-17, FR-23)
// Source of truth: .agents/2-TECH-SPEC.md (Bagian 3 tabel API + Bagian 4
// "Alur Export Laporan") & .agents/1-PRD.md FR-16/FR-17/FR-23.
// RBAC: middleware (T-12) menolak ANGGOTA sebelum handler — handler cukup
// memastikan session valid (fallback defensif 401, pola T-24).
//
// FR-23: getOrCreateSnapshot — PDF & Excel periode sama bersumber satu
// snapshot → angka identik antar format (mekanisme di report-snapshot.ts).
// Jalur ini MURNI BACA: koreksi snapshot pindah ke POST
// /api/reports/regenerate (L-01), query param asing (termasuk sisa
// `?regenerate=true`) → 400 (schema strict).
// =====================================================================

import { NextResponse } from "next/server";
import { getOrCreateSnapshot, reportQuerySchema, RegenerateBusyError } from "@/lib/report-snapshot";
import { generateReportExcel } from "@/lib/export/excel";
import { getSessionOr401 } from "@/lib/api/session";
import { badRequest, reportFailed, serviceBusy } from "@/lib/api/respond";
import type { ReportSnapshotPayload } from "@/lib/types";

export async function GET(request: Request) {
  const session = await getSessionOr401();
  if (session instanceof NextResponse) return session;
  // RBAC ANGGOTA→403 sudah ditangani middleware (/api/reports ADMIN-only).

  const url = new URL(request.url);
  // Seluruh searchParams di-parse (bukan hanya bulan/tahun): schema strict →
  // param tak dikenal jadi 400, bukan di-strip diam-diam.
  const parsed = reportQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Query bulan/tahun tidak valid");
  }

  // Default periode: bulan berjalan (FR-17) — UTC, konsisten storage.
  const now = new Date();
  const bulan = parsed.data.bulan ?? now.getUTCMonth() + 1;
  const tahun = parsed.data.tahun ?? now.getUTCFullYear();

  let payload: ReportSnapshotPayload;
  try {
    payload = await getOrCreateSnapshot(bulan, tahun, session.memberId);
  } catch (err) {
    // Transaksi perhitungan snapshot timeout/bentrok (P2028/P2034) → 503.
    if (err instanceof RegenerateBusyError) return serviceBusy();
    console.error("export laporan Excel gagal:", err);
    return reportFailed();
  }
  const buf = generateReportExcel(payload);

  const filename = `laporan-kas-${tahun}-${String(bulan).padStart(2, "0")}.xlsx`;
  // BodyInit: Buffer (subclass Uint8Array<ArrayBufferLike>) tidak assignable
  // ke BodyInit di TS 5.7 — cast eksplisit, runtime tetap Uint8Array valid.
  return new Response(new Uint8Array(buf) as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
