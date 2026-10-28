// =====================================================================
// Integration test — POST /api/reports/regenerate (L-01) — FR-23 (koreksi
// snapshot beku) + FR-21 (audit log regenerate).
//
// Yang dibuktikan:
//   - 401 tanpa cookie, 403 token ANGGOTA (middleware, sebelum handler),
//     400 body invalid (bulan di luar rentang, field asing, JSON rusak),
//   - periode TANPA snapshot → 200 + baris snapshot terbuat + 1 audit row
//     (dataLama = dibuatPada null: belum ada versi sebelumnya),
//   - regenerate KEDUA setelah data berubah → payload tersimpan berubah,
//     TETAP 1 baris (count===1), createdById TIDAK pindah ke actor kedua
//     (update payload-only), audit bertambah dengan entityId snapshot yang
//     SAMA & dataLama = dibuatPada versi lama,
//   - dua POST PARALEL periode baru → dua-duanya 200, 1 baris snapshot,
//     kedua respons IDENTIK & payload tersimpan == respons itu (bukti
//     freshness gate; tanpa gate keduanya menghitung ulang → dibuatPada
//     beda & 2 audit row — celah C3),
//   - 409 REGENERATE_BUSY saat advisory lock periode ditahan transaksi lain
//     (tx regenerate lewat batas timeout 20s) + rollback bersih (tanpa
//     snapshot/audit tertinggal),
//   - body kosong / {} → periode default bulan berjalan WIB (bukan UTC).
//
// Pattern sama tests/integration/reports.test.ts: .env.local dimuat manual,
// beforeAll + dynamic import (target es5, tanpa top-level await),
// next/headers cookies() di-mock, middleware() dipanggil langsung utk RBAC
// (ANGGOTA → 403 sebelum handler).
// PERIODE TEST: 2094-03 & 2094-04 (jauh di masa depan → tidak disentuh file
// test lain; data periode ini deterministik). Salt `u` per-file (AGENTS.md #9).
// =====================================================================
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import type { ReportRegenerateResponse, ReportSnapshotPayload } from "@/lib/types";

// Pooler/lokal Postgres ±0,5s per query; regenerate = tx 7 query + upsert +
// audit → beri ruang (pola reports.test.ts).
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

type PostHandler = (request: Request) => Promise<Response>;
let regeneratePOST: PostHandler;
let prisma: typeof import("@/lib/prisma")["prisma"];
let signSession: typeof import("@/lib/auth")["signSession"];
let middleware: typeof import("@/middleware")["middleware"];

// P1 = periode uji sekuensial (mulai TANPA snapshot), P2 = periode uji paralel.
const P1 = { bulan: 3, tahun: 2094 };
const P2 = { bulan: 4, tahun: 2094 };

const uniq = String(Date.now()) + "u";
let actorPertamaId: string; // actor regenerate #1 → createdById snapshot P1
let actorKeduaId: string; // actor regenerate #2 → membuktikan createdById tidak berpindah
let payer1Id: string;
let payer2Id: string;
const memberIds: string[] = [];
// Snapshot periode berjalan WIB yang terbuat oleh test body-kosong.
let wibPeriode: { bulan: number; tahun: number } | null = null;

