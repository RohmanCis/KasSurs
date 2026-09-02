// Integration test — RACE P2002 POST /api/payments (utang T-35 item 1).
// Dua POST konkuren (memberId+bulan+tahun SAMA) → constraint unique DB
// [memberId, bulan, tahun] memastikan tepat SATU 201 + SATU 409
// ALREADY_PAID — deterministik, bukan dua 201 / dua 409 / 500. Ini menguji
// jalur catch P2002 di route (re-query → existingPaymentId) yang sebelumnya
// hanya dianalisis (known-untested di HANDOFF).
// DB test terisolasi (Docker 5433) + suite serial → hasil deterministik.
// Salt `m` per-file (lanjutan skema a–l).
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

const uniq = String(Date.now()) + "m";
let adminId: string;
let targetId: string;
const memberIds: string[] = [];
const paymentIds: string[] = [];

function postPayment(body: unknown): Promise<Response> {
  return POST(
    new Request("http://localhost/api/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

beforeAll(async () => {
  ({ POST } = await import("@/app/api/payments/route"));
  ({ prisma } = await import("@/lib/prisma"));
  ({ signSession } = await import("@/lib/auth"));

  // Admin sesi role DB = ANGGOTA + token claim ADMIN (pola dashboard/reports
  // — tak mengganggu hitungan LAST_ADMIN file lain).
  adminId = await prisma.member
    .create({ data: { nama: "Admin RacePay", noHp: `08${uniq.slice(-9)}9`, pinHash: "x", role: "ANGGOTA" } })
    .then((m) => m.id);
  targetId = await prisma.member
    .create({ data: { nama: "Target RacePay", noHp: `08${uniq.slice(-8)}1`, pinHash: "x" } })
    .then((m) => m.id);
  memberIds.push(adminId, targetId);

  cookieStore.set("session", {
    value: await signSession({ memberId: adminId, role: "ADMIN" }),
    options: {},
  });
});

afterAll(async () => {
  // Urut hapus (FK): loginAttempt → payment (member Restrict) → auditLog
  // (actor Restrict) → member.
  await prisma.loginAttempt.deleteMany({ where: { memberId: { in: memberIds } } });
  await prisma.payment.deleteMany({ where: { memberId: { in: memberIds } } });
  await prisma.auditLog.deleteMany({ where: { actorId: adminId } });
  await prisma.member.deleteMany({ where: { id: { in: memberIds } } });
});

describe("P2002 race POST /api/payments", () => {
  it("dua POST konkuren (periode sama) → tepat 1×201 + 1×409 ALREADY_PAID; existingPaymentId = id pemenang; 1 baris payment di DB", async () => {
    // Periode 2097-07 (masa depan jauh) — target member fresh → pasti race
    // murni (bukan konflik dgn data file lain).
    const body = {
      memberId: targetId,
      bulan: 7,
      tahun: 2097,
      jumlah: 30000,
      tanggalBayar: "2097-07-10",
    };

    const [a, b] = await Promise.all([postPayment(body), postPayment(body)]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);

    const winner = a.status === 201 ? a : b;
    const loser = a.status === 201 ? b : a;
    const winnerBody = await winner.json();
    const loserBody = await loser.json();

    expect(typeof winnerBody.id).toBe("string");
    // Kontrak EXACT PaymentConflictResponse — pesan literal.
    expect(loserBody).toEqual({
      error: "ALREADY_PAID",
      message: "Sudah lunas bulan ini",
      existingPaymentId: winnerBody.id,
    });
    paymentIds.push(winnerBody.id);

    // Unik di DB: tepat 1 baris untuk member+periode ini (bukan 0 / 2).
    const count = await prisma.payment.count({
      where: { memberId: targetId, bulan: 7, tahun: 2097 },
    });
    expect(count).toBe(1);
  });
});
