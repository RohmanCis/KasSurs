// Integration test — PATCH /api/members/[id]/deactivate (T-18).
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

// Suffiks file-unik — HINDARI pola members.test.ts (`08${uniq.slice(-9)}6`):
// dua file paralel dengan Date.now() sama → noHp actor identik → unique
// constraint pecah. Digit akhir 5 + bentuk berbeda memutus tabrakan. Salt
// `e` per-file: Date.now() identik antar file tidak masalah — slice manapun
// memuat salt → noHp beda.
const uniq = String(Date.now()) + "e";
const actorNoHp = `08${uniq.slice(-9)}5`;
let actorId: string;
const createdMemberIds: string[] = [];

function deactivate(id: string): Promise<Response> {
  return PATCH(new Request(`http://localhost/api/members/${id}/deactivate`, { method: "PATCH" }), {
    params: { id },
  });
}

beforeAll(async () => {
  // Import dinamis setelah env termuat — prisma butuh DATABASE_URL saat init.
  ({ PATCH } = await import("@/app/api/members/[id]/deactivate/route"));
  ({ prisma } = await import("@/lib/prisma"));
  ({ signSession } = await import("@/lib/auth"));

  actorId = await prisma.member
    .create({
      data: {
        nama: "Test Admin Deactivate",
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

describe("PATCH /api/members/[id]/deactivate", () => {
  it("nonaktifkan ANGGOTA biasa → 200 statusAktif=false, payments historis tetap ada, audit UPDATE tersimpan", async () => {
    const member = await prisma.member.create({
      data: { nama: "Anggota Biasa", noHp: `08${uniq}1`, pinHash: "x" },
    });
    createdMemberIds.push(member.id);
    // Payment historis — harus tetap ada setelah soft delete (soft delete
    // tidak menyentuh tabel payments; FK Restrict bahkan mencegah hard delete).
    await prisma.payment.create({
      data: {
        memberId: member.id,
        bulan: 7,
        tahun: 2026,
        jumlah: 30000,
        tanggalBayar: new Date("2026-07-01"),
      },
    });

    const res = await deactivate(member.id);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      id: member.id,
      statusAktif: false,
      role: "ANGGOTA",
    });
    // Hash PIN tidak boleh bocor ke response DTO
    expect(JSON.stringify(body)).not.toContain("pinHash");

    const db = await prisma.member.findUnique({ where: { id: member.id } });
    expect(db?.statusAktif).toBe(false);

    // Data historis (payment) tidak ikut terhapus
    const pay = await prisma.payment.findFirst({ where: { memberId: member.id } });
    expect(pay).not.toBeNull();
    expect(pay?.jumlah).toBe(30000);

    // Audit UPDATE dengan dataLama=true → dataBaru=false, tanpa pinHash
    const row = await prisma.auditLog.findFirst({
      where: { actorId, entityType: "Member", entityId: member.id },
    });
    expect(row).not.toBeNull();
    expect(row?.aksi).toBe("UPDATE");
    expect(row?.dataLama).toMatchObject({ statusAktif: true });
    expect(row?.dataBaru).toMatchObject({ statusAktif: false });
    expect(JSON.stringify(row?.dataBaru)).not.toContain("pinHash");
  });

  it("nonaktifkan admin saat masih ada admin aktif lain → 200, audit UPDATE", async () => {
    const admin = await prisma.member.create({
      data: { nama: "Admin Kedua", noHp: `08${uniq}2`, pinHash: "x", role: "ADMIN" },
    });
    createdMemberIds.push(admin.id);

    // actorId file ini masih ADMIN aktif → count admin aktif ≥ 2 → sukses.
    const res = await deactivate(admin.id);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      id: admin.id,
      statusAktif: false,
      role: "ADMIN",
    });
    // Hash PIN tidak boleh bocor ke response DTO
    expect(JSON.stringify(body)).not.toContain("pinHash");

    const row = await prisma.auditLog.findFirst({
      where: { actorId, entityType: "Member", entityId: admin.id },
    });
    expect(row?.aksi).toBe("UPDATE");
    expect(row?.dataBaru).toMatchObject({ statusAktif: false });
  });

  it("nonaktifkan SATU-SATUNYA admin aktif → 403 LAST_ADMIN, member tidak berubah, tanpa audit", async () => {
    // Isolasi dari file test paralel: count admin aktif bersifat GLOBAL di
    // DB dev (file lain — mis. members.test.ts — punya actor admin sendiri).
    // Nonaktifkan sementara SEMUA admin aktif, buat satu admin baru → count
    // admin aktif = 1. Pulihkan status admin lain di finally (selalu jalan,
    // termasuk saat assertion gagal).
    const adminsAktif = await prisma.member.findMany({
      where: { role: "ADMIN", statusAktif: true },
    });
    const restoreIds = adminsAktif.map((a) => a.id);

    try {
      await prisma.member.updateMany({
        where: { role: "ADMIN", statusAktif: true },
        data: { statusAktif: false },
      });

      const soleAdmin = await prisma.member.create({
        data: { nama: "Admin Tunggal", noHp: `08${uniq}3`, pinHash: "x", role: "ADMIN" },
      });
      createdMemberIds.push(soleAdmin.id);

      const res = await deactivate(soleAdmin.id);
      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toMatchObject({ error: "LAST_ADMIN" });

      // Ditolak → status tidak berubah & TIDAK ada audit row
      const db = await prisma.member.findUnique({ where: { id: soleAdmin.id } });
      expect(db?.statusAktif).toBe(true);
      const audit = await prisma.auditLog.findFirst({
        where: { entityType: "Member", entityId: soleAdmin.id },
      });
      expect(audit).toBeNull();
    } finally {
      // Pulihkan admin lain (termasuk actor file ini) — jangan merusak
      // asumsi test lain maupun file paralel yang berbagi DB yang sama.
      await prisma.member.updateMany({
        where: { id: { in: restoreIds } },
        data: { statusAktif: true },
      });
    }
  });

  it("SELF-deactivate admin satu-satunya (target === actor) → 403 LAST_ADMIN, tetap aktif", async () => {
    // Isolasi global-admin sama dengan test sole-admin di atas; perbedaan:
    // session cookie dialihkan ke admin yang bersangkutan sehingga actor ===
    // target. Lockout harus tetap jalan — FR-04 tidak peduli siapa actornya.
    // Cookie dipulihkan di finally (test berikutnya butuh sesi actorId).
    const adminsAktif = await prisma.member.findMany({
      where: { role: "ADMIN", statusAktif: true },
    });
    const restoreIds = adminsAktif.map((a) => a.id);

    try {
      await prisma.member.updateMany({
        where: { role: "ADMIN", statusAktif: true },
        data: { statusAktif: false },
      });

      const soleAdmin = await prisma.member.create({
        data: { nama: "Admin Sendiri", noHp: `08${uniq}5`, pinHash: "x", role: "ADMIN" },
      });
      createdMemberIds.push(soleAdmin.id);

      // actor === target: sesi milik admin yang sama yang mau dinonaktifkan.
      cookieStore.set("session", {
        value: await signSession({ memberId: soleAdmin.id, role: "ADMIN" }),
        options: {},
      });

      const res = await deactivate(soleAdmin.id);
      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toMatchObject({ error: "LAST_ADMIN" });

      // Ditolak → status tidak berubah & TIDAK ada audit row
      const db = await prisma.member.findUnique({ where: { id: soleAdmin.id } });
      expect(db?.statusAktif).toBe(true);
      const audit = await prisma.auditLog.findFirst({
        where: { entityType: "Member", entityId: soleAdmin.id },
      });
      expect(audit).toBeNull();
    } finally {
      // Pulihkan status admin lain + session cookie file ini (actorId).
      await prisma.member.updateMany({
        where: { id: { in: restoreIds } },
        data: { statusAktif: true },
      });
      cookieStore.set("session", {
        value: await signSession({ memberId: actorId, role: "ADMIN" }),
        options: {},
      });
    }
  });

  it("member yang sudah nonaktif → 200 idempotent, TIDAK ada audit row baru", async () => {
    const inactive = await prisma.member.create({
      data: { nama: "Sudah Nonaktif", noHp: `08${uniq}4`, pinHash: "x", statusAktif: false },
    });
    createdMemberIds.push(inactive.id);

    const countBefore = await prisma.auditLog.count({
      where: { entityType: "Member", entityId: inactive.id },
    });

    const res = await deactivate(inactive.id);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      id: inactive.id,
      statusAktif: false,
    });
    // Hash PIN tidak boleh bocor ke response DTO
    expect(JSON.stringify(body)).not.toContain("pinHash");

    const countAfter = await prisma.auditLog.count({
      where: { entityType: "Member", entityId: inactive.id },
    });
    expect(countAfter).toBe(countBefore);
  });

  it("id tidak ada → 404 MEMBER_NOT_FOUND", async () => {
    const res = await deactivate("cuid_tidak_ada_0000000000");
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ error: "MEMBER_NOT_FOUND" });
  });
});
