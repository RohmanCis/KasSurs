# AGENTS.md — KasSurs

Panduan wajib untuk agent. Baca sebelum implementasi apa pun.

## Project Overview

- **Nama:** KasSurs — aplikasi web mobile-first untuk mengelola kas bulanan organisasi kecil.
- **Tujuan:** Mengganti pencatatan kas manual (kertas) dengan sistem digital; transparansi status pembayaran; laporan PDF/Excel < 1 menit; keamanan dasar (PIN hash, rate-limiting).
- **Target user:** Admin/bendahara (CRUD penuh) dan anggota organisasi (view-only, self-service cek status bayar + saldo umum). Level teknis pemula.
- **Skala:** Maksimal 30 anggota, ≤30 user aktif, $0 budget (free-tier), tanpa over-engineering (tidak ada caching layer, load balancer, atau scale horizontal).

## Tech Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Frontend | Next.js (App Router) | 14.x |
| Language | TypeScript | 5.x |
| Styling | Tailwind CSS | 3.x |
| State | React Context + Server Components (tanpa state manager eksternal) | - |
| Backend | Next.js API Routes / Route Handlers | 14.x (built-in) |
| Database | PostgreSQL (via Supabase) | 15.x |
| ORM | Prisma | 5.x |
| Auth | Custom (No HP + PIN, bcrypt hash, JWT session cookie) | - |
| Hosting | Vercel (frontend + API) | - |
| DB Hosting | Supabase | Free tier |
| Caching | Tidak digunakan | - |
| Export PDF | jsPDF + jspdf-autotable | latest |
| Export Excel | SheetJS (xlsx) | latest |
| Unit/Integration Test | Vitest | latest |
| E2E/Smoke Test | Playwright (ringan, hanya alur kritikal) | latest |
| UI deps | lucide-react, sonner, vaul, clsx, tailwind-merge | latest |

## Setup Commands

```bash
# Clone & install
git clone <repo-url> kassurs
cd kassurs
npm install

# Setup environment
cp .env.example .env.local
# isi DATABASE_URL, DIRECT_URL, JWT_SECRET
# isi SEED_ADMIN_PHONE, SEED_ADMIN_PIN (untuk akun admin pertama — lihat FR-22)

# Setup database
npx prisma migrate dev
npx prisma db seed   # seed kategori default + 1 akun admin awal dari env var
                      # idempotent: skip pembuatan admin jika sudah ada role=ADMIN di DB

# Jalankan development server
npm run dev
```

Environment variables yang dibutuhkan: `DATABASE_URL` (Supabase pooler), `DIRECT_URL` (Supabase direct, untuk migration), `JWT_SECRET`, `SEED_ADMIN_PHONE`, `SEED_ADMIN_PIN`.

## Source of Truth

Rujukan wajib sebelum implementasi apa pun — jangan asumsi di luar dokumen ini:

1. `.agents/1-PRD.md` — produk, 23 Functional Requirements (V1.1: FR-06 Speed-Tap + FR-07/08/09/12/14 amendemen 2026-09-02), NFR, out of scope.
2. `.agents/2-TECH-SPEC.md` — stack, skema Prisma, API contract types (wajib dipakai via `src/lib/types.ts`), business rules, keamanan, testing.
3. `.agents/3-DESIGN.md` — **V2.2 Neo-Brutalism**: token warna flat `neo.*`, hard shadow, Bricolage Grotesque + JetBrains Mono, resep komponen 5.1–5.10 (5.10 = alur Speed-Tap + mitigasi salah-tap FINAL), motion, aksesibilitas. Ground truth visual: `.agents/kassurs_ui_neobrutalism_final.html`.
4. `.agents/3-TASKS.md` — breakdown 39 task (T-01 s.d. T-39) + Modul R (FASE-REDESIGN-1/2/3) + dependensi.

## Code Style

