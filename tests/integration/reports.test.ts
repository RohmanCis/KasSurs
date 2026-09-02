// Integration test — GET /api/reports/pdf & /api/reports/excel (T-33) —
// FR-15/FR-16/FR-17/FR-23 (snapshot laporan beku).
// Pattern sama tests/integration/dashboard.test.ts: env .env.local dimuat
// manual; beforeAll + dynamic import (tsconfig target es5, no top-level
// await); next/headers cookies() di-mock; middleware() call langsung utk
// RBAC (ANGGOTA → 403 sebelum handler).
//
// PERIODE TEST = 2099-12 (bulan/tahun jauh di masa depan): file test lain
// hanya menulis bulan/tahun berjalan → data periode test ini deterministik
// (tidak ada intervensi paralel). Snapshot dibaca LANGSUNG dari tabel
// report_snapshots (bukan dari response) utk assert FR-23 paling kuat:
// payload beku tidak berubah walau ada Payment baru setelah export pertama.
//
// "Admin sesi" = role DB ANGGOTA + token claim ADMIN (verifySession murni
// JWT, tanpa cek DB) — mencegah intervensi silang hitungan LAST_ADMIN
// (gotcha AGENTS.md #14). Salt `k` per-file (skema a–i, lanjutan).
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import type { ReportSnapshotPayload } from "@/lib/types";

// Supabase pooler ~500ms/query — route ±7 query, hook create berjajar →
// over default testTimeout (pola dashboard.test.ts).
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
let pdfGET: GetHandler;
let excelGET: GetHandler;
let prisma: typeof import("@/lib/prisma")["prisma"];
let signSession: typeof import("@/lib/auth")["signSession"];
let middleware: typeof import("@/middleware")["middleware"];

// Periode export test: Desember 2099 — tidak disentuh file test lain.
const T_BULAN = 12;
const T_TAHUN = 2099;

const uniq = String(Date.now()) + "k";
let adminId: string;
let m1Id: string;
let m2Id: string;
let m3Id: string; // NONAKTIF dengan payment periode test (M1: tidak boleh mengurangi jumlahBelumBayar)
const memberIds: string[] = [];
const expenseIds: string[] = [];
const categoryIds: string[] = [];
// Payload beku hasil export pertama — dipakai assert FR-23 (tidak berubah).
let frozenPayload: ReportSnapshotPayload | null = null;

async function setSession(memberId: string, role: "ADMIN" | "ANGGOTA"): Promise<void> {
  cookieStore.set("session", { value: await signSession({ memberId, role }), options: {} });
}

function pdfUrl(params: string): Request {
  return new Request(`http://localhost/api/reports/pdf?${params}`);
}
function excelUrl(params: string): Request {
  return new Request(`http://localhost/api/reports/excel?${params}`);
}

async function readSnapshot(): Promise<ReportSnapshotPayload> {
  const row = await prisma.reportSnapshot.findUnique({
    where: { bulan_tahun: { bulan: T_BULAN, tahun: T_TAHUN } },
  });
  expect(row).not.toBeNull();
  return row!.payload as unknown as ReportSnapshotPayload;
}

async function middlewareCall(path: string, opts?: { method?: string; token?: string }) {
  const req = new NextRequest(`http://localhost${path}`, { method: opts?.method ?? "GET" });
  if (opts?.token) req.cookies.set("session", opts.token);
  return middleware(req);
}

// Export PDF (export pertama — snapshot dihapus antar retry) dalam JENDELA
// STABIL (pola dashboard.test.ts): count anggota AKTIF global di-polusi
// file test paralel, tapi jumlahLunas periode 2099-12 deterministik = 1
// (hanya Budi — payment Zainab nonaktif TIDAK dihitung, inilah inti M1).
// expectedBelum = count aktif − jumlahLunas; jika count berubah di sela
// export → hapus snapshot & coba lagi (tiap attempt = export pertama).
async function exportPdfStable(): Promise<{ payload: ReportSnapshotPayload; expectedBelum: number }> {
  for (let attempt = 1; attempt <= 8; attempt++) {
    const aktifBefore = await prisma.member.count({ where: { statusAktif: true } });
    const res = await pdfGET(pdfUrl(`bulan=${T_BULAN}&tahun=${T_TAHUN}`));
    expect(res.status).toBe(200);
    const payload = await readSnapshot();
    const aktifAfter = await prisma.member.count({ where: { statusAktif: true } });
    if (aktifBefore === aktifAfter) {
      return { payload, expectedBelum: aktifBefore - 1 };
    }
    // Window tidak stabil → ulangi dari nol (snapshot fresh tiap attempt).
    await prisma.reportSnapshot.deleteMany({ where: { bulan: T_BULAN, tahun: T_TAHUN } });
  }
  throw new Error("reports: count anggota aktif terus berubah (8 percobaan tanpa window stabil)");
}

