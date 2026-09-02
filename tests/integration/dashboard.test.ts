// Integration test — GET /api/dashboard/summary (T-27) — FR-12/FR-14.
// Pattern sama tests/integration/expenses.test.ts: env .env.local dimuat
// manual; beforeAll + dynamic import (tsconfig target es5, no top-level
// await); next/headers cookies() di-mock; middleware() call langsung untuk
// RBAC (endpoint ini sengaja TIDAK admin-only — ANGGOTA harus lolos).
//
// AGGREGATE DI DB DEV BERBAGI: saldo & jumlahBelumBayar adalah agregat
// organisasi-wide — file test lain (worker paralel, DB sama) menulis &
// menghapus payments/expenses/members SEPANJANG run. Supaya assert EXACT
// deterministik:
//  1) Snapshot = STATE PENUH (identitas record + jumlah + tanggal + status),
//     bukan sekadar SUM — sum bisa "kebetulan sama" walau record beda (semua
//     payment file lain 30000, create lalu delete saling meniadakan; terbukti
//     empiris: mismatch ±30000 dalam window yang "stabil" secara sum).
//  2) withStableWindow: pre-state → GET → post-state; expected dihitung dari
//     pre DENGAN SEMANTIK SAMA persis route; hanya dipakai jika pre == post
//     (identity-key sama — tidak ada tulis paralel di sela); kalau beda →
//     retry (bounded 8×, data lain menulis sebentar — pasti ada window tenang).
//  3) "Admin sesi" dibuat dgn role DB ANGGOTA (token role ADMIN — verifySession
//     murni JWT, tanpa cek DB): mencegah file ini ikut meng-gelembungkan
//     hitungan global "admin aktif" yang dipakai test LAST_ADMIN
//     (members-deactivate) — intervensi silang empiris.
//
// PERFORMA (Supabase pooler ~500ms/query): create beforeAll diparalelkan
// (hook < timeout); snapshot hanya 3 query (findMany) vs 6 sebelumnya.
// Salt `j` per-file (lanjutan skema a–i).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";

// Supabase pooler ~500ms/query: route 6 query + snapshot test 3 query →
// tiap test 5-8s, over default 5s testTimeout; plus withStableWindow retry
// (maks 8 × ~6s) utk menangkal tulis paralel. Naikkan per-file (hanya ini).
vi.setConfig({ testTimeout: 90000, hookTimeout: 20000 });

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
let middleware: typeof import("@/middleware")["middleware"];

// Bulan/tahun berjalan — dihitung SEKALI di top-level; route menghitung
// sendiri dari now() (beda milidetik tidak masalah, kecuali tengah malam
// UTC — risiko diterima, konsisten dgn spek "bulan berjalan = sekarang").
const now = new Date();
const tahun = now.getUTCFullYear();
const bulan = now.getUTCMonth() + 1;
const prevBulan = bulan === 1 ? 12 : bulan - 1;
const prevTahun = bulan === 1 ? tahun - 1 : tahun;
const rangeBulanIni = {
  gte: new Date(Date.UTC(tahun, bulan - 1, 1)),
  lt: new Date(Date.UTC(tahun, bulan, 1)),
};

const uniq = String(Date.now()) + "j";
let adminId: string;
let anggotaId: string;
const m1 = { id: "" }; // aktif, bayar bulan ini
const m2 = { id: "" }; // aktif, bayar bulan ini
const m3 = { id: "" }; // aktif, BELUM bayar
const m4 = { id: "" }; // NONAKTIF — punya payment bulan ini (rapel)
const memberIds: string[] = [];
const expenseIds: string[] = [];
const categoryIds: string[] = [];

function getSummary(): Promise<Response> {
  return GET(new Request("http://localhost/api/dashboard/summary"));
}

async function setSession(memberId: string, role: "ADMIN" | "ANGGOTA"): Promise<void> {
  cookieStore.set("session", { value: await signSession({ memberId, role }), options: {} });
}

function tamperToken(token: string): string {
  const parts = token.split(".");
  const sig = parts[2].split("");
  const mid = Math.floor(sig.length / 2);
  sig[mid] = sig[mid] === "a" ? "b" : "a";
  return `${parts[0]}.${parts[1]}.${sig.join("")}`;
}