- Semua field API pakai `camelCase` (bukan `snake_case`) — kolom DB pakai `snake_case` via `@map` di Prisma.
- Tanggal selalu ISO 8601 string (`"2026-08-30"` atau `"2026-08-30T10:00:00Z"`), tidak pernah timestamp Unix.
- Field denormalized untuk render (mis. `memberNama` di `PaymentDTO`) wajib diberi komentar eksplisit bahwa itu bukan field asli tabel.
- Kontrak tipe TypeScript di Tech Spec Bagian 3 adalah wajib — didefinisikan sekali di `src/lib/types.ts`, dipakai bersama frontend & backend, tidak ditebak ulang per task.
- Struktur folder mengikuti konvensi Next.js 14+ App Router sesuai Tech Spec Bagian 1.
- UI Bahasa Indonesia, mobile-first (default 360-430px), font **Bricolage Grotesque** (`next/font/google`, + JetBrains Mono untuk meta teknis), nominal Rupiah pakai `font-variant-numeric: tabular-nums`. Jangan pakai Inter atau Plus Jakarta Sans (diganti V2.2).
- Styling **Neo-Brutalism V2.2**: semua border hitam pekat (`border-black`), hard shadow `shadow-neo*`, press-down `active:translate + active:shadow-none` wajib di semua tombol/kartu interaktif, status selalu disertai teks (bukan warna saja). Utility merge class via `cn()` (`src/lib/utils.ts` — clsx + tailwind-merge). Token lama V1.0 (OKLCH/canvas/surface/primary/dst.) SUDAH DIHAPUS — jangan pakai.

## Critical Business Rules

Pelanggaran berdampak besar:

- **Payment unik per bulan:** 1 anggota hanya 1 record lunas per bulan per tahun — constraint unique `[memberId, bulan, tahun]` di DB. Duplikat → `409 Conflict` `ALREADY_PAID` "Sudah lunas bulan ini", bukan silent overwrite / auto-redirect ke edit. Client-side check hanya UX shortcut; server wajib validasi ulang.
- **Last-admin lockout:** Sistem menolak (403) menonaktifkan akun ADMIN jika itu satu-satunya ADMIN aktif tersisa.
- **RBAC:** Anggota read-only — tidak ada akses create/update/delete sama sekali; hanya data pembayaran miliknya sendiri + ringkasan saldo umum. Middleware tolak 403 sebelum query DB.
- **Audit log wajib & append-only:** Setiap create/update/delete pada `payments` dan `expenses` wajib tercatat di `AuditLog` (actor, aksi, dataLama, dataBaru, timestamp). Tidak ada endpoint edit/hapus audit log.
- Lockout login: 5x salah PIN berturut-turut → terkunci 15 menit (via tabel `LoginAttempt`, bukan in-memory).
- No HP unik di seluruh sistem; role default ANGGOTA saat tambah anggota via UI (promote ADMIN hanya langsung di database).
- Anggota nonaktif = soft delete (`statusAktif=false`), data historis tidak dihapus.
- Nominal pembayaran default Rp30.000 tapi editable (rapel/sumbangan), validasi hanya `jumlah > 0` di application layer (Zod).
- Kas bulanan Rp30.000/anggota, ditagih tiap tanggal 1. Session login 30 hari **sliding** (amendemen 2026-09-01: middleware re-issue token saat sisa < 15 hari — detail Tech Spec Bagian 4 "Alur Sliding Session"; anggota nonaktif tetap bisa akses selama rutin buka app — keputusan sadar user, cabut akses = reset PIN).
- Seed script idempotent — skip pembuatan admin jika sudah ada role=ADMIN di DB.

## Testing Instructions

```bash
docker start kassurs-test-db   # wajib jalan sebelum test (Postgres 5433, terisolasi)
npm run test          # Vitest — unit + integration (wired ke TEST_DATABASE_URL via tests/setup-env.ts)
npm run test:e2e      # Playwright — smoke test
```

Kapan wajib dijalankan:

- **Unit (Vitest) — wajib untuk:** validasi PIN/hash (bcrypt wrapper), kalkulasi saldo, business rule constraint (jumlah > 0, duplikat payment), rate-limiting logic (5x gagal dalam 15 menit).
- **Integration (Vitest + test DB terpisah) — wajib untuk:** `POST /api/payments` (termasuk 409), `POST /api/auth/login` (termasuk lockout), audit log tercatat di setiap create/update/delete Payment/Expense, RBAC middleware (ANGGOTA → 403 di endpoint admin).
- **E2E (Playwright) — hanya alur kritikal:** login admin & anggota, catat pembayaran Speed-Tap end-to-end (termasuk undo/badge/drawer/cross-month 409 di `speed-tap.spec.ts`), export laporan PDF/Excel. Kini 10 test / 4 spec.
- Tidak masuk scope: visual regression, cross-browser matrix, load testing.