beforeAll(async () => {
  ({ GET: pdfGET } = await import("@/app/api/reports/pdf/route"));
  ({ GET: excelGET } = await import("@/app/api/reports/excel/route"));
  ({ prisma } = await import("@/lib/prisma"));
  ({ signSession } = await import("@/lib/auth"));
  ({ middleware } = await import("@/middleware"));

  // Create diparalelkan — pooler ~500ms/query; sequential > hook timeout.
  const suffix = uniq.slice(-8);
  const [a, m1, m2, m3] = await Promise.all([
    prisma.member.create({ data: { nama: "Admin T33", noHp: `08${uniq.slice(-9)}57`, pinHash: "x", role: "ANGGOTA" } }),
    prisma.member.create({ data: { nama: "Budi", noHp: `08${suffix}1`, pinHash: "x" } }),
    prisma.member.create({ data: { nama: "Siti", noHp: `08${suffix}2`, pinHash: "x" } }),
    prisma.member.create({ data: { nama: "Zainab", noHp: `08${suffix}3`, pinHash: "x", statusAktif: false } }),
  ]);
  adminId = a.id;
  m1Id = m1.id;
  m2Id = m2.id;
  m3Id = m3.id;
  memberIds.push(adminId, m1Id, m2Id, m3Id);

  const [cat] = await Promise.all([
    prisma.category.create({ data: { nama: `CatT33 ${uniq.slice(-6)}`, isDefault: false } }),
  ]);
  categoryIds.push(cat.id);

  // Data periode 2099-12: payment Budi (AKTIF) + Zainab (NONAKTIF — M1) +
  // 1 expense → snapshot pertama terisi deterministik. Payment kedua Siti
  // di-insert di TENGAH test (setelah export pertama) utk membuktikan FR-23.
  const [e1] = await Promise.all([
    prisma.expense.create({
      data: { categoryId: cat.id, deskripsi: "Snack rapat", jumlah: 45000, tanggal: new Date(Date.UTC(T_TAHUN, T_BULAN - 1, 15)) },
    }),
  ]);
  expenseIds.push(e1.id);
  await Promise.all([
    prisma.payment.create({
      data: {
        memberId: m1Id,
        bulan: T_BULAN,
        tahun: T_TAHUN,
        jumlah: 30000,
        tanggalBayar: new Date(Date.UTC(T_TAHUN, T_BULAN - 1, 5)),
      },
    }),
    prisma.payment.create({
      data: {
        memberId: m3Id,
        bulan: T_BULAN,
        tahun: T_TAHUN,
        jumlah: 30000,
        tanggalBayar: new Date(Date.UTC(T_TAHUN, T_BULAN - 1, 8)),
      },
    }),
  ]);
});

afterAll(async () => {
  // Urut hapus (FK): loginAttempt → reportSnapshot (createdBy Restrict) →
  // payment (member Restrict) → expense (category Restrict) → auditLog
  // (actor Restrict) → category → member.
  await prisma.loginAttempt.deleteMany({ where: { memberId: { in: memberIds } } });
  await prisma.reportSnapshot.deleteMany({ where: { bulan: T_BULAN, tahun: T_TAHUN } });
  await prisma.payment.deleteMany({ where: { memberId: { in: memberIds } } });
  await prisma.expense.deleteMany({ where: { id: { in: expenseIds } } });
  await prisma.auditLog.deleteMany({ where: { actorId: adminId } });
  await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
  await prisma.member.deleteMany({ where: { id: { in: memberIds } } });
});

