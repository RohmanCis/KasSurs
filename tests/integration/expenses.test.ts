// Integration test — GET & POST /api/categories (T-23) + GET & POST
// /api/expenses (T-24) — Modul 4 Expense.
// Pattern sama tests/integration/payments.test.ts: env .env.local dimuat
// manual; beforeAll + dynamic import (tsconfig target es5, no top-level
// await); next/headers cookies() di-mock — handler butuh session cookie
// untuk actorId (middleware TIDAK terlibat saat handler dipanggil langsung).
// RBAC middleware (401/403) diuji eksplisit dengan memanggil middleware()
// dari @/middleware — satu-satunya file yang menguji guard route /api/
// categories & /api/expenses (handler sengaja TIDAK punya cek role sendiri).
// noHp suffix `51`/`52` (alokasi file ini, lihat HANDOFF gotcha 3) + salt
// `f` per-file (lihat definisi uniq di bawah) — bukti anti-tabrakan lintas
// file walau Date.now() identik.
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

type GetHandler = (request: Request) => Promise<Response>;
type PostHandler = (request: Request) => Promise<Response>;
let categoriesGET: GetHandler;
let categoriesPOST: PostHandler;
let expensesGET: GetHandler;
let expensesPOST: PostHandler;
let prisma: typeof import("@/lib/prisma")["prisma"];
let signSession: typeof import("@/lib/auth")["signSession"];
let middleware: typeof import("@/middleware")["middleware"];

// Salt `f` per-file: Date.now() identik antar file tidak masalah — slice
// manapun memuat salt → noHp/nama kategori beda dari file test lain.
const uniq = String(Date.now()) + "f";
let adminId: string;
let anggotaId: string;
let categoryAId: string;
let categoryBId: string;
const createdCategoryIds: string[] = [];
const expenseIds: string[] = [];
const memberIds: string[] = [];

function getCategories(): Promise<Response> {
  return categoriesGET(new Request("http://localhost/api/categories"));
}

