// =====================================================================
// KasSurs — T-27: GET /api/dashboard/summary (FR-12, FR-14)
// Source of truth: .agents/2-TECH-SPEC.md (Bagian 3 DashboardSummaryResponse
// + Bagian 4 alur logika) & .agents/1-PRD.md FR-12/FR-14.
// RBAC: middleware (T-12) sengaja TIDAK memblokir /api/dashboard — endpoint
// ini role-differentiated DI HANDLER (FR-14): ANGGOTA HARUS bisa akses
// ringkasan saldo umum. Handler hanya memastikan session valid (401 fallback).
//
// FASE 3 (2026-09-03): logika di-extract ke lib/dashboard.ts
// (getDashboardSummary) — dipakai RSC dashboard/status tanpa fetch client.
// Handler ini thin: auth + delegasi. Kontrak response & behavior IDENTIK.
// =====================================================================

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth";
import { getDashboardSummary } from "@/lib/dashboard";

function unauthorized(): NextResponse<{ error: string; message: string }> {
  return NextResponse.json(
    { error: "UNAUTHORIZED", message: "Belum login atau sesi kedaluwarsa" },
    { status: 401 },
  );
}

export async function GET() {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!token) return unauthorized();
  const session = await verifySession(token);
  if (!session) return unauthorized();

  return NextResponse.json(await getDashboardSummary(session));
}
