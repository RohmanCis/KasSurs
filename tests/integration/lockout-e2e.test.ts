// Integration test — N6/N7: lockout e2e via POST nyata ke /api/auth/login.
// Beda dari login.test.ts (yang memanipulasi riwayat langsung): di sini
// SEMUA 5 kegagalan dibuat lewat endpoint nyata (attempt 1–5 → 401), lalu
// attempt 6–7 (PIN BENAR pun) → 429 ACCOUNT_LOCKED — bukti empiris lockout
// aktif dan dicek SEBELUM verifikasi PIN.
//
// Semantik implementasi (src/lib/rate-limit.ts — dibaca, bukan ditebak):
//   - streak = kegagalan berturut-turut (sukses terakhir mereset), window 15
//     menit via tabel LoginAttempt.
//   - locked saat ≥5 gagal dalam window; lockedUntil = waktu gagal tertua
//     dari 5 terakhir + 15 menit.
//   - Attempt yang ditolak lockout TIDAK mencatat LoginAttempt baru.
//     → attempt 6 & 7 sama-sama locked, lockedUntil identik (dihitung ulang
//     dari baris yang sama), dan total baris gagal di DB tetap 5.
//
// DB dev bersama (keputusan sadar user) — salt "l" per-file, member unik.
// Gotcha #6: deleteMany riwayat member dulu sebelum scenario (insert
// historis langsung bisa salah urutan kronologis).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

// Pooler Supabase ~500ms/query + bcrypt ~100ms per attempt; 7 POST → naikkan.
vi.setConfig({ testTimeout: 90000, hookTimeout: 20000 });

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (!m) continue;
  const value = m[2].replace(/^["']|["']$/g, ""); // strip kutip
  if (!(m[1] in process.env)) process.env[m[1]] = value;
}
process.env.JWT_SECRET = "integration-test-secret";

// Mock next/headers cookies() — route set cookie hanya saat login sukses
// (tidak terjadi di file ini), tapi import tetap butuh mock (pola existing).
const cookieStore = vi.hoisted(() => new Map<string, { value: string; options: unknown }>());
vi.mock("next/headers", () => ({
  cookies: () => ({
    set: (name: string, value: string, options: unknown) => {
      cookieStore.set(name, { value, options });
    },
    delete: (name: string) => {
      cookieStore.delete(name);
    },
    get: (name: string) => cookieStore.get(name) ?? undefined,
  }),
}));

type PostHandler = (request: Request) => Promise<Response>;
let POST: PostHandler;
let prisma: typeof import("@/lib/prisma")["prisma"];
let hashPin: typeof import("@/lib/auth")["hashPin"];

// Salt "l" per-file (skema a–k, lanjutan). PIN BENAR = "1234".
const uniq = String(Date.now()) + "l";
const noHp = `08${uniq.slice(-9)}71`;
const PIN_BENAR = "1234";
let memberId: string;

function postLogin(pin: string): Promise<Response> {
  return POST(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ noHp, pin }),
    }),
  );
}

async function bodyOf(res: Response): Promise<{ error?: string; lockedUntil?: string; message?: string }> {
  return res.json() as Promise<{ error?: string; lockedUntil?: string; message?: string }>;
}

const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;
const TOLERANSI_MS = 2 * 60 * 1000; // pooler latency & drift — window tidak boleh lebih dari ini

beforeAll(async () => {
  ({ POST } = await import("@/app/api/auth/login/route"));
  ({ prisma } = await import("@/lib/prisma"));
  ({ hashPin } = await import("@/lib/auth"));

  const member = await prisma.member.create({
    data: { nama: "Lockout E2E", noHp, pinHash: await hashPin(PIN_BENAR), role: "ANGGOTA" },
  });
  memberId = member.id;
  // Gotcha #6: riwayat member dibersihkan dulu — pastikan streak dari nol
  // (member baru biasanya bersih, tapi defensif + tidak bergantung asumsi).
  await prisma.loginAttempt.deleteMany({ where: { memberId } });
});

afterAll(async () => {
  await prisma.loginAttempt.deleteMany({ where: { memberId } });
  await prisma.member.deleteMany({ where: { id: memberId } });
});

describe("N6/N7 — lockout e2e via POST nyata", () => {
  it("N6: attempt 1–5 PIN salah → masing-masing 401 INVALID_CREDENTIALS (bukan locked)", async () => {
    for (let i = 1; i <= 5; i++) {
      const res = await postLogin("9999");
      expect(res.status, `attempt ${i}`).toBe(401);
      const body = await bodyOf(res);
      expect(body.error, `attempt ${i}`).toBe("INVALID_CREDENTIALS");
    }
  });

  it("N6: attempt ke-6 — PIN BENAR pun → 429 ACCOUNT_LOCKED (lockout dicek sebelum verifikasi PIN)", async () => {
    const res = await postLogin(PIN_BENAR);
    expect(res.status).toBe(429);
    const body = await bodyOf(res);
    expect(body.error).toBe("ACCOUNT_LOCKED");
    expect(body.lockedUntil).toBeTypeOf("string");

    // Cookie session TIDAK boleh ter-set — meski PIN benar, tetap ditolak.
    expect(cookieStore.get("session")).toBeUndefined();
  });

  it("N7: lockedUntil mencerminkan window 15 menit dari attempt 1 (gagal tertua 5 terakhir)", async () => {
    const res = await postLogin(PIN_BENAR);
    expect(res.status).toBe(429);
    const body = await bodyOf(res);

    const lockedUntil = new Date(body.lockedUntil!);
    const now = Date.now();
    expect(Number.isNaN(lockedUntil.getTime())).toBe(false);

    // Lockout masih aktif → lockedUntil di MASA DEPAN.
    expect(lockedUntil.getTime()).toBeGreaterThan(now);
    // lockedUntil = attempt 1 + 15 menit (≈ now + 15 menit − durasi 5 attempt
    // pertama) — tidak boleh lebih dari now + 15 menit + toleransi.
    expect(lockedUntil.getTime()).toBeLessThanOrEqual(now + LOCKOUT_WINDOW_MS + TOLERANSI_MS);
  });

  it("N7: attempt ke-7 — tetap ACCOUNT_LOCKED, lockedUntil konsisten (dihitung ulang dari baris yang sama)", async () => {
    const first = await bodyOf(await postLogin(PIN_BENAR));
    expect(first.error).toBe("ACCOUNT_LOCKED");
    const firstUntil = new Date(first.lockedUntil!).getTime();

    const second = await bodyOf(await postLogin(PIN_BENAR));
    expect(second.error).toBe("ACCOUNT_LOCKED");
    const secondUntil = new Date(second.lockedUntil!).getTime();

    // Attempt locked tidak mencatat LoginAttempt baru → kedua respons membaca
    // baris kegagalan yang SAMA → lockedUntil identik (toleransi ms drift).
    expect(Math.abs(secondUntil - firstUntil)).toBeLessThanOrEqual(1000);
  });

  it("bonus: DB — tepat 5 baris LoginAttempt(berhasil=false), 0 berhasil=true (penghitungan via tabel, bukan in-memory)", async () => {
    const gagal = await prisma.loginAttempt.count({ where: { memberId, berhasil: false } });
    const sukses = await prisma.loginAttempt.count({ where: { memberId, berhasil: true } });
    expect(gagal).toBe(5); // attempt 1–5 saja; 6 & 7 ditolak sebelum record
    expect(sukses).toBe(0); // PIN benar pun tidak pernah lolos saat locked
  });
});