function regenerateUrl(body?: unknown): Request {
  return new Request("http://localhost/api/reports/regenerate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// Body mentah (JSON rusak) — lewat JSON.stringify tidak bisa.
function regenerateRaw(raw: string): Request {
  return new Request("http://localhost/api/reports/regenerate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw,
  });
}

async function setSession(memberId: string, role: "ADMIN" | "ANGGOTA"): Promise<void> {
  cookieStore.set("session", { value: await signSession({ memberId, role }), options: {} });
}

async function middlewareCall(path: string, opts?: { method?: string; token?: string }) {
  const req = new NextRequest(`http://localhost${path}`, { method: opts?.method ?? "GET" });
  if (opts?.token) req.cookies.set("session", opts.token);
  return middleware(req);
}

// Delay nyata (bukan fake timer): yang ditunggu adalah wall-clock DB —
// advisory lock + batas timeout transaksi di server Postgres; vi.useFakeTimers
// tidak bisa memajukan clock proses DB. Dipakai hanya di uji 409.
function sleep(ms: number): Promise<void> {
  const { promise, resolve } = Promise.withResolvers<void>();
  setTimeout(resolve, ms);
  return promise;
}

async function readStoredRow(periode: { bulan: number; tahun: number }) {
  const row = await prisma.reportSnapshot.findUnique({ where: { bulan_tahun: periode } });
  expect(row, `snapshot ${periode.bulan}/${periode.tahun} harus ada`).not.toBeNull();
  return row!;
}

// entityType dijadikan filter sekaligus assert: nilai salah → 0 row → gagal.
function auditRows(entityId: string) {
  return prisma.auditLog.findMany({
    where: { entityType: "ReportSnapshot", entityId },
    orderBy: { timestamp: "asc" },
  });
}

beforeAll(async () => {
  ({ POST: regeneratePOST } = await import("@/app/api/reports/regenerate/route"));
  ({ prisma } = await import("@/lib/prisma"));
  ({ signSession } = await import("@/lib/auth"));
  ({ middleware } = await import("@/middleware"));

  // Sisa run sebelumnya (crash) → pastikan P1 & P2 benar-benar BARU.
  await prisma.reportSnapshot.deleteMany({ where: { tahun: { in: [P1.tahun, P2.tahun] } } });

  const suffix = uniq.slice(-8);
  const [a1, a2, p1, p2] = await Promise.all([
    prisma.member.create({ data: { nama: "AdminRegenU", noHp: `08${uniq.slice(-9)}1`, pinHash: "x", role: "ANGGOTA" } }),
    prisma.member.create({ data: { nama: "AdminRegenU2", noHp: `08${uniq.slice(-9)}2`, pinHash: "x", role: "ANGGOTA" } }),
    prisma.member.create({ data: { nama: `PayerU1 ${suffix}`, noHp: `08${suffix}1`, pinHash: "x" } }),
    prisma.member.create({ data: { nama: `PayerU2 ${suffix}`, noHp: `08${suffix}2`, pinHash: "x" } }),
  ]);
  actorPertamaId = a1.id;
  actorKeduaId = a2.id;
  payer1Id = p1.id;
  payer2Id = p2.id;
  memberIds.push(actorPertamaId, actorKeduaId, payer1Id, payer2Id);

  // Data awal P1: 1 payment (payer1). Payment kedua (payer2) di-insert di
  // TENGAH test → pembuktian regenerate benar-benar menghitung ulang.
  // P2: 1 payment tetap (hanya utk payload non-trivial pada uji paralel).
  await Promise.all([
    prisma.payment.create({
      data: {
        memberId: payer1Id,
        bulan: P1.bulan,
        tahun: P1.tahun,
        jumlah: 30000,
        tanggalBayar: new Date(Date.UTC(P1.tahun, P1.bulan - 1, 5)),
      },
    }),
    prisma.payment.create({
      data: {
        memberId: payer1Id,
        bulan: P2.bulan,
        tahun: P2.tahun,
        jumlah: 20000,
        tanggalBayar: new Date(Date.UTC(P2.tahun, P2.bulan - 1, 5)),
      },
    }),
  ]);

  await setSession(actorPertamaId, "ADMIN");
});

afterAll(async () => {
  // Urut hapus (FK): auditLog (actor & entityId ReportSnapshot → Restrict) →
  // reportSnapshot (createdBy Restrict) → payment (member Restrict) → member.
  await prisma.loginAttempt.deleteMany({ where: { memberId: { in: memberIds } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: [actorPertamaId, actorKeduaId] } } });
  await prisma.reportSnapshot.deleteMany({ where: { bulan: P1.bulan, tahun: P1.tahun } });
  await prisma.reportSnapshot.deleteMany({ where: { bulan: P2.bulan, tahun: P2.tahun } });
  // P3 (uji 409): transaksi gagal → row tidak ada, tapi bersihkan defensif.
  await prisma.reportSnapshot.deleteMany({ where: { bulan: 5, tahun: 2094 } });
  if (wibPeriode) {
    // Snapshot periode berjalan yang dibuat test body-kosong — jangan
    // diwariskan ke run/spec berikutnya (flaky lintas-run).
    await prisma.reportSnapshot.deleteMany({ where: { bulan: wibPeriode.bulan, tahun: wibPeriode.tahun } });
  }
  await prisma.payment.deleteMany({ where: { memberId: { in: memberIds } } });
  await prisma.member.deleteMany({ where: { id: { in: memberIds } } });
});

