// Integration test — RACE count/findMany jumlahBelumBayar (utang T-35 item 7).
// Route summary menghitung totalAktif (count) & sudahBayarBulanIni (findMany
// distinct) dalam Promise.all — snapshot read tanpa tx. Race antar-kedua query
// terjadi hanya saat ada tulis KONKUREN (payment POST). Seri deterministik:
//   - Test A: 2 payment POST konkuren selesai DULU → GET → assert EXACT
//     jumlahBelumBayar = aktif − 2 (semantik route: hanya member AKTIF yang
//     mengurangi utang — payment nonaktif tidak).
//   - Test B: 3 payment POST + 3 GET summary KONKUREN (Promise.all) →
//     jumlahBelumBayar HANYA boleh berada di rentang [aktif−5, aktif−2]
//     (monotone: totalAktif stabil, distinct sudahBayar tumbuh 0→3 selama
//     jendela — off-by-1 s.d. off-by-3 acceptable by design, komentar route).
//     Inilah properti yang DIJAMIN — bukan nilai internal query.
// Salt `r` per-file.
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
type PostHandler = (request: Request) => Promise<Response>;
let GET: GetHandler;
let paymentsPOST: PostHandler;
let prisma: typeof import("@/lib/prisma")["prisma"];
let signSession: typeof import("@/lib/auth")["signSession"];

// Bulan/tahun berjalan — route menghitung sendiri dari now() (UTC).
const now = new Date();
const tahun = now.getUTCFullYear();
const bulan = now.getUTCMonth() + 1;
const tanggalBayar = `${tahun}-${String(bulan).padStart(2, "0")}-05`;

const uniq = String(Date.now()) + "r";
let adminId: string;
let nonaktifId: string;
const payers = { m1: "", m2: "", m3: "", m4: "", m5: "" };
const memberIds: string[] = [];
const paymentIds: string[] = [];

function getSummary(): Promise<Response> {
  return GET(new Request("http://localhost/api/dashboard/summary"));
}

function postPayment(memberId: string): Promise<Response> {
  return paymentsPOST(
    new Request("http://localhost/api/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memberId, bulan, tahun, jumlah: 30000, tanggalBayar }),
    }),
  );
}

async function setSession(memberId: string, role: "ADMIN" | "ANGGOTA"): Promise<void> {
  cookieStore.set("session", { value: await signSession({ memberId, role }), options: {} });
}

beforeAll(async () => {
  ({ GET } = await import("@/app/api/dashboard/summary/route"));
  ({ POST: paymentsPOST } = await import("@/app/api/payments/route"));
  ({ prisma } = await import("@/lib/prisma"));
  ({ signSession } = await import("@/lib/auth"));

  // Admin sesi role DB = ANGGOTA + token ADMIN. 5 member AKTIF + 1 NONAKTIF.
  const suffix = uniq.slice(-8);
  const [a, n, p1, p2, p3, p4, p5] = await Promise.all([
    prisma.member.create({ data: { nama: "Admin RaceSum", noHp: `08${uniq.slice(-9)}9`, pinHash: "x", role: "ANGGOTA" } }),
    prisma.member.create({ data: { nama: "Nonaktif RaceSum", noHp: `08${suffix}0`, pinHash: "x", statusAktif: false } }),
    prisma.member.create({ data: { nama: "P1", noHp: `08${suffix}1`, pinHash: "x" } }),
    prisma.member.create({ data: { nama: "P2", noHp: `08${suffix}2`, pinHash: "x" } }),
    prisma.member.create({ data: { nama: "P3", noHp: `08${suffix}3`, pinHash: "x" } }),
    prisma.member.create({ data: { nama: "P4", noHp: `08${suffix}4`, pinHash: "x" } }),
    prisma.member.create({ data: { nama: "P5", noHp: `08${suffix}5`, pinHash: "x" } }),
  ]);
  adminId = a.id;
  nonaktifId = n.id;
  payers.m1 = p1.id;
  payers.m2 = p2.id;
  payers.m3 = p3.id;
  payers.m4 = p4.id;
  payers.m5 = p5.id;
  memberIds.push(adminId, nonaktifId, p1.id, p2.id, p3.id, p4.id, p5.id);

  await setSession(adminId, "ADMIN");
});

