// =====================================================================
// KasSurs — FASE-REDESIGN-3: Speed-Tap E2E (mitigasi salah-tap, Tech Spec
// Bagian 4 V1.1 blueprint 9 langkah). Verifikasi END-TO-END — komplementer
// terhadap unit test race/conflict yang sudah ada (T-35).
//
// 1. Undo BATALKAN (toast 5s) → rollback kartu Belum + payment terhapus.
// 2. Badge BARU 2-lapis: L1 pasca-catat + L2 (createdAt) bertahan reload.
// 3. Drawer edit (PATCH nominal) lalu hapus (DELETE) → rollback Belum.
// 4. Rapel cross-month → 409 ALREADY_PAID → drawer edit deep-link ter-prefill
//    data payment existing (TIDAK ada error rollback) — kartu long-press
//    450ms hanya tersedia untuk kartu Belum, jadi anggota dibuat fresh
//    (Belum bulan berjalan) + payment bulan LALU via API.
// 5. Chip filter Belum + search gabungan (FR-07).
//
// Toast sonner action button TIDAK punya data-testid → getByRole name.
// =====================================================================

import { test, expect } from "@playwright/test";
import {
  ADMIN_PHONE,
  ADMIN_PIN,
  adminApi,
  createAnggota,
  createPaymentViaApi,
  getPaymentsAnggota,
  loginViaUi,
  periodeSekarang,
  periodeSebelumnya,
  type Anggota,
} from "./helpers";

// Speed-tap satu kartu (harus Belum) + tunggu POST 201 selesai.
async function speedTapLunas(page: import("@playwright/test").Page, memberId: string): Promise<void> {
  const card = page.getByTestId(`member-card-${memberId}`);
  const postResp = page.waitForResponse(
    (r) => r.url().includes("/api/payments") && r.request().method() === "POST",
  );
  await card.click();
  expect((await postResp).status()).toBe(201);
  await expect(card).toHaveAttribute("aria-pressed", "true");
  await expect(card).toContainText("LUNAS (");
}

async function bukaRoster(
  page: import("@playwright/test").Page,
  anggota: Anggota,
): Promise<import("@playwright/test").Locator> {
  await page.goto("/pembayaran");
  const card = page.getByTestId(`member-card-${anggota.id}`);
  await expect(card).toBeVisible();
  return card;
}

test("1. undo BATALKAN → kartu rollback Belum + payment terhapus di API", async ({ page }) => {
  const api = await adminApi();
  const uniq = Date.now();
  const anggota = await createAnggota(
    api,
    `E2E Speed Undo ${uniq}`,
    `08${String(uniq).slice(-10)}`,
    "123456",
  );

  await loginViaUi(page, ADMIN_PHONE, ADMIN_PIN);
  const card = await bukaRoster(page, anggota);
  await expect(card).toContainText("TAP LUNAS");

  // 1-tap → lunas + undo toast (durasi 5000ms — assert segera setelah 201)
  await speedTapLunas(page, anggota.id);
  await expect(card).toContainText("BARU");

  const undoBtn = page.getByRole("button", { name: "BATALKAN" });
  await expect(undoBtn).toBeVisible();

  // BATALKAN → DELETE /api/payments/:id (closure-scoped undo)
  const delResp = page.waitForResponse(
    (r) => r.url().includes("/api/payments/") && r.request().method() === "DELETE",
  );
  await undoBtn.click();
  expect((await delResp).ok()).toBeTruthy();

  // Rollback: kartu kembali Belum + toast konfirmasi dibatalkan
  await expect(card).toHaveAttribute("aria-pressed", "false");
  await expect(card).toContainText("TAP LUNAS");
  await expect(page.getByText(new RegExp(`${anggota.nama} dibatalkan`))).toBeVisible();

  // Server: payment benar-benar terhapus (0 tersisa untuk anggota ini)
  const payments = await getPaymentsAnggota(api, anggota.id);
  expect(payments).toHaveLength(0);
  await api.dispose();
});

test("2. badge BARU tampil pasca-catat & bertahan setelah reload (L2 createdAt)", async ({
  page,
}) => {
  const api = await adminApi();
  const uniq = Date.now();
  const anggota = await createAnggota(
    api,
    `E2E Speed Badge ${uniq}`,
    `08${String(uniq).slice(-10)}`,
    "123456",
  );

  await loginViaUi(page, ADMIN_PHONE, ADMIN_PIN);
  const card = await bukaRoster(page, anggota);

  await speedTapLunas(page, anggota.id);
  // Badge BARU (L1 — state lokal pasca-catat)
  await expect(card).toContainText("BARU");

  // Reload → roster di-refetch dari server → badge MASIH tampil
  // (L2: createdAt payment < 10 menit, bukan cuma state React).
  await page.reload();
  const cardSetelahReload = page.getByTestId(`member-card-${anggota.id}`);
  await expect(cardSetelahReload).toBeVisible();
  await expect(cardSetelahReload).toContainText("LUNAS (");
  await expect(cardSetelahReload).toContainText("BARU");
  await api.dispose();
});

