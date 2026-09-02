// Integration test — PATCH & DELETE /api/payments/[id] (T-21) — endpoint
// KRITIS uang: audit trail wajib (FR-21), tiap PATCH/DELETE menghasilkan
// SATU entry AuditLog dengan dataLama terisi benar (acceptance criteria).
// Pattern sama tests/integration/payments.test.ts: env .env.local dimuat
// manual; beforeAll + dynamic import (tsconfig target es5, no top-level
// await); next/headers cookies() di-mock — handler butuh session cookie
// untuk actorId (middleware TIDAK terlibat saat handler dipanggil langsung;
// RBAC method-level PATCH/DELETE admin-only sudah terverifikasi terpisah di
// middleware.test — handler sengaja TIDAK punya cek role sendiri).
// Cleanup deleteMany afterAll urut FK: payments → audit_logs → members.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (!m) continue;
  const value = m[2].replace(/^["']|["']$/g, ""); // strip kutip
  if (!(m[1] in process.env)) process.env[m[1]] = value;
}
process.env.JWT_SECRET = "integration-test-secret";

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
type DeleteHandler = (request: Request, context: { params: { id: string } }) => Promise<Response>;
let PATCH: PatchHandler;
let DELETE: DeleteHandler;
let prisma: typeof import("@/lib/prisma")["prisma"];
let signSession: typeof import("@/lib/auth")["signSession"];

// Suffiks file-unik — HINDARI tabrakan noHp antar file paralel (berbagi DB
// dev yang sama). Pemetaan shape+digit yang sudah dipakai: slice(-9)+{5,6,7,8}
// (deactivate/members/patch/payments) & full-uniq+{1..9}. File ini pakai
// slice(-9)+9 (actor) & slice(-8)+9 (member) — keduanya shape unik. Salt
// `c` per-file: Date.now() identik antar file tidak masalah — slice manapun
// memuat salt → noHp beda.
const uniq = String(Date.now()) + "c";
const adminNoHp = `08${uniq.slice(-9)}9`;
let adminId: string;
let memberId: string;
let p1Id = ""; // target PATCH jumlah + DELETE
let p2Id = ""; // target PATCH konflik bulan
const memberIds: string[] = [];
const paymentIds: string[] = [];

function patchPayment(id: string, body: unknown): Promise<Response> {
  return PATCH(
    new Request(`http://localhost/api/payments/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: { id } },
  );
}

function deletePayment(id: string): Promise<Response> {
  return DELETE(
    new Request(`http://localhost/api/payments/${id}`, { method: "DELETE" }),
    { params: { id } },
  );
}

beforeAll(async () => {
  // Import dinamis setelah env termuat — prisma butuh DATABASE_URL saat init.
  ({ PATCH, DELETE } = await import("@/app/api/payments/[id]/route"));
  ({ prisma } = await import("@/lib/prisma"));
  ({ signSession } = await import("@/lib/auth"));

  // Admin = actor audit + session. Member A = pemilik payment yang diuji.
  adminId = await prisma.member
    .create({ data: { nama: "Admin Patch", noHp: adminNoHp, pinHash: "x", role: "ADMIN" } })
    .then((m) => m.id);
  memberId = await prisma.member
    .create({ data: { nama: "Budi", noHp: `08${uniq.slice(-8)}9`, pinHash: "x" } })
    .then((m) => m.id);
  memberIds.push(adminId, memberId);

  cookieStore.set("session", {
    value: await signSession({ memberId: adminId, role: "ADMIN" }),
    options: {},
  });

  // Payment langsung via Prisma (bukan API — endpoint POST sudah diuji T-20).
  const p1 = await prisma.payment.create({
    data: { memberId, bulan: 1, tahun: 2026, jumlah: 30000, tanggalBayar: new Date("2026-01-05") },
  });
  p1Id = p1.id;
  paymentIds.push(p1Id);

  // p2: bulan 2 — target PATCH bulan → 1 (konflik dengan p1, member sama).
  const p2 = await prisma.payment.create({
    data: { memberId, bulan: 2, tahun: 2026, jumlah: 30000, tanggalBayar: new Date("2026-02-05") },
  });
  p2Id = p2.id;
  paymentIds.push(p2Id);
});

afterAll(async () => {
  // Urut hapus (FK): payments (member Restrict) → audit_logs (actor
  // Restrict) → members. p1 sudah di-delete di test — deleteMany no-op aman.
  await prisma.payment.deleteMany({ where: { memberId: { in: memberIds } } });
  await prisma.auditLog.deleteMany({
    where: { OR: [{ actorId: adminId }, { entityId: { in: paymentIds } }] },
  });
  await prisma.member.deleteMany({ where: { id: { in: memberIds } } });
});

describe("PATCH /api/payments/[id]", () => {
  it("jumlah berubah → 200, DTO ter-update, audit UPDATE dataLama/dataBaru benar", async () => {
    const res = await patchPayment(p1Id, { jumlah: 35000 });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      id: p1Id,
      memberId,
      memberNama: "Budi", // denormalized
      bulan: 1,
      tahun: 2026,
      jumlah: 35000,
    });

    const rec = await prisma.payment.findUnique({ where: { id: p1Id } });
    expect(rec?.jumlah).toBe(35000);

    // Audit transpose-safe: actorId = admin sesi, entityId = payment target.
    const row = await prisma.auditLog.findFirst({
      where: { actorId: adminId, entityType: "Payment", entityId: p1Id, aksi: "UPDATE" },
    });
    expect(row).not.toBeNull();
    expect(row?.actorId).toBe(adminId);
    expect(row?.entityId).toBe(p1Id);
    expect(row?.dataLama).toMatchObject({ jumlah: 30000, bulan: 1, tahun: 2026 });
    expect(row?.dataBaru).toMatchObject({ jumlah: 35000, bulan: 1, tahun: 2026 });
    expect(row?.dataLama).toHaveProperty("tanggalBayar", "2026-01-05");
    expect(row?.dataLama).toHaveProperty("memberId", memberId);
  });

  it("bulan diubah ke kombinasi yang sudah lunas (member sama) → 409 ALREADY_PAID EXACT", async () => {
    const res = await patchPayment(p2Id, { bulan: 1, tahun: 2026 });
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: "ALREADY_PAID",
      message: "Sudah lunas bulan ini",
      existingPaymentId: p1Id,
    });

    // Tidak ada perubahan: p2 tetap bulan 2, tidak ada audit UPDATE
    const rec = await prisma.payment.findUnique({ where: { id: p2Id } });
    expect(rec?.bulan).toBe(2);
    const audit = await prisma.auditLog.findFirst({
      where: { entityType: "Payment", entityId: p2Id, aksi: "UPDATE" },
    });
    expect(audit).toBeNull();
  });

  it("tanggalBayar rollover kalender (2026-02-30) → 400 — backport fix oracle T-24", async () => {
    const res = await patchPayment(p2Id, { tanggalBayar: "2026-02-30" });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "INVALID_INPUT" });

    // Tidak ada perubahan / audit
    const rec = await prisma.payment.findUnique({ where: { id: p2Id } });
    expect(rec?.tanggalBayar.toISOString().slice(0, 10)).toBe("2026-02-05");
  });

  it("body kosong → 400; jumlah 0 → 400; id tidak ada → 404", async () => {
    const resKosong = await patchPayment(p1Id, {});
    expect(resKosong.status).toBe(400);
    await expect(resKosong.json()).resolves.toMatchObject({ error: "INVALID_INPUT" });

    const resJumlah0 = await patchPayment(p1Id, { jumlah: 0 });
    expect(resJumlah0.status).toBe(400);
    await expect(resJumlah0.json()).resolves.toMatchObject({ error: "INVALID_INPUT" });

    const resNotFound = await patchPayment("cuid_tidak_ada", { jumlah: 100 });
    expect(resNotFound.status).toBe(404);
    await expect(resNotFound.json()).resolves.toMatchObject({ error: "PAYMENT_NOT_FOUND" });
  });
});

