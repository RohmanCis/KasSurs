// Unit test — sliding session (amendemen 2026-09-01, T-08/T-12):
// 1. shouldRefreshSession: ambang refresh sisa < 15 hari.
// 2. Middleware me-re-issue JWT (exp baru +30 hari) hanya saat sisa < 15 hari
//    — response membawa Set-Cookie session baru; sisa panjang → tanpa cookie.
// 3. 401/403/redirect tidak me-refresh (sesi gagal/ditolak tidak diperpanjang).
// Murni — tanpa DB, middleware dipanggil langsung dengan NextRequest mock.
import { beforeAll, describe, expect, it } from "vitest";
import { SignJWT } from "jose";
import { NextRequest } from "next/server";

const APP_SECRET = "unit-test-secret";
const DAY = 24 * 60 * 60; // detik

beforeAll(() => {
  process.env.JWT_SECRET = APP_SECRET;
});

// Token HS256 valid dengan exp arbitrer (signSession app selalu 30 hari —
// untuk kasus "sisa pendek" perlu token buatan sendiri).
async function makeToken(expInSeconds: number, role = "ADMIN"): Promise<string> {
  const secret = new TextEncoder().encode(APP_SECRET);
  return new SignJWT({ memberId: "member-1", role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${expInSeconds}s`)
    .sign(secret);
}

// Ekstraksi token dari Set-Cookie response middleware.
function sessionTokenFrom(res: { cookies: { get(name: string): { value: string } | undefined } }):
  | string
  | undefined {
  return res.cookies.get("session")?.value;
}

describe("sliding session — shouldRefreshSession (ambang 15 hari)", () => {
  it("sisa 10 hari → refresh", async () => {
    const { shouldRefreshSession } = await import("@/lib/auth");
    expect(shouldRefreshSession(Math.floor(Date.now() / 1000) + 10 * DAY)).toBe(true);
  });

  it("sisa 16 hari → TIDAK refresh", async () => {
    const { shouldRefreshSession } = await import("@/lib/auth");
    expect(shouldRefreshSession(Math.floor(Date.now() / 1000) + 16 * DAY)).toBe(false);
  });

  it("boundary: sisa tepat 15 hari → TIDAK refresh (strict <)", async () => {
    const { shouldRefreshSession, SESSION_REFRESH_THRESHOLD_SECONDS } = await import("@/lib/auth");
    expect(SESSION_REFRESH_THRESHOLD_SECONDS).toBe(15 * DAY);
    // nowMs dikunci eksplisit — hindari race ms antar-panggilan Date.now()
    // (exp = ceil detik → sisa persis threshold saat nowMs yang sama).
    const nowMs = Date.now();
    const exp = Math.ceil(nowMs / 1000) + 15 * DAY;
    expect(shouldRefreshSession(exp, nowMs)).toBe(false);
  });
});

describe("sliding session — middleware re-issue", () => {
  it("API path, token sisa 10 hari → Set-Cookie session baru, exp ≈ now+30 hari, payload sama", async () => {
    const { middleware } = await import("@/middleware");
    const { verifySession } = await import("@/lib/auth");
    const res = await middleware(
      new NextRequest("http://localhost/api/payments", {
        headers: { cookie: `session=${await makeToken(10 * DAY)}` },
      }),
    );
    const newToken = sessionTokenFrom(res);
    expect(newToken).toBeTruthy();
    const session = await verifySession(newToken!);
    expect(session).toMatchObject({ memberId: "member-1", role: "ADMIN" });
    // exp baru ≈ 30 hari ke depan (toleransi jam-muka test).
    expect(session!.exp).toBeGreaterThan(Math.floor(Date.now() / 1000) + 29 * DAY);
  });

  it("API path, token sisa 25 hari → TANPA Set-Cookie (di bawah ambang tidak refresh)", async () => {
    const { middleware } = await import("@/middleware");
    const res = await middleware(
      new NextRequest("http://localhost/api/payments", {
        headers: { cookie: `session=${await makeToken(25 * DAY)}` },
      }),
    );
    expect(sessionTokenFrom(res)).toBeUndefined();
  });

  it("Halaman (non-API), token sisa 10 hari → Set-Cookie juga (halaman ikut sliding)", async () => {
    const { middleware } = await import("@/middleware");
    const res = await middleware(
      new NextRequest("http://localhost/dashboard", {
        headers: { cookie: `session=${await makeToken(10 * DAY)}` },
      }),
    );
    expect(sessionTokenFrom(res)).toBeTruthy();
  });

  it("API path tanpa cookie → 401, tanpa Set-Cookie", async () => {
    const { middleware } = await import("@/middleware");
    const res = await middleware(new NextRequest("http://localhost/api/payments"));
    expect(res.status).toBe(401);
    expect(sessionTokenFrom(res)).toBeUndefined();
  });

  it("ANGGOTA kena 403 di endpoint admin → TIDAK di-refresh (sesi ditolak tidak diperpanjang)", async () => {
    const { middleware } = await import("@/middleware");
    const res = await middleware(
      new NextRequest("http://localhost/api/members", {
        headers: { cookie: `session=${await makeToken(10 * DAY, "ANGGOTA")}` },
      }),
    );
    expect(res.status).toBe(403);
    expect(sessionTokenFrom(res)).toBeUndefined();
  });

  it("Halaman tanpa cookie → redirect /login", async () => {
    const { middleware } = await import("@/middleware");
    const res = await middleware(new NextRequest("http://localhost/dashboard"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toContain("/login");
  });
});
