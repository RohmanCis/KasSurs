import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Unit (tests/unit) + integration (tests/integration), node env.
// Integration test pakai TEST_DATABASE_URL (Docker Postgres lokal port
// 5433, container `kassurs-test-db` — keputusan 2026-09-01, isolasi penuh
// dari dev DB Supabase). Wiring di tests/setup-env.ts.
// fileParallelism: false — DB test satu untuk semua file; serial = bebas
// interferensi antar-file (kelas flake gotcha #7 lama).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    setupFiles: ['./tests/setup-env.ts'],
    fileParallelism: false,
  },
  resolve: {
    alias: {
      // Match tsconfig paths `@/*` → `./src/*`
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