describe("DELETE /api/payments/[id]", () => {
  it("sukses → 200 { deleted: true }, record hilang, audit DELETE dataLama lengkap dataBaru null", async () => {
    const res = await deletePayment(p1Id);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ deleted: true, id: p1Id });

    // HARD delete: record hilang dari DB
    const rec = await prisma.payment.findUnique({ where: { id: p1Id } });
    expect(rec).toBeNull();

    // Jejak historis tetap: audit DELETE dengan snapshot dataLama lengkap
    const row = await prisma.auditLog.findFirst({
      where: { actorId: adminId, entityType: "Payment", entityId: p1Id, aksi: "DELETE" },
    });
    expect(row).not.toBeNull();
    expect(row?.actorId).toBe(adminId);
    expect(row?.entityId).toBe(p1Id);
    expect(row?.dataLama).toMatchObject({
      id: p1Id,
      memberId,
      bulan: 1,
      tahun: 2026,
      jumlah: 35000, // nilai TERAKHIR setelah PATCH
    });
    expect(row?.dataLama).toHaveProperty("tanggalBayar", "2026-01-05");
    expect(row?.dataBaru).toBeNull();
  });

  it("id tidak ada → 404 PAYMENT_NOT_FOUND", async () => {
    const res = await deletePayment("cuid_tidak_ada");
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ error: "PAYMENT_NOT_FOUND" });
  });
});
