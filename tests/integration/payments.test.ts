// Integration test — GET & POST /api/payments (T-20) — endpoint PALING
// KRITIS (uang + constraint unique [memberId, bulan, tahun]).
// Pattern sama tests/integration/members.test.ts: env .env.local dimuat
// manual; beforeAll + dynamic import (tsconfig target es5, no top-level
// await); next/headers cookies() di-mock — handler butuh session cookie
// untuk actorId & role (middleware TIDAK terlibat saat handler dipanggil
// langsung; RBAC method-level sudah terverifikasi terpisah — di sini yang
// diuji adalah RBAC data-level GET ANGGOTA).
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

type GetHandler = (request: Request) => Promise<Response>;
type PostHandler = (request: Request) => Promise<Response>;
let GET: GetHandler;
let POST: PostHandler;
let prisma: typeof import("@/lib/prisma")["prisma"];
let signSession: typeof import("@/lib/auth")["signSession"];

// Suffiks file-unik: digit `8` (payments) — beda dari file test lain
// (members `...6`, patch `...7`, deactivate `...1..5`), hindari tabrakan
// noHp saat worker paralel. Salt `b` per-file: Date.now() identik antar
// file tidak masalah — slice manapun memuat salt → noHp beda.
const uniq = String(Date.now()) + "b";
let adminId: string;
let memberAId: string;
let memberBId: string;
let anggotaAId: string;
let firstPaymentId = "";
const allMemberIds: string[] = [];
const paymentIds: string[] = [];

function getPayments(query = ""): Promise<Response> {
  return GET(new Request(`http://localhost/api/payments${query}`));
}