test("3. drawer edit PATCH nominal → toast sukses; lalu hapus → rollback Belum", async ({
  page,
}) => {
  const api = await adminApi();
  const uniq = Date.now();
  const anggota = await createAnggota(
    api,
    `E2E Speed Edit ${uniq}`,
    `08${String(uniq).slice(-10)}`,
    "123456",
  );

  await loginViaUi(page, ADMIN_PHONE, ADMIN_PIN);
  const card = await bukaRoster(page, anggota);
  await speedTapLunas(page, anggota.id);

  // Tap kartu LUNAS → drawer detail
  await card.click();
  const editDrawer = page.getByTestId("edit-drawer");
  await expect(editDrawer).toBeVisible();
  await expect(editDrawer).toContainText("Rp 30.000");

  // Buka form edit → ubah nominal 30.000 → 50.000 → simpan
  await page.getByTestId("edit-open-form").click();
  await expect(page.getByTestId("edit-nominal")).toBeVisible();
  const patchResp = page.waitForResponse(
    (r) => r.url().includes("/api/payments/") && r.request().method() === "PATCH",
  );
  await page.getByTestId("edit-nominal").fill("50000");
  await page.getByTestId("edit-submit").click();
  expect((await patchResp).ok()).toBeTruthy();
  await expect(page.getByText("Perubahan pembayaran tersimpan.")).toBeVisible();

  // Server: nominal berubah
  const setelahPatch = await getPaymentsAnggota(api, anggota.id);
  expect(setelahPatch).toHaveLength(1);
  expect(setelahPatch[0].jumlah).toBe(50000);

  // Buka drawer lagi → Hapus → konfirmasi → kartu rollback Belum
  await card.click();
  await expect(editDrawer).toBeVisible();
  await page.getByTestId("edit-delete").click();
  const deleteConfirm = page.getByTestId("delete-confirm");
  await expect(deleteConfirm).toBeVisible();
  const delResp = page.waitForResponse(
    (r) => r.url().includes("/api/payments/") && r.request().method() === "DELETE",
  );
  await deleteConfirm.click();
  expect((await delResp).ok()).toBeTruthy();

  await expect(card).toHaveAttribute("aria-pressed", "false");
  await expect(card).toContainText("TAP LUNAS");
  const setelahHapus = await getPaymentsAnggota(api, anggota.id);
  expect(setelahHapus).toHaveLength(0);
  await api.dispose();
});

test("4. rapel cross-month ke periode lunas → 409 → drawer edit prefill existing (tanpa error)", async ({
  page,
}) => {
  const api = await adminApi();
  const uniq = Date.now();
  const anggota = await createAnggota(
    api,
    `E2E Speed 409 ${uniq}`,
    `08${String(uniq).slice(-10)}`,
    "123456",
  );
  // Anggota BELUM bayar bulan berjalan, tapi SUDAH punya payment bulan LALU
  // (via API) — kartunya Belum → long-press 450ms tersedia (gated Belum-only).
  const sekarang = periodeSekarang();
  const lalu = periodeSebelumnya(sekarang);
  // Nominal khas (35.000) agar prefill drawer edit bisa dibedakan dari
  // default rapel 30.000 → terbukti data yang diprefill = payment existing.
  const existing = await createPaymentViaApi(api, anggota.id, lalu, 35000);

  await loginViaUi(page, ADMIN_PHONE, ADMIN_PIN);
  const card = await bukaRoster(page, anggota);
  await expect(card).toContainText("TAP LUNAS"); // bulan berjalan masih Belum

  // Long-press 450ms (delay click 600ms > LONG_PRESS_MS) → rapel drawer
  await card.click({ delay: 600 });
  const rapel = page.getByTestId("rapel-drawer");
  await expect(rapel).toBeVisible();

  // Set periode = bulan lalu yang SUDAH lunas untuk anggota ini
  await page.getByTestId("rapel-bulan").selectOption(String(lalu.bulan));
  await page.getByTestId("rapel-tahun").selectOption(String(lalu.tahun));

  const postResp = page.waitForResponse(
    (r) => r.url().includes("/api/payments") && r.request().method() === "POST",
  );
  await page.getByTestId("rapel-submit").click();
  expect((await postResp).status()).toBe(409);

  // 409 → settleConflict dieksekusi penuh: toast "membuka detail pembayaran"
  await expect(page.getByText(/membuka detail pembayaran/)).toBeVisible();

  // 409 → deep-link drawer edit ter-prefill data payment existing — nominal
  // 35.000 (bukan default rapel 30.000) membuktikan prefill = existing.
  const editDrawer = page.getByTestId("edit-drawer");
  await expect(editDrawer).toBeVisible();
  await expect(editDrawer).toContainText("Rp 35.000");

  // Kartu roster bulan berjalan TETAP Belum setelah 409 cross-month (fix
  // oracle #2 #5 di tandaiLunas: payment existing milik bulan lain tidak
  // boleh me-flip status LUNAS ke kartu bulan berjalan).
  await expect(card).toContainText("TAP LUNAS");

  // Server: TIDAK ada payment baru (bulan berjalan tetap 0); existing utuh
  const semua = await getPaymentsAnggota(api, anggota.id);
  expect(semua).toHaveLength(1);
  expect(semua[0].id).toBe(existing.id);
  expect(semua[0].jumlah).toBe(35000);
  await api.dispose();
});

