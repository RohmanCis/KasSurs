// =====================================================================
// KasSurs — T-37 E2E #3: export laporan PDF & Excel (Tech Spec Bagian 5,
// FASE-REDESIGN-3). Selector UI baru: kartu export `export-pdf-button` /
// `export-excel-button` (bukan tombol bernama "Export PDF"). Periode
// default bulan/tahun berjalan (FilterBar `laporan-periode-*`).
// Verifikasi: file ter-download (event download), nama sesuai kontrak
// `laporan-kas-<tahun>-<bulan>.{pdf,xlsx}`, dan isi tidak kosong.
// Download dipicu blob → URL.createObjectURL → a[download].click().
// =====================================================================

import fs from "fs";
import { test, expect } from "@playwright/test";
import { ADMIN_PHONE, ADMIN_PIN, loginViaUi } from "./helpers";

async function expectDownload(
  page: import("@playwright/test").Page,
  testId: string,
  ext: "pdf" | "xlsx",
): Promise<void> {
  const now = new Date();
  const periode = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId(testId).click(),
  ]);
  expect(download.suggestedFilename()).toBe(`laporan-kas-${periode}.${ext}`);
  const path = await download.path();
  expect(path, "file download harus tersimpan di disk").toBeTruthy();
  const stat = fs.statSync(path as string);
  expect(stat.size).toBeGreaterThan(0);
}

test("admin export laporan PDF & Excel tanpa error", async ({ page }) => {
  await loginViaUi(page, ADMIN_PHONE, ADMIN_PIN);
  await page.goto("/laporan");
  await expect(page.getByRole("heading", { name: "Laporan" })).toBeVisible();

  await expectDownload(page, "export-pdf-button", "pdf");
  await expectDownload(page, "export-excel-button", "xlsx");
});
