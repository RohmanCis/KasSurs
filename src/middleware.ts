// =====================================================================
// KasSurs — T-12: Middleware RBAC (FR-20)
// Validasi JWT dari cookie via `verifySession` (jose, edge-compatible)
// SEBELUM request sampai ke handler — ANGGOTA yang menyentuh endpoint
// admin ditolak 403 tanpa query DB.
//
// Keputusan route-matching (sumber: tabel API Tech Spec Bagian 3):
//   /api/auth/*        → exempt (login publik, logout)
//   /api/members*      → ADMIN (semua metode — GET juga Admin: "Fetch
//                        seluruh anggota", spec line: GET /api/members Admin)
//   /api/payments      → GET: ADMIN|ANGGOTA (hanya data sendiri, filter
//                        memberId di handler); POST/PATCH/DELETE: ADMIN
//   /api/expenses*     → ADMIN (semua metode)
//   /api/categories*   → ADMIN (semua metode)
//   /api/dashboard/*   → ADMIN|ANGGOTA (ringkasan umum)
//   /api/reports/*     → ADMIN (export PDF/Excel)
// Halaman non-API     → wajib session valid, else redirect /login
//   (halaman `/login` & aset statis dikecualikan via config.matcher)
// =====================================================================

import { NextResponse, type NextRequest } from "next/server";
import {
  verifySession,
  signSession,
  sessionCookieOptions,
  shouldRefreshSession,
  SESSION_COOKIE_NAME,
  type VerifiedSession,
} from "@/lib/auth";

const PUBLIC_API_PREFIXES = ["/api/auth"];
const ADMIN_ONLY_API_PREFIXES = ["/api/members", "/api/expenses", "/api/categories", "/api/reports"];
const PAYMENTS_PREFIX = "/api/payments";

// Sliding session (amendemen 2026-09-01, Tech Spec Bagian 4): re-issue JWT
// dengan exp baru (now + 30 hari) saat request tervalidasi dengan sisa masa
// berlaku < 15 hari. Satu titik sentralisasi di middleware — bukan per
// endpoint. Sisa ≥ 15 hari → response tidak disentuh (tanpa Set-Cookie).
async function withSessionRefresh(
  session: VerifiedSession,
  response: NextResponse,
): Promise<NextResponse> {
  if (!shouldRefreshSession(session.exp)) return response;
  const token = await signSession({ memberId: session.memberId, role: session.role });
  response.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ===== API Route Handlers =====
  if (pathname.startsWith("/api/")) {
    if (PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p))) {
      return NextResponse.next();
    }

    const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
    const session = token ? await verifySession(token) : null;
    if (!session) {
      // Tanpa cookie / token invalid / expired → 401 JSON (bukan redirect).
      return NextResponse.json(
        { error: "UNAUTHORIZED", message: "Belum login atau sesi kedaluwarsa" },
        { status: 401 },
      );
    }

    const adminOnly =
      ADMIN_ONLY_API_PREFIXES.some((p) => pathname.startsWith(p)) ||
      (pathname.startsWith(PAYMENTS_PREFIX) && request.method !== "GET");

    if (adminOnly && session.role !== "ADMIN") {
      // ANGGOTA mencoba endpoint admin → 403 JSON sebelum handler.
      return NextResponse.json(
        { error: "FORBIDDEN", message: "Akses ditolak — hanya admin" },
        { status: 403 },
      );
    }
    return withSessionRefresh(session, NextResponse.next());
  }

  // ===== Halaman (non-API) =====
  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySession(token) : null;
  if (!session) {
    const loginUrl = new URL("/login", request.url);
    return NextResponse.redirect(loginUrl);
  }
  return withSessionRefresh(session, NextResponse.next());
}

export const config = {
  // /api/:path* → semua route handler; sisa path → halaman kecuali /login + aset statis.
  matcher: ["/api/:path*", "/((?!_next/static|_next/image|favicon.ico|login).*)"],
};