## Security Considerations

- PIN di-hash **bcrypt** (salt rounds minimal 10) — tidak pernah plaintext, tidak ada endpoint yang mengembalikan PIN asli.
- JWT disimpan sebagai **httpOnly, secure, sameSite=strict cookie**, expiry 30 hari — cegah XSS & CSRF.
- **Rate limiting login:** maks 5x gagal berturut-turut per `memberId` dalam 15 menit → lockout, dicek lewat tabel `LoginAttempt` (bukan in-memory, konsisten saat serverless restart).
- **RBAC di middleware** (`src/middleware.ts`) — cek role dari JWT payload sebelum request sampai ke handler; ANGGOTA akses endpoint admin → 403 sebelum query DB.
- Validasi input di setiap API route (Zod) — cegah data invalid masuk DB.
- **Audit log append-only** — tidak ada DELETE/PATCH untuk `audit_logs`.
- HTTPS wajib (otomatis via Vercel). Environment variables di Vercel Environment Variables, tidak pernah di-commit ke repo.
- Gunakan Supabase connection pooler URL untuk `DATABASE_URL` (bukan direct connection) — hindari habisnya koneksi di serverless.

## Task Reference

Sumber breakdown kerja: `.agents/3-TASKS.md` — 39 task dengan urutan dependensi:

**Setup (T-01–T-06) → Auth (T-07–T-14, termasuk bootstrap admin FR-22) → Member (T-15–T-19) → Payment (T-20–T-22) → Expense (T-23–T-26) → Dashboard (T-27–T-30) → Reports (T-31–T-34) → Testing (T-35–T-37) → Deployment (T-38–T-39)** — plus **Modul R** (FASE-REDESIGN-1/2/3, UI overhaul Neo-Brutalism V2.2, selesai 2026-09-02).

Status: T-01 s.d. T-37 + Modul R + design-review batch fix SEMUA DONE. Sisa T-38–T-39 (Deployment).

## Progress

Update terakhir: 2026-09-02 — UI overhaul Neo-Brutalism V2.2 (Modul R) selesai penuh + design review batch fix (2 MAYOR + 4 MINOR + 7 NIT). Detail state, keputusan & history: `.agents/HANDOFF.md`.

- **Done:** T-01 s.d. T-37 (semua modul fungsional) + Modul R FASE-REDESIGN-1/2/3 (UI V2.2: 7 halaman + komponen atomik + cleanup token V1.0) + design review fix (keyboard roster MemberCard, ikon lucide BottomNav, toast error coral, header /pembayaran green, touch target ≥44px, prefix +62 login, shake error, drawer 200ms, dsb. — detail di HANDOFF.md bagian UI). Verifikasi terakhir: tsc clean, vitest **138/138** (27 files), E2E **10/10** (4 spec, re-run pasca design fix). PRD kini V1.1 (FR-06 Speed-Tap).
- **Design doc:** `.agents/3-DESIGN.md` sudah disinkronkan dengan amendemen 2026-09-02 (header 5.7, toast 5.8, progress 5.5, aksesibilitas §7, token §8) — mockup ground truth KECUALI amendemen bertanggal di dokumen.
- **Next (satu-satunya sisa):** T-38–T-39 Deployment.
- **Env notes:** `.env` (Prisma CLI) + `.env.local` (Next runtime) wajib sinkron. DIRECT_URL pakai session-mode pooler port 5432 (host direct Supabase IPv6-only di mesin dev). Test DB terisolasi: Docker `kassurs-test-db` (postgres:17-alpine, port 5433, user postgres, pass kassurs_test) — `docker start kassurs-test-db` sebelum `npm run test`; E2E juga pakai DB ini (override di webServer playwright.config). Migrations: s.d. `20260901053211_report_snapshots`.

## Gotchas (temuan Modul 0–5 — jangan pelajari ulang)

