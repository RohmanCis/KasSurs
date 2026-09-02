// =====================================================================
// KasSurs — T-37/FASE-REDESIGN-3 helper E2E (shared oleh semua spec).
// - loginViaUi: alur login nyata via form (bukan set cookie manual) —
//   smoke test memang harus melewati UI login + middleware. PIN diisi
//   6-box (LoginForm Neo V2.2): auto-advance + paste terdistribusi,
//   fill penuh di box pertama TIDAK bekerja (handler per-box slice(-1)).
// - apiAdmin: APIRequestContext ber-sesi admin — untuk setup data
//   (buat anggota/payment) & verifikasi state via API tanpa menggerakkan UI.
// - createPaymentViaApi/getPaymentsAnggota: helper pembayaran (Speed-Tap
//   spec butuh data deterministik via API + verifikasi server-side).
// Kredensial admin dari seed test DB (SEED_ADMIN_* di .env).
// =====================================================================

import { expect, request, type APIRequestContext, type Page } from "@playwright/test";

export const ADMIN_PHONE = process.env.SEED_ADMIN_PHONE ?? "081213024017";
export const ADMIN_PIN = process.env.SEED_ADMIN_PIN ?? "000000";

export async function loginViaUi(page: Page, noHp: string, pin: string): Promise<void> {
  await page.goto("/login");
  await page.getByTestId("login-nohp-input").fill(noHp);
  // PIN 6-box: isi per digit langsung ke setiap box (fill penuh di box
  // pertama ter-slice(-1) → hanya digit terakhir masuk).
  for (let i = 0; i < pin.length; i++) {
    await page.getByTestId(`login-pin-box-${i}`).fill(pin[i]);
  }
  await page.getByTestId("login-submit").click();
  // LoginForm sukses → router.push("/") → root redirect by-role
  // (fix QA #1): ADMIN → /dashboard, ANGGOTA → /status.
  await page.waitForURL((url) => url.pathname === "/dashboard" || url.pathname === "/status");
}

export async function adminApi(): Promise<APIRequestContext> {
  const api = await request.newContext({ baseURL: "http://localhost:3100" });
  const res = await api.post("/api/auth/login", {
    data: { noHp: ADMIN_PHONE, pin: ADMIN_PIN },
  });
  expect(res.ok()).toBeTruthy();
  return api;
}

export interface Anggota {
  id: string;
  nama: string;
  noHp: string;
}

export async function createAnggota(
  api: APIRequestContext,
  nama: string,
  noHp: string,
  pin: string,
): Promise<Anggota> {
  const res = await api.post("/api/members", { data: { nama, noHp, pin } });
  expect(res.status()).toBe(201);
  return (await res.json()) as Anggota;
}

export interface Periode {
  bulan: number; // 1-12
  tahun: number;
}

export function periodeSekarang(): Periode {
  const now = new Date();
  return { bulan: now.getMonth() + 1, tahun: now.getFullYear() };
}

export function periodeSebelumnya(p: Periode = periodeSekarang()): Periode {
  return p.bulan === 1
    ? { bulan: 12, tahun: p.tahun - 1 }
    : { bulan: p.bulan - 1, tahun: p.tahun };
}

export interface PaymentApi {
  id: string;
  memberId: string;
  memberNama: string;
  bulan: number;
  tahun: number;
  jumlah: number;
  tanggalBayar: string; // YYYY-MM-DD
  createdAt: string;
}

export async function createPaymentViaApi(
  api: APIRequestContext,
  memberId: string,
  periode: Periode,
  jumlah = 30000,
): Promise<PaymentApi> {
  const tanggal = `${periode.tahun}-${String(periode.bulan).padStart(2, "0")}-15`;
  const res = await api.post("/api/payments", {
    data: { memberId, bulan: periode.bulan, tahun: periode.tahun, jumlah, tanggalBayar: tanggal },
  });
  expect(res.status()).toBe(201);
  return (await res.json()) as PaymentApi;
}

export async function getPaymentsAnggota(
  api: APIRequestContext,
  memberId: string,
): Promise<PaymentApi[]> {
  const res = await api.get(`/api/payments?memberId=${memberId}`);
  expect(res.ok()).toBeTruthy();
  return (await res.json()) as PaymentApi[];
}
