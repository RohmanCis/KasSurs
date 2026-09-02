// Integration test — PATCH & DELETE /api/expenses/[id] (T-25) — audit
// trail wajib (FR-21): tiap PATCH/DELETE menghasilkan SATU entry AuditLog
// dengan dataLama terisi benar (acceptance criteria).
// Pattern sama tests/integration/payments-patch.test.ts: env .env.local
// dimuat manual; beforeAll + dynamic import (tsconfig target es5, no
// top-level await); next/headers cookies() di-mock — handler butuh session
// cookie untuk actorId (middleware TIDAK terlibat saat handler dipanggil
// langsung). RBAC middleware (403 ANGGOTA) diuji eksplisit via middleware()
// call langsung (pola expenses.test.ts). Tamper JWT → 401 diuji via handler
// (flip char TENGAH signature — gotcha 10: flip char terakhir tidak merusak
// decode, bit terbuang).
// Salt `i` per-file (lanjutan skema a–h): Date.now() identik antar file
// tidak masalah — slice manapun memuat salt → noHp/nama kategori beda.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";

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
let middleware: typeof import("@/middleware")["middleware"];

const uniq = String(Date.now()) + "i";
let adminId: string;
let anggotaId: string;
let catAId: string;
let catBId: string;
let e1Id = ""; // target PATCH + DELETE
let e2Id = ""; // target tamper JWT
const memberIds: string[] = [];
const categoryIds: string[] = [];
const expenseIds: string[] = [];

function patchExpense(id: string, body: unknown): Promise<Response> {
  return PATCH(
    new Request(`http://localhost/api/expenses/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: { id } },
  );
}

function deleteExpense(id: string): Promise<Response> {
  return DELETE(new Request(`http://localhost/api/expenses/${id}`, { method: "DELETE" }), {
    params: { id },
  });
}

async function setSession(memberId: string, role: "ADMIN" | "ANGGOTA"): Promise<void> {
  cookieStore.set("session", { value: await signSession({ memberId, role }), options: {} });
}

// Tamper: flip char TENGAH signature (gotcha 10) — token rusak, verifySession
// harus null → handler 401 UNAUTHORIZED.
function tamperToken(token: string): string {
  const parts = token.split(".");
  const sig = parts[2].split("");
  const mid = Math.floor(sig.length / 2);
  sig[mid] = sig[mid] === "a" ? "b" : "a";
  return `${parts[0]}.${parts[1]}.${sig.join("")}`;
}

// Panggil middleware() langsung (guard RBAC route /api/expenses) —
// NextRequest asli dari next/server, tanpa mock.
async function middlewareCall(path: string, opts?: { method?: string; token?: string }) {
  const req = new NextRequest(`http://localhost${path}`, { method: opts?.method ?? "GET" });
  if (opts?.token) req.cookies.set("session", opts.token);
  return middleware(req);
}

beforeAll(async () => {
  ({ PATCH, DELETE } = await import("@/app/api/expenses/[id]/route"));
  ({ prisma } = await import("@/lib/prisma"));
  ({ signSession } = await import("@/lib/auth"));
  ({ middleware } = await import("@/middleware"));

  adminId = await prisma.member
    .create({ data: { nama: "Admin T25", noHp: `08${uniq.slice(-9)}53`, pinHash: "x", role: "ADMIN" } })
    .then((m) => m.id);
  anggotaId = await prisma.member
    .create({ data: { nama: "Anggota T25", noHp: `08${uniq.slice(-9)}54`, pinHash: "x", role: "ANGGOTA" } })
    .then((m) => m.id);
  memberIds.push(adminId, anggotaId);

  catAId = await prisma.category
    .create({ data: { nama: `CatA25 ${uniq.slice(-6)}`, isDefault: false } })
    .then((c) => c.id);
  catBId = await prisma.category
    .create({ data: { nama: `CatB25 ${uniq.slice(-6)}`, isDefault: false } })
    .then((c) => c.id);
  categoryIds.push(catAId, catBId);

  await setSession(adminId, "ADMIN");

  // Expense langsung via Prisma (bukan API — endpoint POST sudah diuji T-24).
  const e1 = await prisma.expense.create({
    data: { categoryId: catAId, deskripsi: "Kopi rapat", jumlah: 20000, tanggal: new Date("2026-02-05") },
  });
  e1Id = e1.id;
  expenseIds.push(e1Id);
  const e2 = await prisma.expense.create({
    data: { categoryId: catBId, deskripsi: "Sewa tempat", jumlah: 50000, tanggal: new Date("2026-03-10") },
  });
  e2Id = e2.id;
  expenseIds.push(e2Id);
});

afterAll(async () => {
  // Urut hapus (FK): expenses (category Restrict) → audit_logs (actor
  // Restrict) → categories custom → members. e1 sudah di-delete di test —
  // deleteMany no-op aman.
  await prisma.expense.deleteMany({ where: { id: { in: expenseIds } } });
  await prisma.auditLog.deleteMany({
    where: { OR: [{ actorId: adminId }, { entityId: { in: expenseIds } }] },
  });
  await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
  await prisma.member.deleteMany({ where: { id: { in: memberIds } } });
});