test("5. filter chip Belum + pencarian nama (gabungan FR-07)", async ({ page }) => {
  const api = await adminApi();
  const uniq = Date.now();
  const anggotaLunas = await createAnggota(
    api,
    `E2E Speed Filter Lunas ${uniq}`,
    `08${String(uniq).slice(-9)}1`,
    "123456",
  );
  const anggotaBelum = await createAnggota(
    api,
    `E2E Speed Filter Belum ${uniq}`,
    `08${String(uniq).slice(-9)}2`,
    "123456",
  );
  // Anggota pertama lunas bulan berjalan (via API) → kartu hijau.
  await createPaymentViaApi(api, anggotaLunas.id, periodeSekarang());

  await loginViaUi(page, ADMIN_PHONE, ADMIN_PIN);
  await page.goto("/pembayaran");
  const cardLunas = page.getByTestId(`member-card-${anggotaLunas.id}`);
  const cardBelum = page.getByTestId(`member-card-${anggotaBelum.id}`);
  await expect(cardLunas).toBeVisible();
  await expect(cardBelum).toBeVisible();
  await expect(cardLunas).toContainText("LUNAS (");
  await expect(cardBelum).toContainText("TAP LUNAS");

  // Chip "Belum" → hanya kartu Belum yang tampil
  await page.getByTestId("chip-filter-belum").click();
  await expect(cardLunas).not.toBeVisible();
  await expect(cardBelum).toBeVisible();

  // Chip Belum AKTIF + search nama anggota Lunas → kosong (kartu lunas
  // sudah di-filter chip, kartu Belum tidak cocok dengan nama itu)
  await page.getByTestId("search-anggota").fill(anggotaLunas.nama);
  await expect(cardBelum).not.toBeVisible();
  await expect(page.getByText(/Gada Anggota yang cocok nih dengan/)).toBeVisible();

  // Pindah chip "Semua" (search tetap) → kartu Lunas muncul lagi
  await page.getByTestId("chip-filter-semua").click();
  await expect(cardLunas).toBeVisible();
  await expect(cardBelum).not.toBeVisible();
  await api.dispose();
});

test("6. long-press kartu LUNAS → edit-drawer (bukan rapel-drawer) — gate !lunas MemberCard", async ({
  page,
}) => {
  const api = await adminApi();
  const uniq = Date.now();
  const anggota = await createAnggota(
    api,
    `E2E Speed LunasLong ${uniq}`,
    `08${String(uniq).slice(-10)}`,
    "123456",
  );
  // Lunas bulan berjalan via API (tanpa UI) — kartu langsung LUNAS
  await createPaymentViaApi(api, anggota.id, periodeSekarang());

  await loginViaUi(page, ADMIN_PHONE, ADMIN_PIN);
  const card = await bukaRoster(page, anggota);
  await expect(card).toContainText("LUNAS (");

  // Long-press 450ms di kartu LUNAS: MemberCard gate `if (lunas) return`
  // (3-DESIGN 5.10) → timer rapel TIDAK pernah start → pointerup fire onTap
  // → drawer edit terbuka. Regression guard oracle #2 #6.
  await card.click({ delay: 600 });
  await expect(page.getByTestId("edit-drawer")).toBeVisible();
  await expect(page.getByTestId("rapel-drawer")).not.toBeVisible();
  await api.dispose();
});
