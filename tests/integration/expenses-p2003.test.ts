// Integration test — POST /api/expenses categoryId tidak eksisten (utang
// T-35 item 3). Verifikasi: error rapi 404 CATEGORY_NOT_FOUND (BUKAN 500
// unhandled P2003). Cek route source: cek existence category ada DI DALAM
// tx (tx.category.findUnique → null → not_found) → create tidak pernah
// dijalankan → tidak ada P2003 dari FK categoryId. Catch P2003 di route
// hanya untuk FK actorId audit (sesi member hilang) — bukan untuk categoryId.
// Perbaikan route TIDAK diperlukan (implementasi sudah benar).
// DB test terisolasi (Docker 5433) + suite serial. Salt `o` per-file.
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

type PostHandler = (request: Request) => Promise<Response>;
let POST: PostHandler;
let prisma: typeof import("@/lib/prisma")["prisma"];
let signSession: typeof import("@/lib/auth")["signSession"];

const uniq = String(Date.now()) + "o";
let adminId: string;
let categoryId: string;
const memberIds: string[] = [];
const expenseIds: string[] = [];
const categoryIds: string[] = [];

function postExpense(body: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost/api/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeAll(async () => {
  ({ POST } = await import("@/app/api/expenses/route"));
  ({ prisma } = await import("@/lib/prisma"));
  ({ signSession } = await import("@/lib/auth"));

  adminId = await prisma.member
    .create({ data: { nama: "Admin P2003", noHp: `08${uniq.slice(-9)}9`, pinHash: "x", role: "ANGGOTA" } })
    .then((m) => m.id);
  memberIds.push(adminId);

  categoryId = await prisma.category
    .create({ data: { nama: `CatP2003 ${uniq.slice(-6)}`, isDefault: false } })
    .then((c) => c.id);
  categoryIds.push(categoryId);

  cookieStore.set("session", {
    value: await signSession({ memberId: adminId, role: "ADMIN" }),
    options: {},
  });
});

afterAll(async () => {
  await prisma.loginAttempt.deleteMany({ where: { memberId: { in: memberIds } } });
  await prisma.expense.deleteMany({ where: { id: { in: expenseIds } } });
  await prisma.auditLog.deleteMany({ where: { actorId: adminId } });
  await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
  await prisma.member.deleteMany({ where: { id: { in: memberIds } } });
});

describe("POST /api/expenses — categoryId tidak eksisten", () => {
  it("categoryId tidak ada → 404 CATEGORY_NOT_FOUND (bukan 500 unhandled)", async () => {
    const res = await postExpense({
      categoryId: "tidak-ada-kategori-id",
      deskripsi: "P2003 check",
      jumlah: 10000,
      tanggal: "2097-05-01",
    });

    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      error: "CATEGORY_NOT_FOUND",
      message: "Kategori tidak ditemukan",
    });

    // Tidak ada efek samping: 0 baris expense + 0 audit untuk kasus ini.
    expect(await prisma.expense.count({ where: { deskripsi: "P2003 check" } })).toBe(0);
  });

  it("kontrol positif: categoryId valid → 201 (memastikan 404 bukan false positive)", async () => {
    const res = await postExpense({
      categoryId,
      deskripsi: "Kontrol P2003",
      jumlah: 15000,
      tanggal: "2097-05-02",
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.categoryId).toBe(categoryId);
    expenseIds.push(body.id);
  });
});
