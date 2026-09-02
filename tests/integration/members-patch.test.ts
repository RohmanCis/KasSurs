// Integration test — PATCH /api/members/[id] (T-17).
// Pattern sama tests/integration/members.test.ts: env .env.local dimuat
// manual sebelum import; beforeAll + dynamic import (tsconfig target es5,
// no top-level await); next/headers cookies() di-mock — handler butuh
// session cookie untuk actorId (middleware TIDAK terlibat saat handler
// dipanggil langsung; RBAC sudah terverifikasi terpisah di middleware.test);
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

type PatchHandler = (request: Request, context: { params: { id: string } }) => Promise<Response>;
let PATCH: PatchHandler;
let prisma: typeof import("@/lib/prisma")["prisma"];
let signSession: typeof import("@/lib/auth")["signSession"];
let verifyPin: typeof import("@/lib/auth")["verifyPin"];
let hashPin: typeof import("@/lib/auth")["hashPin"];

// Suffiks file-unik — HINDARI tabrakan noHp antar file paralel yang berbagi
// DB dev dengan Date.now() sama (perubahan baris members.test.ts/deactivate):
// digit member 7/8/9/70/71 & actor ...7 — disjoint dari members.test.ts
// (1-6 / ...6) dan members-deactivate.test.ts (1-5 / ...5). Salt `d`
// per-file: Date.now() identik antar file tidak masalah — slice manapun
// memuat salt → noHp beda.
const uniq = String(Date.now()) + "d";
const actorNoHp = `08${uniq.slice(-9)}7`;
let actorId: string;
const createdMemberIds: string[] = [];

function patchMember(id: string, body: unknown): Promise<Response> {
  return PATCH(
    new Request(`http://localhost/api/members/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: { id } },
  );
}

async function lastUpdateAudit(entityId: string) {
  return prisma.auditLog.findFirst({
    where: { actorId, entityType: "Member", entityId, aksi: "UPDATE" },
    orderBy: { timestamp: "desc" },
  });
}

beforeAll(async () => {
  // Import dinamis setelah env termuat — prisma butuh DATABASE_URL saat init.
  ({ PATCH } = await import("@/app/api/members/[id]/route"));
  ({ prisma } = await import("@/lib/prisma"));
  ({ signSession, verifyPin, hashPin } = await import("@/lib/auth"));

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

describe("PATCH /api/members/[id]", () => {
  it("sukses update nama → 200, DB ter-update, audit UPDATE Member benar & tanpa pinHash", async () => {
    const m = await prisma.member.create({
      data: { nama: "Budi Lama", noHp: `08${uniq}7`, pinHash: "x" },
    });
    createdMemberIds.push(m.id);

    const res = await patchMember(m.id, { nama: "Budi Baru" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      id: m.id,
      nama: "Budi Baru",
      noHp: `08${uniq}7`,
      statusAktif: true,
      role: "ANGGOTA",
    });
    // Hash PIN tidak boleh bocor ke response DTO
    expect(JSON.stringify(body)).not.toContain("pinHash");

    const db = await prisma.member.findUnique({ where: { id: m.id } });
    expect(db?.nama).toBe("Budi Baru");

    const row = await lastUpdateAudit(m.id);
    expect(row).not.toBeNull();
    expect(row?.actorId).toBe(actorId);
    expect(row?.entityId).toBe(m.id);
    expect(row?.aksi).toBe("UPDATE");
    expect((row?.dataLama as { nama: string }).nama).toBe("Budi Lama");
    expect((row?.dataBaru as { nama: string }).nama).toBe("Budi Baru");
    // Hash PIN tidak boleh bocor ke audit log (baik dataLama maupun dataBaru)
    expect(JSON.stringify({ dataLama: row?.dataLama, dataBaru: row?.dataBaru })).not.toContain(
      "pinHash",
    );
  });

  it("noHp sudah dipakai member lain → 409 PHONE_ALREADY_REGISTERED", async () => {
    const a = await prisma.member.create({
      data: { nama: "A", noHp: `08${uniq}8`, pinHash: "x" },
    });
    const b = await prisma.member.create({
      data: { nama: "B", noHp: `08${uniq}9`, pinHash: "x" },
    });
    createdMemberIds.push(a.id, b.id);

    const res = await patchMember(a.id, { noHp: `08${uniq}9` });
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({ error: "PHONE_ALREADY_REGISTERED" });
    // Tidak ada perubahan data
    const db = await prisma.member.findUnique({ where: { id: a.id } });
    expect(db?.noHp).toBe(`08${uniq}8`);
  });

  it("reset pin → 200, pin lama gagal verifyPin, pin baru berhasil, audit tandai [reset]", async () => {
    const m = await prisma.member.create({
      data: { nama: "Pin Test", noHp: `08${uniq}70`, pinHash: await hashPin("1111") },
    });
    createdMemberIds.push(m.id);

    const res = await patchMember(m.id, { pin: "2222" });
    expect(res.status).toBe(200);
    const body = await res.json();
    // Hash PIN tidak boleh bocor ke response DTO
    expect(JSON.stringify(body)).not.toContain("pinHash");

    const db = await prisma.member.findUnique({ where: { id: m.id } });
    expect(db?.pinHash).not.toBe("2222");
    await expect(verifyPin("1111", db!.pinHash)).resolves.toBe(false);
    await expect(verifyPin("2222", db!.pinHash)).resolves.toBe(true);

    const row = await lastUpdateAudit(m.id);
    expect(row).not.toBeNull();
    expect(row?.dataBaru).toMatchObject({ pin: "[reset]" });
    // Hash asli tidak boleh bocor ke audit log
    expect(JSON.stringify(row?.dataBaru)).not.toContain("pinHash");
    expect(JSON.stringify(row?.dataBaru)).not.toContain("2222");
  });

  it("mass-assignment: role disuntikkan body → diabaikan (strip Zod), role target tetap ANGGOTA", async () => {
    const m = await prisma.member.create({
      data: { nama: "Target Mass-Assignment", noHp: `08${uniq}71`, pinHash: "x" },
    });
    createdMemberIds.push(m.id);

    const res = await patchMember(m.id, { nama: "Nama Baru", role: "ADMIN" });
    expect(res.status).toBe(200);
    const body = await res.json();
    // role tidak boleh berubah lewat body (RBAC escalation) — hanya nama
    expect(body.role).toBe("ANGGOTA");
    expect(body.nama).toBe("Nama Baru");

    const db = await prisma.member.findUnique({ where: { id: m.id } });
    expect(db?.role).toBe("ANGGOTA");
  });

  it("body kosong → 400 INVALID_INPUT", async () => {
    const res = await patchMember(actorId, {});
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "INVALID_INPUT" });

    // Hanya key tak dikenal → setelah strip Zod isi kosong → 400 juga
    const resUnknown = await patchMember(actorId, { foo: "bar" });
    expect(resUnknown.status).toBe(400);
    await expect(resUnknown.json()).resolves.toMatchObject({ error: "INVALID_INPUT" });
  });

  it("body invalid (pin 3 digit) → 400 INVALID_INPUT", async () => {
    const res = await patchMember(actorId, { pin: "123" });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "INVALID_INPUT" });
  });

  it("id tidak ada → 404 MEMBER_NOT_FOUND", async () => {
    const res = await patchMember("non-existent-id", { nama: "X" });
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ error: "MEMBER_NOT_FOUND" });
  });
});