// ===== Snapshot state PENUH (identitas, bukan sum) =====
type FullState = {
  payments: { id: string; memberId: string; bulan: number; tahun: number; jumlah: number; memberAktif: boolean }[];
  expenses: { id: string; jumlah: number; tanggal: number }[]; // tanggal = ms
  activeMemberIds: string[];
};

async function fullState(): Promise<FullState> {
  const [payments, expenses, activeMembers] = await Promise.all([
    prisma.payment.findMany({
      include: { member: { select: { statusAktif: true } } },
    }),
    prisma.expense.findMany(),
    prisma.member.findMany({ where: { statusAktif: true }, select: { id: true } }),
  ]);
  return {
    payments: payments.map((p) => ({
      id: p.id,
      memberId: p.memberId,
      bulan: p.bulan,
      tahun: p.tahun,
      jumlah: p.jumlah,
      memberAktif: p.member.statusAktif,
    })),
    expenses: expenses.map((e) => ({ id: e.id, jumlah: e.jumlah, tanggal: e.tanggal.getTime() })),
    activeMemberIds: activeMembers.map((m) => m.id),
  };
}

// Identity-key utk cek stabilitas: sorted-by-id → urutan record tidak
// memengaruhi key; record berbeda (walau jumlah sama) → key beda.
function stateKey(s: FullState): string {
  return JSON.stringify({
    p: s.payments
      .map((x) => [x.id, x.memberId, x.bulan, x.tahun, x.jumlah, x.memberAktif])
      .sort(),
    e: s.expenses.map((x) => [x.id, x.jumlah, x.tanggal]).sort(),
    a: [...s.activeMemberIds].sort(),
  });
}

// Expected dihitung dari snapshot dgn SEMANTIK SAMA persis route (saldo =
// Σ payment − Σ expense semua waktu; bulan ini = kolom bulan/tahun utk
// Payment, rentang tanggal utk Expense; jumlahBelumBayar = aktif − aktif
// yg sudah bayar bulan ini, distinct memberId; jumlahAnggotaAktif = aktif;
// jumlahLunas = aktif yg sudah bayar bulan ini — FASE 1 2026-09-03, aditif).
function expectedFrom(s: FullState) {
  const payAll = s.payments.reduce((a, p) => a + p.jumlah, 0);
  const expAll = s.expenses.reduce((a, e) => a + e.jumlah, 0);
  const payCur = s.payments
    .filter((p) => p.bulan === bulan && p.tahun === tahun)
    .reduce((a, p) => a + p.jumlah, 0);
  const expCur = s.expenses
    .filter((e) => e.tanggal >= rangeBulanIni.gte.getTime() && e.tanggal < rangeBulanIni.lt.getTime())
    .reduce((a, e) => a + e.jumlah, 0);
  const paidActiveCur = new Set(
    s.payments
      .filter((p) => p.bulan === bulan && p.tahun === tahun && p.memberAktif)
      .map((p) => p.memberId),
  ).size;
  return {
    saldo: payAll - expAll,
    totalMasukBulanIni: payCur,
    totalKeluarBulanIni: expCur,
    jumlahBelumBayar: s.activeMemberIds.length - paidActiveCur,
    jumlahAnggotaAktif: s.activeMemberIds.length,
    jumlahLunas: paidActiveCur,
  };
}

type ExpectedSummary = ReturnType<typeof expectedFrom>;
async function stableSummary(role: "ADMIN" | "ANGGOTA"): Promise<{ body: ExpectedSummary; expected: ExpectedSummary }> {
  for (let attempt = 1; attempt <= 8; attempt++) {
    const pre = await fullState();
    await setSession(role === "ADMIN" ? adminId : anggotaId, role);
    const res = await getSummary();
    const body = (await res.json()) as ExpectedSummary;
    const post = await fullState();
    if (stateKey(pre) === stateKey(post)) return { body, expected: expectedFrom(pre) };
  }
  throw new Error("dashboard: data lain terus berubah saat pengukuran (8 percobaan tanpa window stabil)");
}

async function middlewareCall(path: string, opts?: { method?: string; token?: string }) {
  const req = new NextRequest(`http://localhost${path}`, { method: opts?.method ?? "GET" });
  if (opts?.token) req.cookies.set("session", opts.token);
  return middleware(req);
}