describe("POST /api/reports/regenerate", () => {
  it("tanpa cookie → 401 (fallback handler)", async () => {
    cookieStore.delete("session");
    const res = await regeneratePOST(regenerateUrl(P1));
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ error: "UNAUTHORIZED" });
    await setSession(actorPertamaId, "ADMIN");
  });

  it("middleware: token ANGGOTA → 403 (sebelum handler, prefix /api/reports)", async () => {
    const token = await signSession({ memberId: payer1Id, role: "ANGGOTA" });
    const res = await middlewareCall("/api/reports/regenerate", { method: "POST", token });
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toMatchObject({ error: "FORBIDDEN" });
  });

  it("body invalid → 400 INVALID_INPUT (rentang, field asing, JSON rusak)", async () => {
    for (const req of [
      regenerateUrl({ bulan: 13, tahun: P1.tahun }),
      regenerateUrl({ bulan: P1.bulan, tahun: 999 }),
      regenerateUrl({ bulan: "3", tahun: P1.tahun }), // angka wajib, bukan string
      regenerateUrl({ bualn: P1.bulan }), // field asing → strict
      regenerateRaw("{ bukan json"),
    ]) {
      const res = await regeneratePOST(req);
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toMatchObject({ error: "INVALID_INPUT" });
    }
    // Tidak ada efek samping: periode invalid tidak pernah menyentuh DB.
    expect(await prisma.reportSnapshot.count({ where: { bulan: 13 } })).toBe(0);
  });

  it("periode TANPA snapshot → 200 + snapshot terbuat + audit row (dataLama null)", async () => {
    const res = await regeneratePOST(regenerateUrl(P1));
    expect(res.status).toBe(200);
    const body = (await res.json()) as ReportRegenerateResponse;
    expect(body.periode).toEqual(P1);
    expect(body.ringkasan.totalMasuk).toBe(30000); // payer1 saja
    expect(body.dibuatPada).toBeTypeOf("string");

    const row = await readStoredRow(P1);
    expect(row.createdById).toBe(actorPertamaId);
    expect(body.ringkasan).toEqual((row.payload as unknown as ReportSnapshotPayload).ringkasan);
    expect(body.dibuatPada).toBe((row.payload as unknown as ReportSnapshotPayload).dibuatPada);

    const audit = await auditRows(row.id);
    expect(audit).toHaveLength(1);
    expect(audit[0].aksi).toBe("UPDATE");
    expect(audit[0].entityType).toBe("ReportSnapshot");
    expect(audit[0].actorId).toBe(actorPertamaId);
    // Snapshot belum pernah ada → tidak ada versi lama.
    expect(audit[0].dataLama).toEqual({ dibuatPada: null });
    expect(audit[0].dataBaru).toEqual({ dibuatPada: body.dibuatPada, ringkasan: body.ringkasan });
  });

  it("regenerate kedua setelah data berubah → payload berubah, count===1, createdById tetap, audit bertambah", async () => {
    const sebelum = await readStoredRow(P1);
    const dibuatPadaLama = (sebelum.payload as unknown as ReportSnapshotPayload).dibuatPada;

    // Payment baru periode P1 SETELAH regenerate pertama.
    await prisma.payment.create({
      data: {
        memberId: payer2Id,
        bulan: P1.bulan,
        tahun: P1.tahun,
        jumlah: 45000,
        tanggalBayar: new Date(Date.UTC(P1.tahun, P1.bulan - 1, 9)),
      },
    });

    // Actor BERBEDA: kalau jalur regenerate salah create, createdById pindah.
    await setSession(actorKeduaId, "ADMIN");
    const res = await regeneratePOST(regenerateUrl(P1));
    expect(res.status).toBe(200);
    const body = (await res.json()) as ReportRegenerateResponse;

    const sesudah = await readStoredRow(P1);
    expect(sesudah.id).toBe(sebelum.id); // upsert, bukan baris baru
    expect(sesudah.createdById).toBe(actorPertamaId); // tetap creator pertama
    expect(body.ringkasan.totalMasuk).toBe(75000); // 30000 + 45000
    expect(body.ringkasan).toEqual((sesudah.payload as unknown as ReportSnapshotPayload).ringkasan);
    expect(body.dibuatPada).not.toBe(dibuatPadaLama); // payload memang dihitung ulang
    expect((sesudah.payload as unknown as ReportSnapshotPayload).detailMasuk).toHaveLength(2);

    // Tetap SATU baris per periode (unique [bulan, tahun]).
    expect(await prisma.reportSnapshot.count({ where: { bulan: P1.bulan, tahun: P1.tahun } })).toBe(1);

    const audit = await auditRows(sesudah.id);
    expect(audit).toHaveLength(2);
    expect(audit[1].aksi).toBe("UPDATE");
    expect(audit[1].actorId).toBe(actorKeduaId); // actor regenerate ke-2
    expect(audit[1].dataLama).toEqual({ dibuatPada: dibuatPadaLama });
    expect(audit[1].dataBaru).toEqual({ dibuatPada: body.dibuatPada, ringkasan: body.ringkasan });
    // entityId audit = snapshot yang sama (menimpa, bukan membuat entitas baru).
    expect(audit.every((r) => r.entityId === sesudah.id)).toBe(true);
  });

  it("dua POST paralel periode BARU → 200+200, count===1, respons identik, payload tersimpan == respons (freshness gate)", async () => {
    const [ra, rb] = await Promise.all([
      regeneratePOST(regenerateUrl(P2)),
      regeneratePOST(regenerateUrl(P2)),
    ]);
    expect(ra.status).toBe(200);
    expect(rb.status).toBe(200);
    const [bodyA, bodyB] = [
      (await ra.json()) as ReportRegenerateResponse,
      (await rb.json()) as ReportRegenerateResponse,
    ];

    expect(await prisma.reportSnapshot.count({ where: { bulan: P2.bulan, tahun: P2.tahun } })).toBe(1);
    const row = await readStoredRow(P2);
    const stored = row.payload as unknown as ReportSnapshotPayload;

    // Freshness gate: penulis kedua menemukan payload penulis pertama
    // (dibuatPada ≥ requestStart-nya) → TIDAK menghitung ulang → kedua
    // respons identik dan sama dengan payload tersimpan. Tanpa gate:
    // dibuatPada masing-masing berbeda (milidetik) → assert ini gagal.
    expect(bodyA).toEqual(bodyB);
    expect(stored.dibuatPada).toBe(bodyB.dibuatPada);
    expect(stored.ringkasan).toEqual(bodyB.ringkasan);
    expect(bodyB.periode).toEqual(P2);
    // Hanya satu penulis yang benar-benar menghitung → satu audit row.
    expect(await auditRows(row.id)).toHaveLength(1);
    await setSession(actorPertamaId, "ADMIN");
  });

  it("lock periode ditahan transaksi lain → 409 REGENERATE_BUSY (bukan menimpa/gagal senyap)", async () => {
    // Jalur gagal P2028: transaksi regenerate tidak selesai dalam batas
    // timeout (20s, report-snapshot.ts) karena advisory lock periode dipegang
    // transaksi lain → route memetakan ke 409. Test ini MEMANG menunggu
    // ±20-25s (batas waktu transaksi), bukan hang.
    const P3 = { bulan: 5, tahun: 2094 };
    const lockKey = P3.bulan * 100000 + P3.tahun;
    const HOLD_MS = 22_000;

    const holder = prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;
        await sleep(HOLD_MS);
      },
      { maxWait: 5_000, timeout: 30_000 },
    );

    // Pastikan lock benar-benar sudah dipegang sebelum POST (probe = tx lain
    // yang mencoba lock yang sama; kalau pool habis / probe gagal ambil
    // koneksi, holder justru memegang koneksi itu → lock pasti sudah dipegang).
    let held = false;
    for (let i = 0; i < 40 && !held; i++) {
      held = await prisma
        .$transaction(async (tx) => {
          const rows = await tx.$queryRaw<{ ok: boolean }[]>`
            SELECT pg_try_advisory_xact_lock(${lockKey}) AS ok
          `;
          return rows[0]?.ok === false; // false = sudah dipegang holder
        })
        .catch(() => true);
      if (!held) await sleep(100);
    }
    expect(held).toBe(true);

    const res = await regeneratePOST(regenerateUrl(P3));
    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toMatchObject({
      error: "REGENERATE_BUSY",
      message: "Laporan sedang dihitung ulang. Tunggu sebentar, lalu coba lagi.",
    });

    await holder; // jangan tinggalkan transaksi menggantung
    // Transaksi gagal → rollback: tidak ada snapshot/audit yang tertinggal.
    expect(await prisma.reportSnapshot.count({ where: { bulan: P3.bulan, tahun: P3.tahun } })).toBe(0);
  });

  it("body kosong / {} → 200 + periode default bulan berjalan WIB (bukan UTC)", async () => {
    const tanpaBody = await regeneratePOST(regenerateUrl());
    expect(tanpaBody.status).toBe(200);
    const bodyA = (await tanpaBody.json()) as ReportRegenerateResponse;

    const nowWib = new Date(Date.now() + 7 * 60 * 60 * 1000); // WIB = UTC+7 tetap
    const expected = { bulan: nowWib.getUTCMonth() + 1, tahun: nowWib.getUTCFullYear() };
    expect(bodyA.periode).toEqual(expected);
    wibPeriode = bodyA.periode;

    const row = await readStoredRow(bodyA.periode);
    expect(row.createdById).toBe(actorPertamaId);

    // Body "{}" eksplisit → periode default yang sama.
    const denganBody = await regeneratePOST(regenerateUrl({}));
    expect(denganBody.status).toBe(200);
    expect(((await denganBody.json()) as ReportRegenerateResponse).periode).toEqual(expected);
  });
});