function postPayment(body: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost/api/payments", {
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

beforeAll(async () => {
  ({ GET, POST } = await import("@/app/api/payments/route"));
  ({ prisma } = await import("@/lib/prisma"));
  ({ signSession } = await import("@/lib/auth"));

  // Admin = actor audit + session awal. Dua member + satu ANGGOTA untuk
  // uji RBAC data-level GET.
  adminId = await prisma.member
    .create({ data: { nama: "Admin Test", noHp: `08${uniq.slice(-9)}8`, pinHash: "x", role: "ADMIN" } })
    .then((m) => m.id);
  memberAId = await prisma.member
    .create({ data: { nama: "Budi", noHp: `08${uniq}1`, pinHash: "x" } })
    .then((m) => m.id);
  memberBId = await prisma.member
    .create({ data: { nama: "Siti", noHp: `08${uniq}2`, pinHash: "x" } })
    .then((m) => m.id);
  anggotaAId = await prisma.member
    .create({ data: { nama: "Anggota A", noHp: `08${uniq}3`, pinHash: "x", role: "ANGGOTA" } })
    .then((m) => m.id);
  allMemberIds.push(adminId, memberAId, memberBId, anggotaAId);

  await setSession(adminId, "ADMIN");
});

afterAll(async () => {
  // Urut hapus (FK): payments (member Restrict) → audit_logs (actor
  // Restrict) → members.
  await prisma.payment.deleteMany({ where: { memberId: { in: allMemberIds } } });
  await prisma.auditLog.deleteMany({
    where: { OR: [{ actorId: adminId }, { entityId: { in: paymentIds } }] },
  });
  await prisma.member.deleteMany({ where: { id: { in: allMemberIds } } });
});

describe("POST /api/payments", () => {
  it("sukses → 201, record tersimpan, audit CREATE Payment (actor & entityId benar)", async () => {
    const res = await postPayment({
      memberId: memberAId,
      bulan: 1,
      tahun: 2026,
      jumlah: 30000,
      tanggalBayar: "2026-01-05",
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({
      memberId: memberAId,
      memberNama: "Budi", // denormalized
      bulan: 1,
      tahun: 2026,
      jumlah: 30000,
    });
    expect(typeof body.id).toBe("string");
    expect(typeof body.tanggalBayar).toBe("string");
    expect(typeof body.createdAt).toBe("string");
    firstPaymentId = body.id;
    paymentIds.push(firstPaymentId);

    const rec = await prisma.payment.findUnique({ where: { id: firstPaymentId } });
    expect(rec).not.toBeNull();
    expect(rec?.jumlah).toBe(30000);

    // Audit transpose-safe: actorId = admin sesi DAN entityId = payment baru.
    const row = await prisma.auditLog.findFirst({
      where: { actorId: adminId, entityType: "Payment", entityId: firstPaymentId },
    });
    expect(row).not.toBeNull();
    expect(row?.actorId).toBe(adminId);
    expect(row?.entityId).toBe(firstPaymentId);
    expect(row?.aksi).toBe("CREATE");
    expect(row?.dataLama).toBeNull();
    expect(row?.dataBaru).toMatchObject({ jumlah: 30000, bulan: 1, tahun: 2026 });
  });

  it("duplikat [memberId, bulan, tahun] → 409 ALREADY_PAID EXACT kontrak", async () => {
    const res = await postPayment({
      memberId: memberAId,
      bulan: 1,
      tahun: 2026,
      jumlah: 30000,
      tanggalBayar: "2026-01-06", // tanggal beda, bulan/tahun sama → tetap duplikat
    });
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: "ALREADY_PAID",
      message: "Sudah lunas bulan ini",
      existingPaymentId: firstPaymentId,
    });
  });

  it("jumlah 0/negatif, bulan 13 → 400; memberId tidak ada → 404", async () => {
    const base = { memberId: memberAId, bulan: 3, tahun: 2026, tanggalBayar: "2026-03-01" };

    const resJumlah0 = await postPayment({ ...base, jumlah: 0 });
    expect(resJumlah0.status).toBe(400);
    await expect(resJumlah0.json()).resolves.toMatchObject({ error: "INVALID_INPUT" });

    const resJumlahNeg = await postPayment({ ...base, jumlah: -5000 });
    expect(resJumlahNeg.status).toBe(400);
    await expect(resJumlahNeg.json()).resolves.toMatchObject({ error: "INVALID_INPUT" });

    const resBulan13 = await postPayment({ ...base, bulan: 13, jumlah: 30000 });
    expect(resBulan13.status).toBe(400);
    await expect(resBulan13.json()).resolves.toMatchObject({ error: "INVALID_INPUT" });

    const resNotFound = await postPayment({
      memberId: "tidak-ada-member",
      bulan: 3,
      tahun: 2026,
      jumlah: 30000,
      tanggalBayar: "2026-03-01",
    });
    expect(resNotFound.status).toBe(404);
    await expect(resNotFound.json()).resolves.toMatchObject({ error: "MEMBER_NOT_FOUND" });
  });
});

describe("GET /api/payments", () => {
  let p2Id = "";

  it("tanpa filter (ADMIN) → semua payment, DTO lengkap dengan memberNama", async () => {
    const res = await getPayments();
    expect(res.status).toBe(200);
    const list = await res.json();

    const p1 = list.find((p: { id: string }) => p.id === firstPaymentId);
    expect(p1).toMatchObject({
      id: firstPaymentId,
      memberId: memberAId,
      memberNama: "Budi",
      bulan: 1,
      tahun: 2026,
      jumlah: 30000,
    });
    expect(typeof p1.tanggalBayar).toBe("string");
    expect(typeof p1.createdAt).toBe("string");
  });

  it("filter bulan+tahun → subset benar", async () => {
    const p2 = await prisma.payment.create({
      data: {
        memberId: memberBId,
        bulan: 2,
        tahun: 2026,
        jumlah: 50000, // rapel/sumbangan — nominal bebas, asal > 0
        tanggalBayar: new Date("2026-02-03"),
      },
    });
    paymentIds.push(p2.id);
    p2Id = p2.id;

    const res1 = await getPayments("?bulan=1&tahun=2026");
    expect(res1.status).toBe(200);
    const list1 = await res1.json();
    expect(list1.some((p: { id: string }) => p.id === firstPaymentId)).toBe(true);
    expect(list1.some((p: { id: string }) => p.id === p2.id)).toBe(false);

    const res2 = await getPayments("?bulan=2&tahun=2026");
    expect(res2.status).toBe(200);
    const list2 = await res2.json();
    expect(list2.some((p: { id: string }) => p.id === p2.id)).toBe(true);
    expect(list2.some((p: { id: string }) => p.id === firstPaymentId)).toBe(false);
  });

  it("RBAC data-level: GET sebagai ANGGOTA → hanya payment miliknya (clamp memberId)", async () => {
    const p3 = await prisma.payment.create({
      data: {
        memberId: anggotaAId,
        bulan: 3,
        tahun: 2026,
        jumlah: 30000,
        tanggalBayar: new Date("2026-03-02"),
      },
    });
    paymentIds.push(p3.id);

    await setSession(anggotaAId, "ANGGOTA");

    // Tanpa filter memberId → tetap hanya payment miliknya sendiri
    const res = await getPayments();
    expect(res.status).toBe(200);
    const list = await res.json();
    expect(list.some((p: { id: string }) => p.id === p3.id)).toBe(true);
    expect(list.some((p: { id: string }) => p.id === firstPaymentId)).toBe(false);
    expect(list.some((p: { id: string }) => p.id === p2Id)).toBe(false);

    // Filter memberId orang lain di-clamp → tetap hanya punya sendiri
    const resClamped = await getPayments(`?memberId=${memberAId}`);
    expect(resClamped.status).toBe(200);
    const listClamped = await resClamped.json();
    expect(listClamped.some((p: { id: string }) => p.id === p3.id)).toBe(true);
    expect(listClamped.some((p: { id: string }) => p.id === firstPaymentId)).toBe(false);

    await setSession(adminId, "ADMIN");
  });

  it("query invalid → 400", async () => {
    for (const q of ["?bulan=13", "?bulan=0", "?bulan=abc", "?tahun=26", "?tahun=20261"]) {
      const res = await getPayments(q);
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toMatchObject({ error: "INVALID_INPUT" });
    }
  });
});

// m3 oracle review (ride-along T-21) — 3 test tambahan dari review T-20:
// pin kontrak date-only, filter memberId ADMIN, dan keputusan rapel/historis.
// noHp digit 0 (`08${uniq}0`): full-uniq suffix 1-9 sudah dipakai file lain
// (members-patch 7/8/9, deactivate 1-4, members 3-6) — 0 bebas dari tabrakan.
describe("m3 oracle review (T-21)", () => {
  it("POST tanggalBayar full datetime → 400 (pin kontrak date-only)", async () => {
    const res = await postPayment({
      memberId: memberBId,
      bulan: 4,
      tahun: 2026,
      jumlah: 30000,
      tanggalBayar: "2026-01-05T10:00:00Z",
    });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "INVALID_INPUT" });
  });

  it("POST tanggalBayar rollover kalender 2026-02-30 → 400 (backport fix oracle T-24)", async () => {
    // Date.parse("2026-02-30") TIDAK NaN di V8 (silent rollover) — roundtrip
    // check di payments route wajib menolak (backport dari expenses T-24).
    const res = await postPayment({
      memberId: memberBId,
      bulan: 6,
      tahun: 2026,
      jumlah: 30000,
      tanggalBayar: "2026-02-30",
    });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "INVALID_INPUT" });
  });

  it("ADMIN GET ?memberId=X → hanya payment member X", async () => {
    const res = await getPayments(`?memberId=${memberAId}`);
    expect(res.status).toBe(200);
    const list = await res.json();
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((p: { memberId: string }) => p.memberId === memberAId)).toBe(true);
  });

  it("POST untuk member statusAktif=false → 201 (rapel/historis)", async () => {
    const nonaktif = await prisma.member.create({
      data: { nama: "Nonaktif Histori", noHp: `08${uniq}0`, pinHash: "x", statusAktif: false },
    });
    allMemberIds.push(nonaktif.id);

    const res = await postPayment({
      memberId: nonaktif.id,
      bulan: 5,
      tahun: 2026,
      jumlah: 30000,
      tanggalBayar: "2026-05-10",
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.memberId).toBe(nonaktif.id);
    paymentIds.push(body.id);
  });
});