afterAll(async () => {
  await prisma.loginAttempt.deleteMany({ where: { memberId: { in: memberIds } } });
  await prisma.payment.deleteMany({ where: { memberId: { in: memberIds } } });
  await prisma.auditLog.deleteMany({ where: { actorId: adminId } });
  await prisma.member.deleteMany({ where: { id: { in: memberIds } } });
});

describe("Race count/findMany jumlahBelumBayar", () => {
  it("payment POST konkuren selesai → GET exact: jumlahBelumBayar turun 2 dari baseline", async () => {
    // Baseline BEFORE-assert (fix 2026-09-02): test DB shared dengan data
    // sisa E2E (member aktif + payment bulan berjalan dari run e2e) →
    // absolute "aktif − N" tidak deterministik. Properti yang DIJAMIN route:
    // jumlahBelumBayar turun tepat 2 setelah 2 pembayar AKTIF (m1, m2);
    // payment member NONAKTIF tidak mengurangi (semantik T-27/M1).
    const baseRes = await getSummary();
    expect(baseRes.status).toBe(200);
    const belum0 = ((await baseRes.json()) as { jumlahBelumBayar: number }).jumlahBelumBayar;

    // m1 & m2 bayar KONKUREN (Promise.all). Nonaktif juga bayar (rapel —
    // TIDAK mengurangi utang aktif).
    const [r1, r2, rNonaktif] = await Promise.all([
      postPayment(payers.m1),
      postPayment(payers.m2),
      postPayment(nonaktifId),
    ]);
    expect(r1.status).toBe(201);
    expect(r2.status).toBe(201);
    expect(rNonaktif.status).toBe(201); // member nonaktif BOLEH dicatat (rapel)
    paymentIds.push(
      (await r1.json()).id,
      (await r2.json()).id,
      (await rNonaktif.json()).id,
    );

    const res = await getSummary();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { jumlahBelumBayar: number };

    // Pembayar AKTIF bulan ini = m1, m2 (2) — nonaktif TIDAK dihitung.
    expect(body.jumlahBelumBayar).toBe(belum0 - 2);
  });

  it("jendela race: 3 POST konkuren + 3 GET summary bersamaan → jumlahBelumBayar di rentang monotone [S−3, S]", async () => {
    // Baseline settled setelah test A: S = jumlahBelumBayar saat ini.
    const settleRes = await getSummary();
    expect(settleRes.status).toBe(200);
    const S = ((await settleRes.json()) as { jumlahBelumBayar: number }).jumlahBelumBayar;

    // 3 POST + 3 GET dijalankan KONKUREN dalam satu Promise.all — jendela
    // race nyata antara tulis payment & dua query summary (count vs findMany).
    const [getResults, postResults] = await Promise.all([
      Promise.all([getSummary(), getSummary(), getSummary()]),
      Promise.all([postPayment(payers.m3), postPayment(payers.m4), postPayment(payers.m5)]),
    ]);
    for (const r of postResults) {
      expect(r.status).toBe(201); // semua harus sukses — member/perioda beda
      paymentIds.push((await r.json()).id);
    }

    // totalAktif STABIL selama jendela (tidak ada tulis member) → utang hanya
    // bisa turun dari S ke (S−3) seiring distinct sudahBayar tumbuh 0→3.
    // Nilai di luar rentang = bug (count/findMany tidak konsisten).
    for (const r of getResults) {
      expect(r.status).toBe(200);
      const body = (await r.json()) as { jumlahBelumBayar: number };
      expect(Number.isInteger(body.jumlahBelumBayar)).toBe(true);
      expect(body.jumlahBelumBayar).toBeLessThanOrEqual(S);
      expect(body.jumlahBelumBayar).toBeGreaterThanOrEqual(S - 3);
    }
  });
});
