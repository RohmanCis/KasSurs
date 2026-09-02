// Integration test — GET & POST /api/members (T-16).
// Pattern sama tests/integration/login.test.ts: env .env.local dimuat manual
// sebelum import; beforeAll + dynamic import (tsconfig target es5, no
// top-level await); next/headers cookies() di-mock — handler butuh session
// cookie untuk actorId (middleware TIDAK terlibat saat handler dipanggil
// langsung; RBAC sudah terverifikasi terpisah di middleware.test);
// cleanup deleteMany di afterAll (urut: payments FK Restrict dulu).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (!m) continue;
  const value = m[2].replace(/^["']|["']$/g, ""); // strip kutip
  if (!(m[1] in process.env)) process.env[m[1]] = value;
}
process.env.JWT_SECRET = "integration-test-secret";

// Mock next/headers cookies() → store in-memory berisi session cookie admin
// (handler membaca actorId dari sini via verifySession).
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

type GetHandler = (request: Request) => Promise<Response>;
type PostHandler = (request: Request) => Promise<Response>;
let GET: GetHandler;
let POST: PostHandler;
let prisma: typeof import("@/lib/prisma")["prisma"];
let signSession: typeof import("@/lib/auth")["signSession"];
let verifyPin: typeof import("@/lib/auth")["verifyPin"];

// Suffiks file-unik: beda dari pola 12-digit file test lain (audit/login),
// hindari tabrakan noHp saat worker paralel. Salt `a` per-file: walau
// Date.now() identik antar file, slice manapun memuat salt → noHp beda.
const uniq = String(Date.now()) + "a";
const actorNoHp = `08${uniq.slice(-9)}6`;
let actorId: string;
const createdMemberIds: string[] = [];

function getMembers(query = ""): Promise<Response> {
  return GET(new Request(`http://localhost/api/members${query}`));
}

function postMember(body: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost/api/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeAll(async () => {
  // Import dinamis setelah env termuat — prisma butuh DATABASE_URL saat init.
  ({ GET, POST } = await import("@/app/api/members/route"));
  ({ prisma } = await import("@/lib/prisma"));
  ({ signSession } = await import("@/lib/auth"));
  ({ verifyPin } = await import("@/lib/auth"));

  actorId = await prisma.member
    .create({
      data: {
        nama: "Test Admin",
        noHp: actorNoHp,
        pinHash: "integration-test-hash",
        role: "ADMIN",
      },
    })
    .then((m) => m.id);

  // Session cookie valid (JWT) untuk seluruh test di file ini.
  cookieStore.set("session", {
    value: await signSession({ memberId: actorId, role: "ADMIN" }),
    options: {},
  });
});

afterAll(async () => {
  // Urut hapus: payments (FK member Restrict) → audit_logs (FK actor
  // Restrict) → members.
  await prisma.payment.deleteMany({ where: { memberId: { in: createdMemberIds } } });
  await prisma.auditLog.deleteMany({
    where: { OR: [{ actorId }, { entityId: { in: createdMemberIds } }] },
  });
  await prisma.member.deleteMany({ where: { id: { in: [...createdMemberIds, actorId] } } });
});

describe("POST /api/members", () => {
  it("sukses → 201, role ANGGOTA, PIN ter-hash, audit CREATE Member tersimpan", async () => {
    const noHp = `08${uniq}1`;
    const res = await postMember({ nama: "Budi", noHp, pin: "1234" });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({
      nama: "Budi",
      noHp,
      statusAktif: true,
      role: "ANGGOTA",
    });
    expect(typeof body.id).toBe("string");
    // Hash PIN tidak boleh bocor ke response DTO
    expect(JSON.stringify(body)).not.toContain("pinHash");
    createdMemberIds.push(body.id);

    const member = await prisma.member.findUnique({ where: { id: body.id } });
    expect(member).not.toBeNull();
    expect(member?.role).toBe("ANGGOTA");
    // PIN ter-hash: bukan plaintext, tapi tetap verifiable
    expect(member?.pinHash).not.toBe("1234");
    await expect(verifyPin("1234", member!.pinHash)).resolves.toBe(true);

    // Audit transpose-safe: actorId = admin sesi DAN entityId = member baru.
    const row = await prisma.auditLog.findFirst({
      where: { actorId, entityType: "Member", entityId: body.id },
    });
    expect(row).not.toBeNull();
    expect(row?.actorId).toBe(actorId);
    expect(row?.entityId).toBe(body.id);
    expect(row?.aksi).toBe("CREATE");
    expect(row?.dataLama).toBeNull();
    expect(row?.dataBaru).toMatchObject({
      nama: "Budi",
      noHp,
      role: "ANGGOTA",
      statusAktif: true,
    });
    // Hash PIN tidak boleh bocor ke audit log
    expect(JSON.stringify(row?.dataBaru)).not.toContain("pinHash");
  });

  it("noHp duplikat → 409 PHONE_ALREADY_REGISTERED", async () => {
    const res = await postMember({ nama: "Duplikat", noHp: `08${uniq}1`, pin: "1234" });
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      error: "PHONE_ALREADY_REGISTERED",
    });
  });

  it("mass-assignment: role/statusAktif disuntikkan body → diabaikan (strip Zod), tetap ANGGOTA & aktif", async () => {
    // Zod non-strict: unknown keys di-strip — role/statusAktif TIDAK boleh
    // terset dari body (RBAC escalation & aktivasi paksa). Buktikan, jangan
    // asumsikan: role wajib ANGGOTA (default skema) & statusAktif wajib true.
    const res = await postMember({
      nama: "Hacker",
      noHp: `08${uniq}7`,
      pin: "1234",
      role: "ADMIN",
      statusAktif: false,
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.role).toBe("ANGGOTA");
    expect(body.statusAktif).toBe(true);
    createdMemberIds.push(body.id);

    // Cross-check di DB — bukan hanya response
    const db = await prisma.member.findUnique({ where: { id: body.id } });
    expect(db?.role).toBe("ANGGOTA");
    expect(db?.statusAktif).toBe(true);
  });

  it("body invalid (pin 3 digit / nama kosong) → 400 INVALID_INPUT", async () => {
    const resPin = await postMember({ nama: "Caca", noHp: `08${uniq}2`, pin: "123" });
    expect(resPin.status).toBe(400);
    await expect(resPin.json()).resolves.toMatchObject({ error: "INVALID_INPUT" });

    const resNama = await postMember({ nama: "   ", noHp: `08${uniq}2`, pin: "1234" });
    expect(resNama.status).toBe(400);
    await expect(resNama.json()).resolves.toMatchObject({ error: "INVALID_INPUT" });
  });
});

describe("GET /api/members", () => {
  it("tanpa query → semua anggota dibuat, field DTO lengkap, tanpa statusBayarBulanIni", async () => {
    const ali = await prisma.member.create({
      data: { nama: "Ali", noHp: `08${uniq}3`, pinHash: "x" },
    });
    const nia = await prisma.member.create({
      data: { nama: "Nia", noHp: `08${uniq}4`, pinHash: "x" },
    });
    createdMemberIds.push(ali.id, nia.id);

    const res = await getMembers();
    expect(res.status).toBe(200);
    const list = await res.json();
    // Hash PIN tidak boleh bocor ke response list (stringify seluruh array)
    expect(JSON.stringify(list)).not.toContain("pinHash");

    const aliDto = list.find((m: { id: string }) => m.id === ali.id);
    expect(aliDto).toMatchObject({
      id: ali.id,
      nama: "Ali",
      noHp: `08${uniq}3`,
      statusAktif: true,
      role: "ANGGOTA",
    });
    expect(aliDto).not.toHaveProperty("statusBayarBulanIni");
    expect(list.some((m: { id: string }) => m.id === nia.id)).toBe(true);
  });

  it("dengan bulan/tahun → statusBayarBulanIni benar (LUNAS vs BELUM_BAYAR)", async () => {
    const lunas = await prisma.member.create({
      data: { nama: "Lunas", noHp: `08${uniq}5`, pinHash: "x" },
    });
    const belum = await prisma.member.create({
      data: { nama: "Belum", noHp: `08${uniq}6`, pinHash: "x" },
    });
    createdMemberIds.push(lunas.id, belum.id);
    await prisma.payment.create({
      data: {
        memberId: lunas.id,
        bulan: 8,
        tahun: 2026,
        jumlah: 30000,
        tanggalBayar: new Date("2026-08-01"),
      },
    });

    const res = await getMembers("?bulan=8&tahun=2026");
    expect(res.status).toBe(200);
    const list = await res.json();
    // Hash PIN tidak boleh bocor ke response list
    expect(JSON.stringify(list)).not.toContain("pinHash");
    const lunasDto = list.find((m: { id: string }) => m.id === lunas.id);
    const belumDto = list.find((m: { id: string }) => m.id === belum.id);
    expect(lunasDto?.statusBayarBulanIni).toBe("LUNAS");
    expect(belumDto?.statusBayarBulanIni).toBe("BELUM_BAYAR");
  });

  it("query bulan/tahun invalid → 400", async () => {
    const res1 = await getMembers("?bulan=13&tahun=2026");
    expect(res1.status).toBe(400);
    const res2 = await getMembers("?bulan=8&tahun=26");
    expect(res2.status).toBe(400);
    const res3 = await getMembers("?bulan=8"); // tanpa pasangan tahun
    expect(res3.status).toBe(400);
    const res4 = await getMembers("?bulan=abc&tahun=2026");
    expect(res4.status).toBe(400);
  });
});