describe("GET /api/reports/pdf & /api/reports/excel", () => {
  it("tanpa cookie → 401 (kedua endpoint, fallback handler)", async () => {
    cookieStore.delete("session");
    expect((await pdfGET(pdfUrl(`bulan=${T_BULAN}&tahun=${T_TAHUN}`))).status).toBe(401);
    expect((await excelGET(excelUrl(`bulan=${T_BULAN}&tahun=${T_TAHUN}`))).status).toBe(401);
    await setSession(adminId, "ADMIN");
  });

  it("middleware: token ANGGOTA → 403 (pdf & excel, sebelum handler)", async () => {
    const token = await signSession({ memberId: m1Id, role: "ANGGOTA" });
    const resPdf = await middlewareCall("/api/reports/pdf", { token });
    expect(resPdf.status).toBe(403);
    await expect(resPdf.json()).resolves.toMatchObject({ error: "FORBIDDEN" });
    const resExcel = await middlewareCall("/api/reports/excel", { token });
    expect(resExcel.status).toBe(403);
  });

  it("bulan invalid (13) → 400 INVALID_INPUT", async () => {
    const res = await pdfGET(pdfUrl("bulan=13&tahun=2099"));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({ error: "INVALID_INPUT" });
  });

  it("export PDF pertama → 200 + %PDF + snapshot row tercipta (angka deterministik + M1 nonaktif)", async () => {
    const { payload, expectedBelum } = await exportPdfStable();
    frozenPayload = payload;

    expect(payload.periode).toEqual({ bulan: T_BULAN, tahun: T_TAHUN });

    // M1 (bug oracle): payment Zainab (NONAKTIF) TETAP masuk totalMasuk &
    // detailMasuk (uang masuk kas — accrual), TAPI tidak dihitung jumlahLunas
    // dan tidak mengurangi jumlahBelumBayar.
    expect(payload.ringkasan.totalMasuk).toBe(60000); // Budi 30000 + Zainab 30000
    expect(payload.ringkasan.totalKeluar).toBe(45000);
    expect(payload.ringkasan.jumlahLunas).toBe(1); // HANYA Budi (aktif) — pre-fix = 2
    // expectedBelum = count aktif saat export − 1 (jendela stabil) — payment
    // nonaktif TIDAK menguranginya (pre-fix = aktif − 2 → assert ini gagal).
    expect(payload.ringkasan.jumlahBelumBayar).toBe(expectedBelum);
    expect(payload.ringkasan.jumlahBelumBayar).toBeGreaterThanOrEqual(0); // tidak negatif
    expect(payload.ringkasan.saldoAkhirPeriode).toBeTypeOf("number");

    // Detail baris TETAP memuat semua payment (rapel nonaktif tampil).
    expect(payload.detailMasuk).toHaveLength(2);
    expect(payload.detailMasuk[0].memberNama).toBe("Budi");
    expect(payload.detailMasuk.map((m) => m.memberNama).sort()).toEqual(["Budi", "Zainab"]);
    expect(payload.detailKeluar).toHaveLength(1);
    expect(payload.detailKeluar[0].categoryNama).toContain("CatT33");

    // Header PDF tetap valid (re-export — render dari snapshot yang sama).
    const res = await pdfGET(pdfUrl(`bulan=${T_BULAN}&tahun=${T_TAHUN}`));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toContain(`laporan-kas-${T_TAHUN}-${String(T_BULAN).padStart(2, "0")}.pdf`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe("%PDF");
  });

  it("FR-23 INTI: payment baru SETELAH export pertama → re-export angka TIDAK berubah", async () => {
    expect(frozenPayload).not.toBeNull();

    // Payment baru utk periode 2099-12 (Siti) — dilakukan SETELAH snapshot
    // pertama dibekukan.
    await prisma.payment.create({
      data: {
        memberId: m2Id,
        bulan: T_BULAN,
        tahun: T_TAHUN,
        jumlah: 30000,
        tanggalBayar: new Date(Date.UTC(T_TAHUN, T_BULAN - 1, 10)),
      },
    });

    // Re-export → 200, dan payload snapshot di DB tetap identik (frozen).
    const res = await pdfGET(pdfUrl(`bulan=${T_BULAN}&tahun=${T_TAHUN}`));
    expect(res.status).toBe(200);

    const after = await readSnapshot();
    // toEqual penuh — setiap field ringkasan + detail baris tidak berubah,
    // termasuk saldoAkhirPeriode & jumlahBelumBayar yang dibekukan.
    expect(after).toEqual(frozenPayload);
    expect(after.ringkasan.totalMasuk).toBe(60000); // bukan 90000
    expect(after.detailMasuk).toHaveLength(2); // Budi & Zainab saja, Siti TIDAK masuk
  });

  it("regenerate=true → hitung ulang: totalMasuk naik sesuai payment baru (M1 konsisten)", async () => {
    const res = await pdfGET(pdfUrl(`bulan=${T_BULAN}&tahun=${T_TAHUN}&regenerate=true`));
    expect(res.status).toBe(200);

    const after = await readSnapshot();
    // Deterministik: filter bulan/tahun periode 2099-12 hanya milik test ini.
    expect(after.ringkasan.totalMasuk).toBe(90000); // Budi + Zainab + Siti
    expect(after.ringkasan.jumlahLunas).toBe(2); // Budi + Siti (Zainab NONAKTIF tidak dihitung — pre-fix = 3)
    expect(after.detailMasuk).toHaveLength(3);
    expect(after.detailMasuk.map((m) => m.memberNama).sort()).toEqual(["Budi", "Siti", "Zainab"]);
    // saldoAkhirPeriode = Σ seluruh histori s.d. akhir periode — berisi data
    // file test lain (bulan berjalan) → TIDAK di-assert absolut (non-deterministik
    // di DB dev berbagi); yang diuji di sini adalah perilaku freeze/regenerate.
  });

  it("export Excel → 200 + header PK; snapshot TIDAK berubah (C2: bersumber satu snapshot)", async () => {
    const before = await readSnapshot(); // payload hasil regenerate (90000)

    const res = await excelGET(excelUrl(`bulan=${T_BULAN}&tahun=${T_TAHUN}`));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(res.headers.get("content-disposition")).toContain(`laporan-kas-${T_TAHUN}-${String(T_BULAN).padStart(2, "0")}.xlsx`);

    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 2))).toBe("PK");

    // C2: export Excel TIDAK recompute — payload snapshot identik (PDF &
    // Excel periode sama bersumber SATU snapshot, FR-23).
    const after = await readSnapshot();
    expect(after).toEqual(before);
    expect(after.ringkasan.totalMasuk).toBe(90000);
  });
});
