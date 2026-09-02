// Vitest setup (dijalankan SEBELUM semua test file — wiring test DB).
// Keputusan 2026-09-01: integration test pakai TEST_DATABASE_URL (Docker
// Postgres lokal port 5433, container `kassurs-test-db`) — isolasi penuh
// dari dev DB Supabase. Loader .env.local per-file yang lama tidak akan
// menimpa (mereka cek `if (!(key in process.env))`).
//
// Urutan:
//   1. Muat .env.local manual (tanpa dep dotenv — pola yang sudah dipakai
//      per-file test; tidak menimpa key yang sudah ada di process.env).
//   2. Jika TEST_DATABASE_URL ada → DATABASE_URL diarahkan ke sana,
//      SEBELUM modul apa pun (prisma.ts singleton) di-import oleh test.
//
// Tanpa TEST_DATABASE_URL (container tidak jalan) → biarkan DATABASE_URL
// dev Supabase: suite tetap jalan tapi tanpa isolasi (perilaku lama).
import { readFileSync } from "node:fs";

for (const line of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
  if (!m) continue;
  const value = m[2].replace(/^["']|["']$/g, ""); // strip kutip
  if (!(m[1] in process.env)) process.env[m[1]] = value;
}

if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
