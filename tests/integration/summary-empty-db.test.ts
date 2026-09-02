// Integration test — EMPTY-DB summary GET /api/dashboard/summary (utang
// T-35 item 5). DB test DEDICATED (Docker 5433) + suite serial → boleh
// kosongkan tabel transaksi di awal test:
//   payments, expenses, report_snapshots, login_attempts, audit_logs.
// JANGAN sentuh `members` — seed admin + semantik LAST_ADMIN file lain.
// Assert: saldo 0, totalMasukBulanIni 0, totalKeluarBulanIni 0,
// jumlahBelumBayar = count member AKTIF (semua belum bayar).
// Salt `q` per-file.
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

const uniq = String(Date.now()) + "q";
let adminId: string;
let m1Id: string;
const memberIds: string[] = [];

function getSummary(): Promise<Response> {
  return GET(new Request("http://localhost/api/dashboard/summary"));
}

beforeAll(async () => {
  ({ GET } = await import("@/app/api/dashboard/summary/route"));
  ({ prisma } = await import("@/lib/prisma"));
  ({ signSession } = await import("@/lib/auth"));

  // Kosongkan tabel transaksi — DIAMATKAN: tidak menyentuh members.
  await Promise.all([
    prisma.loginAttempt.deleteMany(),
    prisma.reportSnapshot.deleteMany(),
    prisma.payment.deleteMany(),
    prisma.expense.deleteMany(),
    prisma.auditLog.deleteMany(),
  ]);

  // Admin sesi (role DB ANGGOTA + token ADMIN) + 1 member aktif lain.
  const suffix = uniq.slice(-8);
  adminId = await prisma.member
    .create({ data: { nama: "Admin EmptyDB", noHp: `08${uniq.slice(-9)}9`, pinHash: "x", role: "ANGGOTA" } })
    .then((m) => m.id);
  m1Id = await prisma.member
    .create({ data: { nama: "M1 EmptyDB", noHp: `08${suffix}1`, pinHash: "x" } })
    .then((m) => m.id);
  memberIds.push(adminId, m1Id);

  cookieStore.set("session", {
    value: await signSession({ memberId: adminId, role: "ADMIN" }),
    options: {},
  });
});

afterAll(async () => {
  await prisma.loginAttempt.deleteMany({ where: { memberId: { in: memberIds } } });
  await prisma.member.deleteMany({ where: { id: { in: memberIds } } });
});

describe("Empty-DB summary", () => {
  it("tanpa transaksi → saldo 0, totalMasuk 0, totalKeluar 0, jumlahBelumBayar = count member aktif", async () => {
    const aktifBefore = await prisma.member.count({ where: { statusAktif: true } });
    expect(aktifBefore).toBeGreaterThanOrEqual(2); // seed admin + member test ini

    const res = await getSummary();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      saldo: number;
      totalMasukBulanIni: number;
      totalKeluarBulanIni: number;
      jumlahBelumBayar: number;
    };

    const aktifAfter = await prisma.member.count({ where: { statusAktif: true } });
    expect(aktifAfter).toBe(aktifBefore); // suite serial — tidak ada tulis di sela

    expect(body.saldo).toBe(0);
    expect(body.totalMasukBulanIni).toBe(0);
    expect(body.totalKeluarBulanIni).toBe(0);
    // Semua anggota aktif belum punya payment → utang = jumlah anggota aktif.
    expect(body.jumlahBelumBayar).toBe(aktifBefore);
  });
});
