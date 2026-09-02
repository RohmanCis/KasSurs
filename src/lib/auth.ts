// =====================================================================
// KasSurs — Auth helpers (T-07 hash PIN, T-08 JWT session cookie)
// Source of truth: .agents/2-TECH-SPEC.md (Bagian 4 & 5).
// - bcryptjs (pure JS) — spec hanya menyebut "bcrypt", tidak ada
//   preskripsi lib spesifik; bcryptjs dipilih agar zero build issue
//   di Windows dev & Vercel serverless. Salt rounds 10.
// - jose — edge-compatible (dipakai middleware RBAC T-12 nanti).
// - Session: JWT httpOnly, secure, sameSite=strict cookie, expiry 30 hari.
// =====================================================================

import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { Role } from "@/lib/types";

const SALT_ROUNDS = 10;
const SESSION_ALG = "HS256";
export const SESSION_COOKIE_NAME = "session";
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 hari
// Sliding session (amendemen 2026-09-01): middleware me-re-issue token saat
// sisa masa berlaku di bawah ambang ini — bukan tiap request (churn cookie
// tanpa manfaat, token stateless tanpa revocation list).
export const SESSION_REFRESH_THRESHOLD_SECONDS = SESSION_MAX_AGE_SECONDS / 2; // 15 hari

// Payload JWT session — dipakai T-10 (login), T-12 (middleware RBAC).
export interface SessionPayload {
  memberId: string;
  role: Role;
}

// Hasil verifikasi — exp (detik epoch) ditambahkan untuk keputusan
// refresh sliding session di middleware (Tech Spec Bagian 4).
export type VerifiedSession = SessionPayload & { exp: number };

function getSecret(): Uint8Array {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET belum diset di environment");
  }
  return new TextEncoder().encode(process.env.JWT_SECRET);
}

// ===== T-07: Hash & verifikasi PIN =====

export async function hashPin(pin: string): Promise<string> {
  return bcrypt.hash(pin, SALT_ROUNDS);
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pin, hash);
}

// ===== T-08: JWT sign/verify + session cookie =====

export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ memberId: payload.memberId, role: payload.role })
    .setProtectedHeader({ alg: SESSION_ALG })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(getSecret());
}

// Return null untuk token invalid/expired/tampered/role tidak dikenal.
export async function verifySession(token: string): Promise<VerifiedSession | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: [SESSION_ALG],
    });
    const { memberId, role } = payload;
    if (typeof memberId !== "string") return null;
    if (role !== "ADMIN" && role !== "ANGGOTA") return null;
    if (typeof payload.exp !== "number") return null;
    return { memberId, role, exp: payload.exp };
  } catch {
    return null;
  }
}

// Sliding session: apakah token perlu di-re-issue (sisa < ambang refresh)?
export function shouldRefreshSession(exp: number, nowMs: number = Date.now()): boolean {
  return exp * 1000 - nowMs < SESSION_REFRESH_THRESHOLD_SECONDS * 1000;
}

// Opsi cookie dipakai bersama route handler login (T-10) & middleware
// refresh (T-12) — satu sumber, tidak boleh beda atribut keamanan.
export function sessionCookieOptions() {
  return {
    httpOnly: true,
    // secure hanya di production — di dev (localhost HTTP) browser menolak
    // cookie secure, login UI dev tidak jalan (N3). HTTPS otomatis di Vercel.
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict" as const,
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  };
}

// Helper cookie — hanya dipakai di route handler (login T-10, logout T-11).
// Wajib di-await di handler: cookie baru valid dalam scope request.
// (Middleware T-12 TIDAK memakai ini — next/headers tak tersedia di edge;
// middleware set cookie via NextResponse.cookies.set + sessionCookieOptions.)
export async function setSessionCookie(payload: SessionPayload): Promise<void> {
  const token = await signSession(payload);
  cookies().set(SESSION_COOKIE_NAME, token, sessionCookieOptions());
}

export function clearSessionCookie(): void {
  cookies().delete(SESSION_COOKIE_NAME);
}
