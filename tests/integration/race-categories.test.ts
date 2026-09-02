// Integration test — RACE P2002 POST /api/categories (utang T-35 item 2).
// Dua POST konkuren nama kategori SAMA → constraint unique Category.nama
// memastikan tepat SATU 201 + SATU 409 CATEGORY_EXISTS (pre-check findUnique
// berlomba; constraint DB yang menengahi). Jalur catch P2002 route categories
// yang sebelumnya hanya dianalisis — kini diuji nyata.
// DB test terisolasi (Docker 5433) + suite serial → deterministik.
// Salt `n` per-file (lanjutan skema a–l).
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

const uniq = String(Date.now()) + "n";
let adminId: string;
const memberIds: string[] = [];
const createdCategoryIds: string[] = [];

function postCategory(body: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeAll(async () => {
  ({ POST } = await import("@/app/api/categories/route"));
  ({ prisma } = await import("@/lib/prisma"));
  ({ signSession } = await import("@/lib/auth"));

  // Admin sesi role DB = ANGGOTA + token claim ADMIN (pola file lain).
  adminId = await prisma.member
    .create({ data: { nama: "Admin RaceCat", noHp: `08${uniq.slice(-9)}9`, pinHash: "x", role: "ANGGOTA" } })
    .then((m) => m.id);
  memberIds.push(adminId);

  cookieStore.set("session", {
    value: await signSession({ memberId: adminId, role: "ADMIN" }),
    options: {},
  });
});

afterAll(async () => {
  // Audit Category tidak ada (spec) — cukup hapus member.
  await prisma.loginAttempt.deleteMany({ where: { memberId: { in: memberIds } } });
  await prisma.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
  await prisma.member.deleteMany({ where: { id: { in: memberIds } } });
});

describe("P2002 race POST /api/categories", () => {
  it("dua POST konkuren nama sama → tepat 1×201 + 1×409 CATEGORY_EXISTS; 1 baris kategori di DB", async () => {
    const nama = `RaceCat ${uniq.slice(-6)}`; // unik per run — tidak bentrok data lain
    const [a, b] = await Promise.all([postCategory({ nama }), postCategory({ nama })]);

    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);

    const winner = a.status === 201 ? a : b;
    const loser = a.status === 201 ? b : a;
    const winnerBody = await winner.json();
    const loserBody = await loser.json();

    expect(winnerBody).toMatchObject({ nama, isDefault: false });
    expect(typeof winnerBody.id).toBe("string");
    expect(loserBody).toEqual({
      error: "CATEGORY_EXISTS",
      message: "Kategori sudah ada",
    });
    createdCategoryIds.push(winnerBody.id);

    const count = await prisma.category.count({ where: { nama } });
    expect(count).toBe(1);
  });
});