describe("PATCH /api/expenses/[id]", () => {
  it("sukses → 200, DTO ter-update, audit UPDATE dataLama/dataBaru benar", async () => {
    const res = await patchExpense(e1Id, { deskripsi: "Kopi besar", jumlah: 25000 });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      id: e1Id,
      categoryId: catAId,
      deskripsi: "Kopi besar",
      jumlah: 25000,
      tanggal: "2026-02-05",
    });
    expect(typeof body.categoryNama).toBe("string"); // denormalized

    const rec = await prisma.expense.findUnique({ where: { id: e1Id } });
    expect(rec?.deskripsi).toBe("Kopi besar");
    expect(rec?.jumlah).toBe(25000);

    // Audit transpose-safe: actorId = admin sesi, entityId = expense target.
    const row = await prisma.auditLog.findFirst({
      where: { actorId: adminId, entityType: "Expense", entityId: e1Id, aksi: "UPDATE" },
    });
    expect(row).not.toBeNull();
    expect(row?.actorId).toBe(adminId);
    expect(row?.entityId).toBe(e1Id);
    expect(row?.dataLama).toMatchObject({ deskripsi: "Kopi rapat", jumlah: 20000, categoryId: catAId });
    expect(row?.dataLama).toHaveProperty("tanggal", "2026-02-05");
    expect(row?.dataBaru).toMatchObject({ deskripsi: "Kopi besar", jumlah: 25000, categoryId: catAId });
  });

  it("id tidak ada → 404 EXPENSE_NOT_FOUND", async () => {
    const res = await patchExpense("cuid_tidak_ada", { jumlah: 100 });
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ error: "EXPENSE_NOT_FOUND" });
  });

  it("categoryId baru tidak ada → 404 CATEGORY_NOT_FOUND, tidak ada audit, tidak ada perubahan", async () => {
    const res = await patchExpense(e1Id, { categoryId: "tidak-ada-kategori" });
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ error: "CATEGORY_NOT_FOUND" });

    // Tx rollback: tidak ada audit UPDATE & record tidak berubah.
    const audit = await prisma.auditLog.findFirst({
      where: { entityType: "Expense", entityId: e1Id, aksi: "UPDATE" },
    });
    expect(audit?.dataBaru).toMatchObject({ jumlah: 25000 }); // hanya audit dari test 1
    const rec = await prisma.expense.findUnique({ where: { id: e1Id } });
    expect(rec?.categoryId).toBe(catAId);
  });

  it("jumlah 0/negatif/float, tanggal rollover, body kosong → 400", async () => {
    const resJumlah0 = await patchExpense(e1Id, { jumlah: 0 });
    expect(resJumlah0.status).toBe(400);
    await expect(resJumlah0.json()).resolves.toMatchObject({ error: "INVALID_INPUT" });

    const resJumlahNeg = await patchExpense(e1Id, { jumlah: -5000 });
    expect(resJumlahNeg.status).toBe(400);
    await expect(resJumlahNeg.json()).resolves.toMatchObject({ error: "INVALID_INPUT" });

    const resJumlahFloat = await patchExpense(e1Id, { jumlah: 1500.5 });
    expect(resJumlahFloat.status).toBe(400);
    await expect(resJumlahFloat.json()).resolves.toMatchObject({ error: "INVALID_INPUT" });

    const resRollover = await patchExpense(e1Id, { tanggal: "2026-02-30" });
    expect(resRollover.status).toBe(400);
    await expect(resRollover.json()).resolves.toMatchObject({ error: "INVALID_INPUT" });

    const resKosong = await patchExpense(e1Id, {});
    expect(resKosong.status).toBe(400);
    await expect(resKosong.json()).resolves.toMatchObject({ error: "INVALID_INPUT" });
  });
});

describe("DELETE /api/expenses/[id]", () => {
  it("sukses → 200 { deleted: true }, record hilang, audit DELETE dataLama lengkap dataBaru null", async () => {
    const res = await deleteExpense(e1Id);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ deleted: true, id: e1Id });

    // HARD delete: record hilang dari DB
    const rec = await prisma.expense.findUnique({ where: { id: e1Id } });
    expect(rec).toBeNull();

    // Jejak historis tetap: audit DELETE dengan snapshot dataLama lengkap
    const row = await prisma.auditLog.findFirst({
      where: { actorId: adminId, entityType: "Expense", entityId: e1Id, aksi: "DELETE" },
    });
    expect(row).not.toBeNull();
    expect(row?.actorId).toBe(adminId);
    expect(row?.entityId).toBe(e1Id);
    expect(row?.dataLama).toMatchObject({
      id: e1Id,
      categoryId: catAId,
      deskripsi: "Kopi besar", // nilai TERAKHIR setelah PATCH
      jumlah: 25000,
    });
    expect(row?.dataLama).toHaveProperty("tanggal", "2026-02-05");
    expect(row?.dataBaru).toBeNull();
  });

  it("id tidak ada → 404 EXPENSE_NOT_FOUND", async () => {
    const res = await deleteExpense("cuid_tidak_ada");
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toMatchObject({ error: "EXPENSE_NOT_FOUND" });
  });
});

describe("RBAC & tamper /api/expenses/[id]", () => {
  it("PATCH/DELETE cookie ANGGOTA → 403 (middleware call langsung)", async () => {
    const token = await signSession({ memberId: anggotaId, role: "ANGGOTA" });
    for (const method of ["PATCH", "DELETE"]) {
      const res = await middlewareCall(`/api/expenses/${e2Id}`, { method, token });
      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toMatchObject({ error: "FORBIDDEN" });
    }
  });

  it("tamper JWT → 401 UNAUTHORIZED (handler fallback, PATCH)", async () => {
    const valid = await signSession({ memberId: adminId, role: "ADMIN" });
    cookieStore.set("session", { value: tamperToken(valid), options: {} });

    const res = await patchExpense(e2Id, { jumlah: 9999 });
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ error: "UNAUTHORIZED" });

    // Sesi valid dipulihkan — member e2 tidak berubah (tx tidak jalan).
    await setSession(adminId, "ADMIN");
    const rec = await prisma.expense.findUnique({ where: { id: e2Id } });
    expect(rec?.jumlah).toBe(50000);
  });
});