function postCategory(body: unknown): Promise<Response> {
  return categoriesPOST(
    new Request("http://localhost/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

function getExpenses(query = ""): Promise<Response> {
  return expensesGET(new Request(`http://localhost/api/expenses${query}`));
}

function postExpense(body: unknown): Promise<Response> {
  return expensesPOST(
    new Request("http://localhost/api/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

function setSession(memberId: string, role: "ADMIN" | "ANGGOTA"): Promise<void> {
  return signSession({ memberId, role }).then((token) => {
    cookieStore.set("session", { value: token, options: {} });
  });
}

// Panggil middleware() langsung (guard RBAC route /api/categories &
// /api/expenses) — NextRequest asli dari next/server, tanpa mock.
async function middlewareCall(path: string, opts?: { method?: string; token?: string }) {
  const req = new NextRequest(`http://localhost${path}`, { method: opts?.method ?? "GET" });
  if (opts?.token) req.cookies.set("session", opts.token);
  return middleware(req);
}

beforeAll(async () => {
  ({ GET: categoriesGET, POST: categoriesPOST } = await import("@/app/api/categories/route"));
  ({ GET: expensesGET, POST: expensesPOST } = await import("@/app/api/expenses/route"));
  ({ prisma } = await import("@/lib/prisma"));
  ({ signSession } = await import("@/lib/auth"));
  ({ middleware } = await import("@/middleware"));

  // Admin = actor audit + session awal. ANGGOTA untuk uji RBAC middleware.
  adminId = await prisma.member
    .create({ data: { nama: "Admin T24", noHp: `08${uniq.slice(-9)}51`, pinHash: "x", role: "ADMIN" } })
    .then((m) => m.id);
  anggotaId = await prisma.member
    .create({ data: { nama: "Anggota T24", noHp: `08${uniq.slice(-9)}52`, pinHash: "x", role: "ANGGOTA" } })
    .then((m) => m.id);
  memberIds.push(adminId, anggotaId);

  // Dua kategori custom untuk filter & POST expense. Nama unik per run.
  categoryAId = await prisma.category
    .create({ data: { nama: `CatA ${uniq.slice(-6)}`, isDefault: false } })
    .then((c) => c.id);
  categoryBId = await prisma.category
    .create({ data: { nama: `CatB ${uniq.slice(-6)}`, isDefault: false } })
    .then((c) => c.id);
  createdCategoryIds.push(categoryAId, categoryBId);

  await setSession(adminId, "ADMIN");
});

afterAll(async () => {
  // Urut hapus (FK): expenses (category Restrict) → audit_logs (actor
  // Restrict) → categories custom → members.
  await prisma.expense.deleteMany({ where: { id: { in: expenseIds } } });
  await prisma.auditLog.deleteMany({
    where: { OR: [{ actorId: adminId }, { entityId: { in: expenseIds } }] },
  });
  await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
  await prisma.member.deleteMany({ where: { id: { in: memberIds } } });
});

describe("RBAC middleware /api/categories & /api/expenses", () => {
  it("tanpa cookie → 401; dengan cookie ANGGOTA → 403 (kedua endpoint)", async () => {
    for (const path of ["/api/categories", "/api/expenses"]) {
      const res401 = await middlewareCall(path);
      expect(res401.status).toBe(401);
      await expect(res401.json()).resolves.toMatchObject({ error: "UNAUTHORIZED" });

      const res403 = await middlewareCall(path, { token: await signSession({ memberId: anggotaId, role: "ANGGOTA" }) });
      expect(res403.status).toBe(403);
      await expect(res403.json()).resolves.toMatchObject({ error: "FORBIDDEN" });
    }
  });

  it("POST sebagai ANGGOTA → 403 (middleware guard method apa pun)", async () => {
    const token = await signSession({ memberId: anggotaId, role: "ANGGOTA" });
    for (const path of ["/api/categories", "/api/expenses"]) {
      const res = await middlewareCall(path, { method: "POST", token });
      expect(res.status).toBe(403);
      await expect(res.json()).resolves.toMatchObject({ error: "FORBIDDEN" });
    }
  });

  it("handler fallback defensif: GET tanpa cookie → 401 UNAUTHORIZED", async () => {
    cookieStore.delete("session");
    const resCats = await getCategories();
    expect(resCats.status).toBe(401);
    const resExp = await getExpenses();
    expect(resExp.status).toBe(401);
    await setSession(adminId, "ADMIN");
  });
});

describe("GET /api/categories (T-23)", () => {
  it("admin → 200, berisi 5 kategori default dari seed (isDefault true)", async () => {
    const res = await getCategories();
    expect(res.status).toBe(200);
    const list = await res.json();
    expect(Array.isArray(list)).toBe(true);

    const defaults = ["Konsumsi", "Acara", "ATK", "Sumbangan", "Lain-lain"];
    for (const nama of defaults) {
      const cat = list.find((c: { nama: string }) => c.nama === nama);
      expect(cat).toBeDefined();
      expect(cat?.isDefault).toBe(true);
      expect(typeof cat?.id).toBe("string");
    }
  });
});

describe("POST /api/categories (T-23)", () => {
  it("sukses → 201 CategoryDTO (isDefault false), tanpa audit log", async () => {
    const nama = `Custom ${uniq.slice(-6)}`;
    const res = await postCategory({ nama });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ nama, isDefault: false });
    expect(typeof body.id).toBe("string");
    createdCategoryIds.push(body.id);

    // TIDAK ada audit untuk Category (spec: audit hanya Payment & Expense).
    const audit = await prisma.auditLog.findFirst({
      where: { actorId: adminId, entityType: "Category", entityId: body.id },
    });
    expect(audit).toBeNull();
  });

  it("nama duplikat → 409 CATEGORY_EXISTS", async () => {
    const nama = `Dup ${uniq.slice(-6)}`;
    const first = await postCategory({ nama });
    expect(first.status).toBe(201);
    createdCategoryIds.push((await first.json()).id);

    const res = await postCategory({ nama });
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: "CATEGORY_EXISTS",
      message: "Kategori sudah ada",
    });
  });

  it("nama kosong / >50 char → 400 INVALID_INPUT", async () => {
    const resEmpty = await postCategory({ nama: "   " });
    expect(resEmpty.status).toBe(400);
    await expect(resEmpty.json()).resolves.toMatchObject({ error: "INVALID_INPUT" });

    const resLong = await postCategory({ nama: "x".repeat(51) });
    expect(resLong.status).toBe(400);
    await expect(resLong.json()).resolves.toMatchObject({ error: "INVALID_INPUT" });
  });
});

describe("GET /api/expenses (T-24)", () => {
  it("admin tanpa filter → 200 array; filter categoryId & bulan/tahun benar", async () => {
    // exp1 → categoryA, Februari; exp2 → categoryB, Maret.
    const e1 = await prisma.expense.create({
      data: { categoryId: categoryAId, deskripsi: "Makan rapat", jumlah: 25000, tanggal: new Date("2026-02-15") },
    });
    const e2 = await prisma.expense.create({
      data: { categoryId: categoryBId, deskripsi: "Sewa tempat", jumlah: 50000, tanggal: new Date("2026-03-10") },
    });
    expenseIds.push(e1.id, e2.id);

    const resAll = await getExpenses();
    expect(resAll.status).toBe(200);
    const all = await resAll.json();
    expect(Array.isArray(all)).toBe(true);
    const dto1 = all.find((e: { id: string }) => e.id === e1.id);
    expect(dto1).toMatchObject({
      categoryId: categoryAId,
      deskripsi: "Makan rapat",
      jumlah: 25000,
      tanggal: "2026-02-15",
    });
    expect(typeof dto1.categoryNama).toBe("string"); // denormalized

    // Filter categoryId → hanya milik kategori itu.
    const resCat = await getExpenses(`?categoryId=${categoryAId}`);
    expect(resCat.status).toBe(200);
    const listCat = await resCat.json();
    expect(listCat.some((e: { id: string }) => e.id === e1.id)).toBe(true);
    expect(listCat.some((e: { id: string }) => e.id === e2.id)).toBe(false);

    // Filter periode (bulan/tahun pada tanggal) → subset benar.
    const resFeb = await getExpenses("?bulan=2&tahun=2026");
    expect(resFeb.status).toBe(200);
    const listFeb = await resFeb.json();
    expect(listFeb.some((e: { id: string }) => e.id === e1.id)).toBe(true);
    expect(listFeb.some((e: { id: string }) => e.id === e2.id)).toBe(false);

    // Kombinasi categoryId + periode.
    const resCombo = await getExpenses(`?categoryId=${categoryBId}&bulan=3&tahun=2026`);
    expect(resCombo.status).toBe(200);
    const listCombo = await resCombo.json();
    expect(listCombo.some((e: { id: string }) => e.id === e2.id)).toBe(true);
    expect(listCombo.some((e: { id: string }) => e.id === e1.id)).toBe(false);
  });

  it("query bulan/tahun invalid → 400", async () => {
    for (const q of ["?bulan=13&tahun=2026", "?bulan=2", "?tahun=26", "?bulan=abc&tahun=2026"]) {
      const res = await getExpenses(q);
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toMatchObject({ error: "INVALID_INPUT" });
    }
  });
});

describe("POST /api/expenses (T-24)", () => {
  it("sukses → 201 ExpenseDTO + audit CREATE entityType 'Expense' tercatat", async () => {
    const res = await postExpense({
      categoryId: categoryAId,
      deskripsi: "Kopi rapat",
      jumlah: 20000,
      tanggal: "2026-02-05",
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({
      categoryId: categoryAId,
      deskripsi: "Kopi rapat",
      jumlah: 20000,
      tanggal: "2026-02-05",
    });
    expect(typeof body.id).toBe("string");
    expect(typeof body.categoryNama).toBe("string"); // denormalized
    expect(typeof body.createdAt).toBe("string");
    expenseIds.push(body.id);

    // Audit transpose-safe: actorId = admin sesi DAN entityId = expense baru.
    const row = await prisma.auditLog.findFirst({
      where: { actorId: adminId, entityType: "Expense", entityId: body.id },
    });
    expect(row).not.toBeNull();
    expect(row?.actorId).toBe(adminId);
    expect(row?.entityId).toBe(body.id);
    expect(row?.aksi).toBe("CREATE");
    expect(row?.dataLama).toBeNull();
    expect(row?.dataBaru).toMatchObject({
      categoryId: categoryAId,
      deskripsi: "Kopi rapat",
      jumlah: 20000,
      tanggal: "2026-02-05",
    });
  });

  it("jumlah 0/negatif, tanggal datetime ISO, deskripsi kosong → 400; categoryId tidak ada → 404", async () => {
    const base = { categoryId: categoryAId, deskripsi: "Test", jumlah: 10000, tanggal: "2026-04-01" };

    const resJumlah0 = await postExpense({ ...base, jumlah: 0 });
    expect(resJumlah0.status).toBe(400);
    await expect(resJumlah0.json()).resolves.toMatchObject({ error: "INVALID_INPUT" });

    const resJumlahNeg = await postExpense({ ...base, jumlah: -5000 });
    expect(resJumlahNeg.status).toBe(400);
    await expect(resJumlahNeg.json()).resolves.toMatchObject({ error: "INVALID_INPUT" });

    const resDatetime = await postExpense({ ...base, tanggal: "2026-04-01T10:00:00Z" });
    expect(resDatetime.status).toBe(400);
    await expect(resDatetime.json()).resolves.toMatchObject({ error: "INVALID_INPUT" });

    const resDeskripsi = await postExpense({ ...base, deskripsi: "   " });
    expect(resDeskripsi.status).toBe(400);
    await expect(resDeskripsi.json()).resolves.toMatchObject({ error: "INVALID_INPUT" });

    const resNotFound = await postExpense({ ...base, categoryId: "tidak-ada-kategori" });
    expect(resNotFound.status).toBe(404);
    await expect(resNotFound.json()).resolves.toMatchObject({ error: "CATEGORY_NOT_FOUND" });
  });

  it("tanggal rollover kalender (2026-02-30, 2026-04-31) & 2026-02-29 non-leap → 400; 2024-02-29 leap → 201", async () => {
    // Fix oracle T-24: Date.parse("2026-02-30") TIDAK NaN di V8 (silent
    // rollover → Mar 2) — roundtrip check wajib menolak tanggal mustahil.
    const base = { categoryId: categoryAId, deskripsi: "Rollover", jumlah: 10000 };
    for (const tanggal of ["2026-02-30", "2026-04-31", "2026-02-29"]) {
      const res = await postExpense({ ...base, tanggal });
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toMatchObject({ error: "INVALID_INPUT" });
    }

    const resLeap = await postExpense({ ...base, tanggal: "2024-02-29" });
    expect(resLeap.status).toBe(201);
    const body = await resLeap.json();
    expect(body.tanggal).toBe("2024-02-29");
    expenseIds.push(body.id);
  });
});
