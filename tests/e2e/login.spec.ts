// =====================================================================
// KasSurs — T-37 E2E #1: Login (admin & anggota) → dashboard/status
// masing-masing (Tech Spec Bagian 5). Root "/" redirect by-role (fix
// QA #1). Assert terhadap UI Neo-Brutalism V2.2 (FASE-REDESIGN-3):
// heading "Bendahara Aktif" + kartu Belum Bayar (admin), passbook +
// transparansi saldo + Keluar (anggota read-only).
// =====================================================================

import { test, expect } from "@playwright/test";
import { ADMIN_PHONE, ADMIN_PIN, adminApi, createAnggota, loginViaUi } from "./helpers";

test("admin login → redirect ke /dashboard menampilkan ringkasan kas", async ({ page }) => {
  await loginViaUi(page, ADMIN_PHONE, ADMIN_PIN);
  await expect(page).toHaveURL(/\/dashboard$/);
  // Neo V2.2 header bar — judul dashboard berubah dari "Dashboard"
  await expect(page.getByRole("heading", { name: "Bendahara Aktif" })).toBeVisible();
  // Admin-only field — jumlah anggota belum bayar (FR-12)
  await expect(page.getByTestId("card-belum-bayar")).toContainText("Belum Bayar");
});

test("anggota login → /status menampilkan iuran sendiri (read-only)", async ({ page }) => {
  const api = await adminApi();
  const uniq = Date.now();
  const anggota = await createAnggota(
    api,
    `E2E Anggota Login ${uniq}`,
    `08${String(uniq).slice(-10)}`,
    "123456",
  );
  await api.dispose();

  await loginViaUi(page, anggota.noHp, "123456");
  await expect(page).toHaveURL(/\/status$/);
  // Anggota fresh (0 payment) → passbook kupon "STATUS: BELUM BAYAR"
  const passbook = page.getByTestId("passbook-card");
  await expect(passbook).toBeVisible();
  await expect(passbook).toContainText("BUKU KAS DIGITAL");
  await expect(passbook).toContainText("STATUS: BELUM BAYAR");
  // Transparansi saldo umum (FR-14)
  await expect(page.getByTestId("saldo-umum-card")).toBeVisible();
  // Read-only: tidak ada aksi selain Keluar
  await expect(page.getByTestId("status-logout")).toBeVisible();
});
