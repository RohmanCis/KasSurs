// Integration test — RACE upsert reportSnapshots (utang T-35 item 8).
// Dua GET /api/reports/pdf KONKUREN utk periode BARU (belum ada snapshot) →
// keduanya 200, tepat 1 baris snapshot di DB, dan kedua response
// BYTE-IDENTIKAL (bandingkan arrayBuffer). FR-23 single-source: export
// periode sama harus identik walau dijalankan bersamaan.
// Implementasi (fix race): hitung+upsert diserialkan dengan advisory lock
// DB `pg_advisory_xact_lock` per (bulan,tahun) — penulis kedua menunggu,
// lalu render dari payload BEKU milik penulis pertama. Tanpa lock, tiap
// panggilan me-render payload lokalnya sendiri (dibuatPada beda milidetik →
// PDF beda byte) — itulah bug yang ditangkap test ini.
// Periode 2096-07 (jauh di masa depan) — tak disentuh file lain.
// Salt `s` per-file.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

vi.setConfig({ testTimeout: 90000 });

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
let pdfGET: GetHandler;
let prisma: typeof import("@/lib/prisma")["prisma"];
let signSession: typeof import("@/lib/auth")["signSession"];

const T_BULAN = 7;
const T_TAHUN = 2096;

const uniq = String(Date.now()) + "s";
let adminId: string;
let payerId: string;
let categoryId: string;
const memberIds: string[] = [];
const paymentIds: string[] = [];
const expenseIds: string[] = [];
const categoryIds: string[] = [];

function pdfUrl(): Request {
  return new Request(`http://localhost/api/reports/pdf?bulan=${T_BULAN}&tahun=${T_TAHUN}`);
}

beforeAll(async () => {
  ({ GET: pdfGET } = await import("@/app/api/reports/pdf/route"));
  ({ prisma } = await import("@/lib/prisma"));
  ({ signSession } = await import("@/lib/auth"));

  // Bersihkan sisa snapshot run sebelumnya (crash) utk periode ini — dan
  // PASTIKAN tidak ada snapshot: inilah prasyarat "periode BARU" utk race.
  await prisma.reportSnapshot.deleteMany({ where: { bulan: T_BULAN, tahun: T_TAHUN } });

  // Admin sesi (role DB ANGGOTA + token ADMIN) + 1 member ber-payment +
  // 1 kategori + 1 expense di periode → payload non-trivial. Urutan:
  // kategori dulu (expense butuh categoryId nyata), lalu expense & payment.
  const suffix = uniq.slice(-8);
  const [a, p, c] = await Promise.all([
    prisma.member.create({ data: { nama: "Admin RaceSnap", noHp: `08${uniq.slice(-9)}9`, pinHash: "x", role: "ANGGOTA" } }),
    prisma.member.create({ data: { nama: "Payer RaceSnap", noHp: `08${suffix}1`, pinHash: "x" } }),
    prisma.category.create({ data: { nama: `CatRaceSnap ${uniq.slice(-6)}`, isDefault: false } }),
  ]);
  adminId = a.id;
  payerId = p.id;
  categoryId = c.id;
  memberIds.push(adminId, payerId);
  categoryIds.push(c.id);

  const e = await prisma.expense.create({
    data: {
      categoryId: c.id,
      deskripsi: "Biaya rapat periode",
      jumlah: 20000,
      tanggal: new Date(Date.UTC(T_TAHUN, T_BULAN - 1, 15)),
    },
  });
  expenseIds.push(e.id);

  await prisma.payment.create({
    data: {
      memberId: p.id,
      bulan: T_BULAN,
      tahun: T_TAHUN,
      jumlah: 30000,
      tanggalBayar: new Date(Date.UTC(T_TAHUN, T_BULAN - 1, 5)),
    },
  });

  cookieStore.set("session", {
    value: await signSession({ memberId: adminId, role: "ADMIN" }),
    options: {},
  });
});

afterAll(async () => {
  await prisma.loginAttempt.deleteMany({ where: { memberId: { in: memberIds } } });
  await prisma.reportSnapshot.deleteMany({ where: { bulan: T_BULAN, tahun: T_TAHUN } });
  await prisma.payment.deleteMany({ where: { memberId: { in: memberIds } } });
  await prisma.expense.deleteMany({ where: { id: { in: expenseIds } } });
  await prisma.auditLog.deleteMany({ where: { actorId: adminId } });
  await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
  await prisma.member.deleteMany({ where: { id: { in: memberIds } } });
});

describe("Race upsert reportSnapshots", () => {
  it("dua GET pdf konkuren periode BARU → 200+200, tepat 1 snapshot, response byte-identikal", async () => {
    const [ra, rb] = await Promise.all([pdfGET(pdfUrl()), pdfGET(pdfUrl())]);

    expect(ra.status).toBe(200);
    expect(rb.status).toBe(200);

    // Upsert idempotent → tepat 1 baris snapshot untuk periode ini.
    const count = await prisma.reportSnapshot.count({
      where: { bulan: T_BULAN, tahun: T_TAHUN },
    });
    expect(count).toBe(1);

    // Byte-identikal: single-source payload (FR-23) → setCreationDate &
    // setFileId dari payload yang SAMA → PDF tidak boleh beda 1 byte pun.
    const bytesA = new Uint8Array(await ra.arrayBuffer());
    const bytesB = new Uint8Array(await rb.arrayBuffer());
    expect(bytesA.length).toBeGreaterThan(0);
    expect(bytesA).toEqual(bytesB);
  });
});