beforeAll(async () => {
  ({ GET } = await import("@/app/api/dashboard/summary/route"));
  ({ prisma } = await import("@/lib/prisma"));
  ({ signSession } = await import("@/lib/auth"));
  ({ middleware } = await import("@/middleware"));

  // "Admin sesi" role DB = ANGGOTA (token ADMIN) — lihat header poin 3.
  // Semua create diparalelkan — Supabase pooler ~500ms/query; sequential
  // 14 create > 5s hook timeout (itulah penyebab timeout sebelumnya).
  const suffix = uniq.slice(-8);
  const [a, ang, a1, a2, a3, a4] = await Promise.all([
    prisma.member.create({ data: { nama: "Admin T27", noHp: `08${uniq.slice(-9)}55`, pinHash: "x", role: "ANGGOTA" } }),
    prisma.member.create({ data: { nama: "Anggota T27", noHp: `08${uniq.slice(-9)}56`, pinHash: "x", role: "ANGGOTA" } }),
    prisma.member.create({ data: { nama: "M1", noHp: `08${suffix}1`, pinHash: "x" } }),
    prisma.member.create({ data: { nama: "M2", noHp: `08${suffix}2`, pinHash: "x" } }),
    prisma.member.create({ data: { nama: "M3", noHp: `08${suffix}3`, pinHash: "x" } }),
    prisma.member.create({ data: { nama: "M4", noHp: `08${suffix}4`, pinHash: "x", statusAktif: false } }),
  ]);
  adminId = a.id;
  anggotaId = ang.id;
  m1.id = a1.id;
  m2.id = a2.id;
  m3.id = a3.id;
  m4.id = a4.id;
  memberIds.push(adminId, anggotaId, m1.id, m2.id, m3.id, m4.id);

  const [catA, catB] = await Promise.all([
    prisma.category.create({ data: { nama: `CatA27 ${uniq.slice(-6)}`, isDefault: false } }),
    prisma.category.create({ data: { nama: `CatB27 ${uniq.slice(-6)}`, isDefault: false } }),
  ]);
  categoryIds.push(catA.id, catB.id);

  // Payments — bulan berjalan: m1, m2 (aktif), m4 (nonaktif, rapel). Bulan
  // lalu: m1 (rapel — tidak boleh masuk totalMasukBulanIni). Expenses —
  // 900000 bulan berjalan (dominasi saldo negatif), 30000 bulan lalu.
  const e1 = await prisma.expense.create({
    data: { categoryId: catA.id, deskripsi: "Belanja besar", jumlah: 900000, tanggal: new Date(Date.UTC(tahun, bulan - 1, 15)) },
  });
  expenseIds.push(e1.id);
  const e2 = await prisma.expense.create({
    data: { categoryId: catB.id, deskripsi: "Sewa bulan lalu", jumlah: 30000, tanggal: new Date(Date.UTC(prevTahun, prevBulan - 1, 10)) },
  });
  expenseIds.push(e2.id);
  await Promise.all([
    prisma.payment.create({
      data: { memberId: m1.id, bulan, tahun, jumlah: 30000, tanggalBayar: new Date(Date.UTC(tahun, bulan - 1, 5)) },
    }),
    prisma.payment.create({
      data: { memberId: m2.id, bulan, tahun, jumlah: 30000, tanggalBayar: new Date(Date.UTC(tahun, bulan - 1, 6)) },
    }),
    prisma.payment.create({
      data: { memberId: m4.id, bulan, tahun, jumlah: 30000, tanggalBayar: new Date(Date.UTC(tahun, bulan - 1, 7)) },
    }),
    prisma.payment.create({
      data: {
        memberId: m1.id,
        bulan: prevBulan,
        tahun: prevTahun,
        jumlah: 30000,
        tanggalBayar: new Date(Date.UTC(prevTahun, prevBulan - 1, 10)),
      },
    }),
  ]);
});

afterAll(async () => {
  // Urut hapus (FK): loginAttempts → payments (member Restrict) → expenses
  // (category Restrict) → audit_logs (actor Restrict) → categories → members.
  await prisma.loginAttempt.deleteMany({ where: { memberId: { in: memberIds } } });
  await prisma.payment.deleteMany({ where: { memberId: { in: memberIds } } });
  await prisma.expense.deleteMany({ where: { id: { in: expenseIds } } });
  await prisma.auditLog.deleteMany({ where: { actorId: adminId } });
  await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
  await prisma.member.deleteMany({ where: { id: { in: memberIds } } });
});