1. **Prisma CLI 5 baca `.env`, bukan `.env.local`** — dua file wajib ada & sinkron; `.env` ter-cover .gitignore.
2. **Host direct Supabase IPv6-only** di mesin dev — `db.*.supabase.co` tidak resolve. `DIRECT_URL` pakai session-mode pooler port 5432 (user `postgres.<ref>`); runtime tetap pooler 6543 via `DATABASE_URL`. Samakan pola di Vercel.
3. **`vitest.config` harus `.mts`** — `.ts` gagal ESM-in-CJS di Vitest 4.
4. **Playwright chromium sudah ter-install (T-37)** — e2e spawn dev server sendiri port 3100 dengan `DATABASE_URL` override ke test DB 5433 (`reuseExistingServer: false` — jangan reuse server 3100 lain yang baca dev DB). `expect.timeout` 15s karena cold-compile route Next dev-mode.
5. **tsconfig target es5** → no top-level await di test; pakai `beforeAll` + dynamic import (pattern: `tests/integration/login.test.ts`).
6. **Test lockout `LoginAttempt`**: `deleteMany` riwayat member dulu sebelum scenario — insert historis langsung ke DB bisa salah urutan kronologis.
7. **Port 3000 dipakai project lain** di mesin dev — start KasSurs dengan `npm run dev -- -p 3100`.
8. **Tes manual endpoint pakai `curl.exe`** — PowerShell `Invoke-WebRequest` menelan header Cookie. DAN **JSON body curl wajib via file** (`--data "@file.json"`) — inline `-d "{...}"` di PowerShell dirusak escaping → server terima null.
9. **Test paralel tabrakan noHp unique — SKEMA BARU: salt per-file** (pengganti alokasi digit lama yang terbukti bocor). Setiap file test integration menambahkan 1 char salt unik ke `uniq`: `const uniq = String(Date.now()) + "x"` — terpakai: a=members, b=payments, c=payments-patch, d=members-patch, e=members-deactivate, f=expenses, g=login, h=audit, i=expenses-patch, j=dashboard, k=reports, l=lockout-e2e, m=race-payments, n=race-categories, o=expenses-p2003, p=expenses-edge, q=summary-empty-db, r=summary-race, s=report-race, t=members-reactivate. File baru pakai huruf berikutnya. Salt membuat noHp/nama antar file mustahil identik walau `Date.now()` sama — semua `slice(-N)` tetap bekerja. (Suite kini serial + DB terisolasi, jadi salt murni kebersihan data — tetap wajib.)
10. **Test tamper JWT**: flip char TERAKHIR signature base64url tidak merusak decode (bit terbuang) — wajib flip char TENGAH signature.
11. **Kontrak tanggal Payment/Expense = date-only `YYYY-MM-DD`** (lebih sempit dari ISO 8601 general; datetime ditolak 400 — silent-truncate lebih buruk). Frontend pakai `<input type="date">`.
12. **`Date.parse` TIDAK menolak tanggal kalender invalid** — `"2026-02-30"` lolos regex + NaN check (V8 silent rollover → Mar 2). Validasi date-only WAJIB pakai roundtrip: `new Date(s).toISOString().slice(0,10) === s` (temuan oracle T-24; sudah dipasang di POST payments/expenses + PATCH payments/expenses — jangan regressed).
13. **Cleanup test member manual via node script**: `LoginAttempt` FK (`login_attempts_member_id_fkey`) menghalangi `member.delete` — hapus `loginAttempt` dulu, lalu `auditLog`, baru member. Script node inline `-e` dengan `$disconnect` dirusak escaping PowerShell — tulis file `.js` di project root, jalankan, hapus.
14. **Test agregat endpoint summary — KONTEKS BERUBAH (2026-09-01):** suite kini serial (`fileParallelism: false`) + DB test terisolasi (Docker 5433) — interferensi antar-worker MATI. Pattern defensif `tests/integration/dashboard.test.ts` (identity-key snapshot, retry non-masking, testTimeout 90000, beforeAll `Promise.all`, admin-sesi via claim JWT ADMIN + role DB ANGGOTA agar tak ganggu hitungan LAST_ADMIN file lain) tetap dipertahankan. Query localhost Docker jauh lebih cepat dari pooler Supabase — timeout 90000 kini longgar berlebih, tidak perlu diperketat.
15. **Edit file dokumen/config via tool edit, JANGAN regex node one-liner dari PowerShell** — `$1` diinterpolasi PowerShell jadi kosong → konten file terkorup senyap (insiden M4 3-TASKS.md). Regex sederhana pun pakai `edit` tool.
