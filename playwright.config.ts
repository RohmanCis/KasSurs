import { defineConfig, devices } from '@playwright/test'

// E2E smoke — hanya 3 alur kritikal (login, catat pembayaran, export laporan),
// 1 project chromium saja (tanpa cross-browser matrix, sesuai AGENTS.md).
// Sebelum `npm run test:e2e` pertama, jalankan: npx playwright install chromium
//
// DB: Docker test terisolasi `kassurs-test-db` (port 5433) — BUKAN dev DB
// Supabase — e2e memutasi data (buat anggota + payment + snapshot laporan),
// jangan kotorin dev DB. Override DATABASE_URL via env di webServer (shell env
// menang atas .env.local Next.js). Port 3100 (3000 dipakai project lain).
const TEST_DATABASE_URL = "postgresql://postgres:kassurs_test@localhost:5433/postgres";

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  reporter: 'list',
  expect: { timeout: 15_000 }, // dev-mode cold-compile route bisa > default 5s
  use: {
    baseURL: 'http://localhost:3100',
    acceptDownloads: true,
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `set "DATABASE_URL=${TEST_DATABASE_URL}"&& npm run dev -- -p 3100`,
    url: 'http://localhost:3100',
    // reuseExistingServer: false — server 3100 yang sudah jalan membaca dev DB
    // (salah data), wajib spawn instance e2e sendiri.
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
