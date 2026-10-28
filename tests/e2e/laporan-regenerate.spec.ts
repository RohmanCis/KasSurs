// =====================================================================
// KasSurs — E2E: Hitung Ulang Laporan (FR-23 koreksi salah input).
// Bukti ujung-ke-ujung freeze → koreksi:
//   1. export PDF periode P (snapshot dibuat) → bytes A
//   2. export PDF lagi → bytes B === A (beku, bukan hitung ulang diam-diam)
//   3. tambah payment periode P via API → export PDF lagi → masih A (beku)
//   4. kartu "Hitung Ulang Periode Ini" → drawer konfirmasi → confirm →
//      POST /api/reports/regenerate (200) + PDF terunduh via GET → bytes D
//      BERBEDA dari A (snapshot benar-benar ditimpa) + toast sukses
//   5. export PDF lagi → bytes === D (freeze baru sudah tersimpan)
// Periode P sengaja bulan lalu-tahun lalu (dalam rentang FilterBar
// tahunIni-1..tahunIni+1) agar tidak bertabrakan dengan spec export lain
// yang memakai periode berjalan.
// Cleanup mandiri: snapshot periode P dibuat oleh AKUN ADMIN seed, jadi
// TIDAK ter-purge global-setup (yang hanya purge createdBy "E2E ...") —
// wajib dihapus di afterAll supaya run berikutnya tidak mewarisi snapshot
// beku yang basi (flaky lintas-run).
// =====================================================================

import fs from "fs";
import * as XLSX from "xlsx";
import { test, expect, type APIRequestContext, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import {
  ADMIN_PHONE,
  ADMIN_PIN,
  adminApi,
  createAnggota,
  createPaymentViaApi,
  loginViaUi,
  periodeSekarang,
  type Anggota,
} from "./helpers";

// DB test terisolasi port 5433 (sama seperti global-setup.ts:7) — di-set
// eksplisit agar worker E2E tidak pernah menyentuh dev DB.
const TEST_DATABASE_URL = "postgresql://postgres:kassurs_test@localhost:5433/postgres";
const prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });

// Periode bebas bentrok: Januari tahun lalu.
const PERIODE = { bulan: 1, tahun: periodeSekarang().tahun - 1 };
const PERIODE_SLUG = `${PERIODE.tahun}-${String(PERIODE.bulan).padStart(2, "0")}`;

let anggota: Anggota | null = null;

async function unduhPdf(page: Page, testId: string): Promise<Buffer> {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId(testId).click(),
  ]);
  expect(download.suggestedFilename()).toBe(`laporan-kas-${PERIODE_SLUG}.pdf`);
  const path = await download.path();
  expect(path, "file PDF harus tersimpan di disk").toBeTruthy();
  const buf = fs.readFileSync(path as string);
  expect(buf.length).toBeGreaterThan(0);
  return buf;
}

// Isi laporan periode P yang BENAR-BENAR tersimpan (bukan byte file PDF —
// byte bisa berubah walau hanya `dibuatPada` yang bergeser). Sumber bukti:
// Excel dirender dari snapshot yang sama (FR-23), jadi baris transaksi di
// dalamnya membuktikan apakah hitung ulang mengambil data terbaru.
async function barisExcel(api: APIRequestContext, p: { bulan: number; tahun: number }): Promise<string> {
  const res = await api.get(`/api/reports/excel?bulan=${p.bulan}&tahun=${p.tahun}`);
  expect(res.ok()).toBeTruthy();
  const wb = XLSX.read(await res.body(), { type: "buffer" });
  const sheet = wb.Sheets["Transaksi"];
  expect(sheet).toBeTruthy();
  return XLSX.utils
    .sheet_to_json<string[]>(sheet, { header: 1 })
    .map((row) => row.join(" "))
    .join("\n");
}

test.afterAll(async () => {
  try {
    await prisma.reportSnapshot.deleteMany({
      where: { bulan: PERIODE.bulan, tahun: PERIODE.tahun },
    });
    if (anggota) {
      await prisma.payment.deleteMany({ where: { memberId: anggota.id } });
      await prisma.member.deleteMany({ where: { id: anggota.id } });
    }
  } finally {
    await prisma.$disconnect();
  }
});

test("export beku → hitung ulang → PDF baru terunduh + toast", async ({ page }) => {
  test.setTimeout(120_000); // dev-mode cold-compile + 4x render PDF

  // Data pemicu perubahan angka: anggota + payment periode P via API.
  const api = await adminApi();
  const uniq = Date.now();
  anggota = await createAnggota(
    api,
    `E2E Regen ${uniq}`,
    `08${String(uniq).slice(-10)}`,
    "123456",
  );
  // Nama anggota = penanda konten di laporan (memberNama denormalisasi).
  const namaAnggota = `E2E Regen ${uniq}`;

  await loginViaUi(page, ADMIN_PHONE, ADMIN_PIN);
  await page.goto("/laporan");
  await expect(page.getByTestId("regenerate-button")).toBeVisible();

  // Periode P via FilterBar (native select).
  await page.getByTestId("laporan-periode-bulan").selectOption(String(PERIODE.bulan));
  await page.getByTestId("laporan-periode-tahun").selectOption(String(PERIODE.tahun));

  // 1-2. Export pertama membekukan; export kedua byte-identik (tanpa `regenerate`).
  const pdfBeku = await unduhPdf(page, "export-pdf-button");
  const pdfUlang = await unduhPdf(page, "export-pdf-button");
  expect(pdfUlang.equals(pdfBeku)).toBe(true);

  // 3. Data baru untuk periode P → export lama TIDAK berubah (masih beku).
  await createPaymentViaApi(api, anggota.id, PERIODE);
  const pdfSetelahBayar = await unduhPdf(page, "export-pdf-button");
  expect(pdfSetelahBayar.equals(pdfBeku)).toBe(true);
  // Konten beku ikut dibuktikan (byte bisa sama walau isi beda, dan sebaliknya):
  // anggota yang baru dibayar BELUM ada di laporan periode P.
  expect(await barisExcel(api, PERIODE)).not.toContain(namaAnggota);

  // 4. Hitung ulang: drawer konfirmasi → satu aksi → snapshot ditimpa + PDF baru.
  await page.getByTestId("regenerate-button").click();
  await expect(page.getByText("Hitung ulang laporan?")).toBeVisible();
  await expect(page.getByTestId("regenerate-drawer")).toContainText("tetap berisi angka lama");
  await expect(page.getByTestId("regenerate-drawer")).toContainText("audit log");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("regenerate-confirm").click(),
  ]);
  expect(download.suggestedFilename()).toBe(`laporan-kas-${PERIODE_SLUG}.pdf`);
  const pdfBaru = fs.readFileSync((await download.path()) as string);
  expect(pdfBaru.equals(pdfBeku)).toBe(false); // angka baru benar-benar masuk
  // Bukti konten: baris anggota yang baru dibayar kini ADA di laporan periode P.
  expect(await barisExcel(api, PERIODE)).toContain(namaAnggota);

  await expect(page.getByText(/dihitung ulang\./)).toBeVisible();
  // Fokus kembali ke pemicu setelah drawer tutup.
  await expect(page.getByTestId("regenerate-button")).toBeFocused();

  // 5. Freeze baru tersimpan: export berikutnya byte-identik dengan PDF koreksi.
  const pdfSetelahRegen = await unduhPdf(page, "export-pdf-button");
  expect(pdfSetelahRegen.equals(pdfBaru)).toBe(true);

  await api.dispose();
});
