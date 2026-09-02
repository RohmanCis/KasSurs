// =====================================================================
// KasSurs — API Handler Kit #1: session prolog satu helper
// Pola "baca cookie → verifySession → 401" dipakai ~17 handler. Call site:
//
//   const s = await getSessionOr401();
//   if (s instanceof NextResponse) return s; // 401 sudah dikirim
//   // narrowing → s: VerifiedSession (memberId, role, exp)
//
// Jangan pakai cek `!s` lain — helper sudah menolak token kosong/invalid.
// =====================================================================

import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySession } from "@/lib/auth";
import type { VerifiedSession } from "@/lib/auth";
import { unauthorized } from "./respond";

export async function getSessionOr401(): Promise<VerifiedSession | NextResponse> {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!token) return unauthorized();
  const session = await verifySession(token);
  if (!session) return unauthorized();
  return session;
}
