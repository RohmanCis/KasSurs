// =====================================================================
// KasSurs — T-37 E2E #2: catat pembayaran end-to-end via alur Speed-Tap
// 1-tap (Tech Spec Bagian 4 V1.1 — FASE-REDESIGN-3). Alur lama
// (row → PaymentForm → Simpan) sudah diganti roster kartu:
//   kartu anggota "Belum" → TAP → optimistic flip + POST /api/payments
//   (30rb, hari ini) → kartu Lunas + badge BARU + undo toast BATALKAN.
// Verifikasi server: 1 payment tercatat bulan berjalan.
// =====================================================================

import { test, expect } from "@playwright/test";
import { ADMIN_PHONE, ADMIN_PIN, adminApi, createAnggota, loginViaUi, periodeSekarang } from "./helpers";

test("admin speed-tap catat pembayaran → kartu Lunas + tercatat di API", async ({ page }) => {
  const api = await adminApi();
  const uniq = Date.now();
  const anggota = await createAnggota(
    api,
    `E2E Anggota Bayar ${uniq}`,
    `08${String(uniq).slice(-10)}`,
    "123456",
  );

  await loginViaUi(page, ADMIN_PHONE, ADMIN_PIN);
  await page.goto("/pembayaran");

  // Kartu anggota fresh = belum bayar (pill "TAP LUNAS")
  const card = page.getByTestId(`member-card-${anggota.id}`);
  await expect(card).toBeVisible();
  await expect(card).toContainText("TAP LUNAS");

  // 1-tap → POST /api/payments (deterministik: tunggu response, bukan sleep)
  const postResp = page.waitForResponse(
    (r) => r.url().includes("/api/payments") && r.request().method() === "POST",
  );
  await card.click();
  expect((await postResp).status()).toBe(201);

  // Kartu settle Lunas (pill ber-tanggal) + badge BARU + undo toast
  await expect(card).toHaveAttribute("aria-pressed", "true");
  await expect(card).toContainText("LUNAS (");
  await expect(card).toContainText("BARU");
  await expect(page.getByText(/Lunas \(Rp 30\.000\)/)).toBeVisible();

  // Verifikasi server-side: payment benar-benar tercatat bulan berjalan.
  const { bulan, tahun } = periodeSekarang();
  const res = await api.get(
    `/api/payments?memberId=${anggota.id}&bulan=${bulan}&tahun=${tahun}`,
  );
  expect(res.ok()).toBeTruthy();
  const payments = (await res.json()) as Array<{ memberId: string; jumlah: number; bulan: number; tahun: number }>;
  expect(payments).toHaveLength(1);
  expect(payments[0].jumlah).toBe(30000);
  expect(payments[0].bulan).toBe(bulan);
  expect(payments[0].tahun).toBe(tahun);
  await api.dispose();
});
