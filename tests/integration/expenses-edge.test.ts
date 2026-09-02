// Integration test — EDGE filter GET /api/expenses (utang T-35 item 4 & 6).
// 4) Dec→Jan edge: expense 31 Des & 1 Jan (date-only) — filter per periode
//    tidak boleh bocor antar bulan/tahun.
// 6) Midnight-UTC rollover: record tepat di batas rentang [awal bulan,
//    awal bulan berikutnya) — gte INKLUSIF, lt EKSKLUSIF:
//      - 2097-12-31T23:59:59.999Z  → MASUK Des 2097 (masih dalam rentang)
//      - 2098-01-01T00:00:00.000Z  → TIDAK Des 2097 (lt eksklusif), MASUK Jan 2098
//      - 2097-12-01T00:00:00.000Z  → MASUK Des 2097 (gte inklusif)
//      - 2097-11-30T23:59:59.999Z  → TIDAK Des 2097
// Expense di-insert LANGSUNG via prisma (bukan route) — butuh timestamp
// presisi di batas waktu (API hanya terima date-only, sengaja).
// Periode 2097-12 / 2098-01 jauh dari semua file lain → deterministik.
// DB test terisolasi (Docker 5433) + suite serial. Salt `p` per-file.
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

type GetHandler = (request: Request) => Promise<Response>;
let GET: GetHandler;
let prisma: typeof import("@/lib/prisma")["prisma"];
let signSession: typeof import("@/lib/auth")["signSession"];

const uniq = String(Date.now()) + "p";
let adminId: string;
let categoryId: string;
const memberIds: string[] = [];
const expenseIds: string[] = [];
const categoryIds: string[] = [];
// Id expense boundary — dipakai assert membership (bukan set eksak, tahan
// sisa data run crash tahun sama).
const ids = {
  dec31: "",
  jan1: "",
  late: "",
  start: "",
  before: "",
};

function getExpenses(query = ""): Promise<Response> {
  return GET(new Request(`http://localhost/api/expenses${query}`));
}

async function setSession(memberId: string, role: "ADMIN" | "ANGGOTA"): Promise<void> {
  cookieStore.set("session", { value: await signSession({ memberId, role }), options: {} });
}

beforeAll(async () => {
  ({ GET } = await import("@/app/api/expenses/route"));
  ({ prisma } = await import("@/lib/prisma"));
  ({ signSession } = await import("@/lib/auth"));

  adminId = await prisma.member
    .create({ data: { nama: "Admin Edge", noHp: `08${uniq.slice(-9)}9`, pinHash: "x", role: "ANGGOTA" } })
    .then((m) => m.id);
  memberIds.push(adminId);

  categoryId = await prisma.category
    .create({ data: { nama: `CatEdge ${uniq.slice(-6)}`, isDefault: false } })
    .then((c) => c.id);
  categoryIds.push(categoryId);

  // Insert LANGSUNG untuk presisi timestamp di batas rentang.
  const mk = (tanggal: Date, deskripsi: string) =>
    prisma.expense
      .create({
        data: { categoryId, deskripsi, jumlah: 10000, tanggal },
      })
      .then((e) => e.id);

  ids.dec31 = await mk(new Date("2097-12-31"), "Dec 31 midnight");
  ids.jan1 = await mk(new Date("2098-01-01"), "Jan 1 midnight");
  ids.late = await mk(new Date("2097-12-31T23:59:59.999Z"), "Dec 31 23:59:59.999");
  ids.start = await mk(new Date("2097-12-01T00:00:00.000Z"), "Dec 1 00:00:00.000");
  ids.before = await mk(new Date("2097-11-30T23:59:59.999Z"), "Nov 30 23:59:59.999");
  expenseIds.push(ids.dec31, ids.jan1, ids.late, ids.start, ids.before);

  await setSession(adminId, "ADMIN");
});

afterAll(async () => {
  await prisma.loginAttempt.deleteMany({ where: { memberId: { in: memberIds } } });
  await prisma.expense.deleteMany({ where: { id: { in: expenseIds } } });
  await prisma.auditLog.deleteMany({ where: { actorId: adminId } });
  await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
  await prisma.member.deleteMany({ where: { id: { in: memberIds } } });
});

describe("Edge Dec→Jan (item 4)", () => {
  it("filter bulan=12 tahun=2097 → hanya Des, TIDAK bocor ke Jan 2098", async () => {
    const res = await getExpenses("?bulan=12&tahun=2097");
    expect(res.status).toBe(200);
    const list = (await res.json()) as { id: string }[];

    const idsIn = list.map((e) => e.id);
    expect(idsIn).toContain(ids.dec31);
    expect(idsIn).not.toContain(ids.jan1); // 1 Jan bukan Desember
  });

  it("filter bulan=1 tahun=2098 → hanya Jan, TIDAK bocor dari Des 2097", async () => {
    const res = await getExpenses("?bulan=1&tahun=2098");
    expect(res.status).toBe(200);
    const list = (await res.json()) as { id: string }[];

    const idsIn = list.map((e) => e.id);
    expect(idsIn).toContain(ids.jan1);
    expect(idsIn).not.toContain(ids.dec31);
  });
});

describe("Midnight-UTC rollover (item 6)", () => {
  it("Des 2097: 23:59:59.999Z & 00:00:00.000 awal bulan INKLUSIF; 00:00:00.000 Jan & Nov 23:59:59.999 EKSKLUSIF", async () => {
    const res = await getExpenses("?bulan=12&tahun=2097");
    expect(res.status).toBe(200);
    const list = (await res.json()) as { id: string }[];
    const idsIn = list.map((e) => e.id);

    expect(idsIn).toContain(ids.late); // 31 Des 23:59:59.999 < 1 Jan → masih Des
    expect(idsIn).toContain(ids.start); // 1 Des 00:00:00.000 >= gte → Des
    expect(idsIn).not.toContain(ids.jan1); // 1 Jan 00:00:00.000 == lt → EKSKLUSIF
    expect(idsIn).not.toContain(ids.before); // 30 Nov 23:59:59.999 < gte → bukan Des
  });

  it("Jan 2098: 1 Jan 00:00:00.000 INKLUSIF (gte); 31 Des 23:59:59.999 tidak bocor", async () => {
    const res = await getExpenses("?bulan=1&tahun=2098");
    expect(res.status).toBe(200);
    const list = (await res.json()) as { id: string }[];
    const idsIn = list.map((e) => e.id);

    expect(idsIn).toContain(ids.jan1); // gte inklusif → Jan
    expect(idsIn).not.toContain(ids.late);
    expect(idsIn).not.toContain(ids.dec31);
  });
});
