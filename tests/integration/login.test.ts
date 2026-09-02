// Integration test — POST /api/auth/login (T-10).
// Pakai DB dev (DATABASE_URL dari .env.local). Setup: member test + cookie
// store mock (next/headers cookies() butuh request context — di-mock agar
// handler bisa dijalankan langsung tanpa server Next).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

// Muat .env.local manual (tanpa dep dotenv). Prisma/auth/route di-import
// DINAMIS di dalam beforeAll (bukan top-level await — tsconfig target es5,
// dan agar prisma dibuat setelah env termuat).
for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (!m) continue;
  const value = m[2].replace(/^["']|["']$/g, ""); // strip kutip
  if (!(m[1] in process.env)) process.env[m[1]] = value;
}
process.env.JWT_SECRET = "integration-test-secret";

// Mock next/headers cookies() → store in-memory, cek cookie hasil login.
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

// Salt `g` per-file: Date.now() identik antar file tidak masalah — noHp
// selalu memuat salt → beda dari file test lain.
const noHp = `08${String(Date.now()).slice(-10)}g`;
const noHpInactive = `${noHp}9`;
let memberId: string;
let inactiveId: string;

function postLogin(body: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeAll(async () => {
  // Import dinamis setelah env termuat — prisma butuh DATABASE_URL saat init.
  ({ POST } = await import("@/app/api/auth/login/route"));
  ({ prisma } = await import("@/lib/prisma"));
  ({ hashPin } = await import("@/lib/auth"));

  memberId = await prisma.member
    .create({
      data: { nama: "Test Anggota", noHp, pinHash: await hashPin("1234"), role: "ANGGOTA" },
    })
    .then((m) => m.id);
  inactiveId = await prisma.member
    .create({
      data: {
        nama: "Nonaktif",
        noHp: noHpInactive,
        pinHash: await hashPin("1234"),
        statusAktif: false,
      },
    })
    .then((m) => m.id);
});

afterAll(async () => {
  await prisma.loginAttempt.deleteMany({
    where: { memberId: { in: [memberId, inactiveId] } },
  });
  await prisma.member.deleteMany({ where: { id: { in: [memberId, inactiveId] } } });
});

describe("POST /api/auth/login", () => {
  it("sukses → 200 dengan role/memberId/nama + session cookie ter-set", async () => {
    cookieStore.clear();
    const res = await postLogin({ noHp, pin: "1234" });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      role: "ANGGOTA",
      memberId,
      nama: "Test Anggota",
    });
    const cookie = cookieStore.get("session");
    expect(cookie).toBeDefined();
    expect(cookie?.value.split(".")).toHaveLength(3); // JWT
    expect(cookie?.options).toMatchObject({
      httpOnly: true,
      // N3: secure hanya di production (NODE_ENV=test di vitest → false)
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });
  });

  it("PIN salah → 401 INVALID_CREDENTIALS + LoginAttempt(berhasil=false) tercatat", async () => {
    const before = await prisma.loginAttempt.count({ where: { memberId, berhasil: false } });
    const res = await postLogin({ noHp, pin: "9999" });
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ error: "INVALID_CREDENTIALS" });
    const after = await prisma.loginAttempt.count({ where: { memberId, berhasil: false } });
    expect(after).toBe(before + 1);
  });

  it("member tidak dikenal → 401 INVALID_CREDENTIALS (identik dgn PIN salah)", async () => {
    const res = await postLogin({ noHp: "080000000000", pin: "1234" });
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toMatchObject({ error: "INVALID_CREDENTIALS" });
    expect(body.message).toBe("No HP atau PIN salah");
  });

  it("member nonaktif → 401 INVALID_CREDENTIALS", async () => {
    const res = await postLogin({ noHp: noHpInactive, pin: "1234" });
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ error: "INVALID_CREDENTIALS" });
  });

  it("5x gagal dalam window 15 menit → 429 ACCOUNT_LOCKED + lockedUntil", async () => {
    // Manipulasi langsung: hapus riwayat lalu insert 5 kegagalan (waktu
    // sekarang, terbaru dari attempt lain) — hindari tunggu window & streak
    // tak sengaja di-reset oleh attempt sukses test sebelumnya.
    await prisma.loginAttempt.deleteMany({ where: { memberId } });
    await prisma.loginAttempt.createMany({
      data: Array.from({ length: 5 }, () => ({
        memberId,
        berhasil: false,
        waktu: new Date(),
      })),
    });
    const res = await postLogin({ noHp, pin: "1234" });
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe("ACCOUNT_LOCKED");
    expect(typeof body.lockedUntil).toBe("string");
    expect(Number.isNaN(Date.parse(body.lockedUntil))).toBe(false);
  });

  it("body invalid (noHp kosong) → 400", async () => {
    const res = await postLogin({ noHp: "", pin: "1234" });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "INVALID_INPUT" });
  });
});
