// =====================================================================
// KasSurs — T-33: GET /api/reports/pdf (FR-15, FR-17, FR-23)
// Source of truth: .agents/2-TECH-SPEC.md (Bagian 3 tabel API + Bagian 4
// "Alur Export Laporan") & .agents/1-PRD.md FR-15/FR-17/FR-23.
// RBAC: middleware (T-12) menolak ANGGOTA sebelum handler (prefix
// /api/reports ADMIN-only) — handler tidak cek role ulang, cukup
// memastikan session valid (fallback defensif 401, pola T-24).
//
// FR-23: getOrCreateSnapshot — export pertama periode → hitung live +
// bekukan; re-export periode sama → render dari payload beku (angka tidak
// berubah walau ada rapel/koreksi kemudian). PDF & Excel bersumber satu
// snapshot. Jalur ini MURNI BACA: koreksi snapshot pindah ke POST
// /api/reports/regenerate (L-01), dan query param asing (termasuk sisa
// `?regenerate=true`) ditolak 400 oleh schema strict.
// =====================================================================

import { NextResponse } from "next/server";
import { getOrCreateSnapshot, reportQuerySchema, RegenerateBusyError } from "@/lib/report-snapshot";
import { generateReportPdf } from "@/lib/export/pdf";
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
    // Transaksi perhitungan snapshot timeout/bentrok (P2028/P2034) → 503:
    // server sibuk, tidak ada data yang berubah, klien boleh ulang.
    if (err instanceof RegenerateBusyError) return serviceBusy();
    console.error("export laporan PDF gagal:", err);
    return reportFailed();
  }
  const bytes = generateReportPdf(payload);

  const filename = `laporan-kas-${tahun}-${String(bulan).padStart(2, "0")}.pdf`;
  // Cast BodyInit: TS 5.7 `Uint8Array<ArrayBufferLike>` tidak assignable ke
  // BodyInit (generic baru) — runtime tetap Uint8Array valid.
  return new Response(bytes as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