describe("GET /api/dashboard/summary", () => {
  it("tanpa cookie → 401 (handler fallback)", async () => {
    cookieStore.delete("session");
    const res = await getSummary();
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ error: "UNAUTHORIZED" });
    await setSession(adminId, "ADMIN");
  });

  it("ADMIN → 200 exact 6 field; saldo negatif (expense>payment); rapel bulan lalu tidak masuk; payment m4 NONAKTIF tidak mengurangi jumlahBelumBayar", async () => {
    const { body, expected } = await stableSummary("ADMIN");

    // Exact — semua field sekaligus (saldo, masuk, keluar, belum bayar),
    // dihitung dari state penuh dgn semantik sama persis route.
    expect(body).toEqual(expected);

    // Saldo negatif: expense bulan ini (900000) dominasi → negatif.
    expect(body.saldo).toBeLessThan(0);

    // Rapel bulan lalu (30000 m1, kolom bulan/tahun prev) TIDAK dihitung
    // di totalMasukBulanIni — expectedFrom memakai kolom bulan/tahun
    // persis route; kalau route salah (pakai tanggalBayar), assert gagal.
    expect(body.totalMasukBulanIni).toBe(expected.totalMasukBulanIni);

    // Skenario jumlahBelumBayar: aktif seed = admin, anggota, m1, m2, m3
    // (5); sudah bayar bulan ini = m1, m2 (2); m3 belum. Payment m4
    // (NONAKTIF, bulan ini) TIDAK dihitung sbg pembayar — expectedFrom
    // hanya menghitung memberAktif=true; kalau route menghitung m4 (bug),
    // body selisih 1 → toEqual menangkap.
    expect(body.jumlahBelumBayar).toBe(expected.jumlahBelumBayar);
  });

  it("ANGGOTA → 200 tanpa jumlahBelumBayar; tiga angka identik dgn ADMIN (organisasi-wide)", async () => {
    const a = await stableSummary("ANGGOTA");
    const b = await stableSummary("ADMIN");

    expect(a.body).toMatchObject({
      saldo: a.expected.saldo,
      totalMasukBulanIni: a.expected.totalMasukBulanIni,
      totalKeluarBulanIni: a.expected.totalKeluarBulanIni,
    });
    expect(a.body).not.toHaveProperty("jumlahBelumBayar");
    // Lock intent (MINOR 2): field aggregate dikirim untuk KEDUA role
    // (FR-14 transparansi) — kalau route meng-gate admin-only, assert ini
    // merah, bukan false-negative.
    expect(a.body).toHaveProperty("jumlahLunas");
    expect(a.body).toHaveProperty("jumlahAnggotaAktif");

    // Konsistensi lintas role: sama data, organisasi-wide (bukan difilter
    // member) → angka identik (dua GET dalam SATU window stabil).
    expect(b.body.saldo).toBe(a.body.saldo);
    expect(b.body.totalMasukBulanIni).toBe(a.body.totalMasukBulanIni);
    expect(b.body.totalKeluarBulanIni).toBe(a.body.totalKeluarBulanIni);
  });
});

describe("RBAC & tamper /api/dashboard/summary", () => {
  it("middleware: cookie ANGGOTA → LOLOS (bukan 403, beda endpoint admin)", async () => {
    const token = await signSession({ memberId: anggotaId, role: "ANGGOTA" });
    const res = await middlewareCall("/api/dashboard/summary", { token });
    expect(res.status).not.toBe(403);
    expect(res.status).toBe(200); // NextResponse.next() — lolos ke handler

    // Kontrol: endpoint admin tetap 403 untuk ANGGOTA (guard tidak bocor).
    const resAdmin = await middlewareCall("/api/expenses", { token });
    expect(resAdmin.status).toBe(403);
    await expect(resAdmin.json()).resolves.toMatchObject({ error: "FORBIDDEN" });
  });

  it("tamper JWT → 401 (handler fallback)", async () => {
    const valid = await signSession({ memberId: adminId, role: "ADMIN" });
    cookieStore.set("session", { value: tamperToken(valid), options: {} });
    const res = await getSummary();
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ error: "UNAUTHORIZED" });
    await setSession(adminId, "ADMIN");
  });
});
