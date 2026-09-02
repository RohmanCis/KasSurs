# TASKS: KasSurs

**Versi:** 1.1 (2026-09-02 — status sync pasca FASE-REDESIGN-3)
**Lokasi File:** `.agents/3-TASKS.md`
**Dependensi:** `.agents/1-PRD.md`, `.agents/2-TECH-SPEC.md`, `.agents/3-DESIGN.md`
**Skenario:** Project baru (tidak ada boilerplate) + Tech Spec lengkap â†’ mulai dari T-01 Setup Project
**Prioritas pengerjaan:** Semua modul sekaligus, end-to-end

---

## Modul 0: Setup Project

### T-01
- **Judul:** Inisialisasi Project Next.js + TypeScript + Tailwind
- **Deskripsi:** Setup project Next.js 14 (App Router) dengan TypeScript, Tailwind CSS, ESLint. Buat struktur folder sesuai Tech Spec Bagian 1 (`src/app`, `src/components`, `src/lib`, `prisma`, `tests`).
- **Modul:** Setup
- **Prioritas:** High
- **Status:** Done
- **Dependensi:** -
- **Tanggal:** 2026-08-30
- **Estimasi:** 1 jam
- **File yang diubah:** `package.json`, `tsconfig.json`, `tailwind.config.ts`, `next.config.js`, struktur folder `src/`

### T-02
- **Judul:** Setup Prisma + Koneksi Supabase Postgres
- **Deskripsi:** Install Prisma, buat `schema.prisma` sesuai Tech Spec Bagian 2 (Member, Payment, Expense, Category, AuditLog, LoginAttempt). Konfigurasi `DATABASE_URL` (pooler) dan `DIRECT_URL` (migration) untuk Supabase.
- **Modul:** Setup
- **Prioritas:** High
- **Status:** Done
- **Dependensi:** T-01
- **Tanggal:** 2026-08-30
- **Estimasi:** 1.5 jam
- **File yang diubah:** `prisma/schema.prisma`, `.env.local`, `.env.example`

### T-03
- **Judul:** Jalankan Migration Awal + Setup Prisma Client Singleton
- **Deskripsi:** Jalankan `prisma migrate dev` untuk membuat seluruh tabel di database. Buat `src/lib/prisma.ts` sebagai singleton client (hindari multiple connection di dev mode Next.js hot-reload).
- **Modul:** Setup
- **Prioritas:** High
- **Status:** Done
- **Dependensi:** T-02
- **Tanggal:** 2026-08-30
- **Estimasi:** 0.5 jam
- **File yang diubah:** `prisma/migrations/`, `src/lib/prisma.ts`

### T-04
- **Judul:** Setup Design Tokens (CSS Variables) sesuai DESIGN.md
- **Deskripsi:** Implementasikan color tokens (OKLCH), font (Plus Jakarta Sans via `next/font/google`), spacing scale ke `globals.css` dan `tailwind.config.ts` sesuai DESIGN.md Bagian 2-4.
- **Modul:** Setup
- **Prioritas:** Mid
- **Status:** Done
- **Dependensi:** T-01
- **Tanggal:** 2026-08-30
- **Estimasi:** 1 jam
- **File yang diubah:** `src/app/globals.css`, `tailwind.config.ts`, `src/app/layout.tsx`

### T-05
- **Judul:** Setup Vitest + Playwright
- **Deskripsi:** Install & konfigurasi Vitest (unit + integration) dan Playwright (E2E). Buat struktur folder `tests/unit`, `tests/integration`, `tests/e2e` sesuai Tech Spec Bagian 5. Setup test database terpisah untuk integration test.
- **Modul:** Setup
- **Prioritas:** Mid
- **Status:** Done
- **Dependensi:** T-03
- **Tanggal:** 2026-08-30
- **Estimasi:** 1.5 jam
- **File yang diubah:** `vitest.config.ts`, `playwright.config.ts`, `tests/` (struktur folder), `package.json` (scripts)

### T-06
- **Judul:** Definisikan API Contract Types
- **Deskripsi:** Buat `src/lib/types.ts` berisi seluruh interface TypeScript (LoginRequest, MemberDTO, PaymentDTO, ExpenseDTO, dst.) persis sesuai Tech Spec Bagian 3 â€” kontrak ini dipakai bersama oleh seluruh task endpoint berikutnya, wajib dibuat lebih dulu agar tidak ada penamaan field yang tidak konsisten.
- **Modul:** Setup
- **Prioritas:** High
- **Status:** Done
- **Dependensi:** T-01
- **Tanggal:** 2026-08-30
- **Estimasi:** 0.5 jam
- **File yang diubah:** `src/lib/types.ts`

---

## Modul 1: Autentikasi (FR-01, FR-02, FR-18, FR-19, FR-20, FR-22)

### T-07
- **Judul:** Implementasi Helper Hash & Verifikasi PIN
- **Deskripsi:** Buat wrapper bcrypt untuk hash PIN (salt rounds 10) dan fungsi verifikasi. Unit test wajib untuk memastikan hash tidak reversible dan verifikasi benar/salah bekerja.
- **Modul:** Auth
- **Prioritas:** High
- **Status:** Done
- **Dependensi:** T-03, T-06
- **Tanggal:** 2026-08-30
- **Estimasi:** 1 jam
- **File yang diubah:** `src/lib/auth.ts`, `tests/unit/auth.test.ts`

### T-08
- **Judul:** Implementasi JWT Sign/Verify + Session Cookie
- **Deskripsi:** Buat fungsi generate JWT (payload: memberId, role) dan verifikasi. Set sebagai httpOnly, secure, sameSite=strict cookie dengan expiry 30 hari sesuai PRD NFR. **Amendemen 2026-09-01 (sliding session):** expiry 30 hari dihitung dari request terakhir yang lolos autentikasi — re-issue token oleh middleware T-12 saat sisa < 15 hari (lihat Tech Spec Bagian 4 "Alur Sliding Session"); fixed-expiry saat login tetap berlaku sebagai titik awal.
- **Modul:** Auth
- **Prioritas:** High
- **Status:** Done
- **Dependensi:** T-07
- **Tanggal:** 2026-08-30
- **Estimasi:** 1.5 jam
- **File yang diubah:** `src/lib/auth.ts`

### T-09
- **Judul:** Implementasi Rate Limiting Login (LoginAttempt)
- **Deskripsi:** Buat helper yang query tabel `LoginAttempt` untuk hitung percobaan gagal berturut-turut dalam window 15 menit per `memberId`. Return status locked/tidak locked sesuai FR-18.
- **Modul:** Auth
- **Prioritas:** High
- **Status:** Done
- **Dependensi:** T-03
- **Tanggal:** 2026-08-30
- **Estimasi:** 1.5 jam
- **File yang diubah:** `src/lib/rate-limit.ts`, `tests/unit/rate-limit.test.ts`

### T-10
- **Judul:** Endpoint POST /api/auth/login
- **Deskripsi:** Implementasi login: cek lockout (T-09) â†’ verifikasi PIN (T-07) â†’ catat LoginAttempt â†’ generate JWT cookie (T-08) jika sukses. Response sesuai `LoginResponse`/`LoginErrorResponse` di types.ts.
- **Modul:** Auth
- **Prioritas:** High
- **Status:** Done
- **Dependensi:** T-07, T-08, T-09, T-06
- **Tanggal:** 2026-08-30
- **Estimasi:** 1.5 jam
- **File yang diubah:** `src/app/api/auth/login/route.ts`
- **Acceptance Criteria:**
  - Login sukses dengan kredensial benar â†’ cookie ter-set, response 200 dengan role & memberId
  - Login gagal â†’ LoginAttempt tercatat, response 401 dengan error INVALID_CREDENTIALS
  - 5x gagal berturut-turut â†’ response 429 dengan error ACCOUNT_LOCKED

### T-11
- **Judul:** Endpoint POST /api/auth/logout
- **Deskripsi:** Hapus session cookie.
- **Modul:** Auth
- **Prioritas:** Mid
- **Status:** Done
- **Dependensi:** T-08
- **Tanggal:** 2026-08-30
- **Estimasi:** 0.5 jam
- **File yang diubah:** `src/app/api/auth/logout/route.ts`

### T-12
- **Judul:** Middleware RBAC (Role-Based Access Control)
- **Deskripsi:** Implementasi `src/middleware.ts` â€” validasi JWT dari cookie, cek role sebelum request sampai ke handler. Anggota yang akses endpoint admin-only ditolak 403 sebelum query database dijalankan (FR-20). **Amendemen 2026-09-01 (sliding session):** middleware juga jadi titik re-issue token (exp baru +30 hari) saat sisa masa berlaku < 15 hari â€" detail di Tech Spec Bagian 4 "Alur Sliding Session".
- **Modul:** Auth
- **Prioritas:** High
- **Status:** Done
- **Dependensi:** T-08
- **Tanggal:** 2026-08-30
- **Estimasi:** 1.5 jam
- **File yang diubah:** `src/middleware.ts`
- **Acceptance Criteria:**
  - Role ANGGOTA mengakses `/api/members` (POST/PATCH) â†’ 403
  - Role ADMIN mengakses seluruh endpoint â†’ lolos ke handler
  - Tidak ada cookie/JWT invalid â†’ redirect ke `/login`

### T-13
- **Judul:** Halaman Login (UI)
- **Deskripsi:** Buat `src/app/(auth)/login/page.tsx` â€” form No HP + PIN sesuai DESIGN.md. Handle error state (salah PIN, lockout) dengan pesan jelas.
- **Modul:** Auth
- **Prioritas:** High
- **Status:** Done
- **Dependensi:** T-10, T-04
- **Tanggal:** 2026-08-30
- **Estimasi:** 2 jam
- **File yang diubah:** `src/app/(auth)/login/page.tsx`, `src/components/forms/LoginForm.tsx`

### T-14
- **Judul:** Seed Script â€” Akun Admin Pertama & Kategori Default (FR-22)
- **Deskripsi:** Buat `prisma/seed.ts` â€” baca `SEED_ADMIN_PHONE`/`SEED_ADMIN_PIN` dari env var, hash PIN, buat 1 Member role=ADMIN (idempotent â€” skip jika sudah ada admin). Seed kategori default (Konsumsi, Acara, ATK, Sumbangan, Lain-lain).
- **Modul:** Auth
- **Prioritas:** High
- **Status:** Done
- **Dependensi:** T-07, T-03
- **Tanggal:** 2026-08-30
- **Estimasi:** 1 jam
- **File yang diubah:** `prisma/seed.ts`, `package.json` (prisma seed config)
- **Acceptance Criteria:**
  - Seed pertama kali â†’ 1 admin + 5 kategori default tercipta
  - Seed dijalankan ulang â†’ tidak membuat admin duplikat (idempotent check FR-22)

---

## Modul 2: Manajemen Anggota (FR-03, FR-04, FR-05)

### T-15
- **Judul:** Helper Audit Log (Reusable)
- **Deskripsi:** Buat `src/lib/audit.ts` â€” fungsi `recordAuditLog(actorId, aksi, entityType, entityId, dataLama, dataBaru)` yang dipanggil di setiap endpoint create/update/delete Payment/Expense (FR-21, wajib). Dibuat sekali di sini agar dipakai reusable di seluruh endpoint modul lain.
- **Modul:** Member
- **Prioritas:** High
- **Status:** Done
- **Dependensi:** T-03, T-06
- **Tanggal:** 2026-08-30
- **Estimasi:** 1 jam
- **File yang diubah:** `src/lib/audit.ts`, `tests/unit/audit.test.ts`

### T-16
- **Judul:** Endpoint GET & POST /api/members
- **Deskripsi:** GET: fetch seluruh anggota aktif sekaligus (client-side filter, tanpa parameter search di server â€” sesuai kesepakatan performa), sertakan status bayar jika `bulan`/`tahun` diisi. POST: tambah anggota baru (FR-03), validasi No HP unik, hash PIN, role default ANGGOTA.
- **Modul:** Member
- **Prioritas:** High
- **Status:** Done
- **Dependensi:** T-07, T-12, T-06
- **Tanggal:** 2026-08-30
- **Estimasi:** 2 jam
- **File yang diubah:** `src/app/api/members/route.ts`
- **Acceptance Criteria:**
  - GET tanpa query â†’ list seluruh anggota aktif
  - GET dengan `?bulan=&tahun=` â†’ tiap anggota punya field `statusBayarBulanIni`
  - POST dengan No HP sudah terdaftar â†’ ditolak dengan error jelas

### T-17
- **Judul:** Endpoint PATCH /api/members/[id] (Update & Reset Akses)
- **Deskripsi:** Update data anggota, termasuk reset PIN/No HP oleh admin (FR-02).
- **Modul:** Member
- **Prioritas:** Mid
- **Status:** Done
- **Dependensi:** T-16
- **Tanggal:** 2026-08-30
- **Estimasi:** 1 jam
- **File yang diubah:** `src/app/api/members/[id]/route.ts`

### T-18
- **Judul:** Endpoint PATCH /api/members/[id]/deactivate
- **Deskripsi:** Nonaktifkan anggota (soft, ubah `statusAktif=false`, bukan hapus). Wajib cek proteksi last-admin: tolak 403 jika target ADMIN dan satu-satunya admin aktif (FR-04).
- **Modul:** Member
- **Prioritas:** Mid
- **Status:** Done
- **Dependensi:** T-16
- **Tanggal:** 2026-08-30
- **Estimasi:** 1 jam
- **File yang diubah:** `src/app/api/members/[id]/deactivate/route.ts`
- **Acceptance Criteria:**
  - Nonaktifkan anggota biasa â†’ berhasil, data historis tetap ada
  - Nonaktifkan satu-satunya admin aktif â†’ ditolak 403

### T-19
- **Judul:** Halaman Manajemen Anggota (Admin) â€” List & Form Tambah/Edit
- **Deskripsi:** UI daftar anggota (FR-05) dengan status aktif/nonaktif, form tambah anggota baru, aksi nonaktifkan & reset akses.
- **Modul:** Member
- **Prioritas:** Mid
- **Status:** Done
- **Dependensi:** T-16, T-17, T-18, T-04
- **Tanggal:** 2026-08-30
- **Estimasi:** 3 jam
- **File yang diubah:** `src/app/(admin)/anggota/page.tsx`, `src/components/forms/MemberForm.tsx`

---

## Modul 3: Kas Masuk / Pembayaran (FR-06, FR-07, FR-21)

### T-20
- **Judul:** Endpoint GET & POST /api/payments
- **Deskripsi:** GET: list pembayaran dengan filter bulan/tahun/memberId/status. POST: catat pembayaran baru â€” validasi constraint unique `[memberId, bulan, tahun]` di server (lapisan kedua setelah client-side check), return `409 ALREADY_PAID` jika duplikat. Panggil `recordAuditLog` (T-15) setelah create sukses.
- **Modul:** Payment
- **Prioritas:** High
- **Status:** Done
- **Dependensi:** T-15, T-16, T-06, T-12
- **Tanggal:** 2026-08-30
- **Estimasi:** 2.5 jam
- **File yang diubah:** `src/app/api/payments/route.ts`
- **Acceptance Criteria:**
  - POST payment baru â†’ tersimpan + AuditLog CREATE tercatat
  - POST payment untuk member yang sudah lunas bulan itu â†’ 409 dengan `PaymentConflictResponse`
  - GET dengan filter kombinasi (bulan+tahun+status) â†’ hasil sesuai filter

### T-21
- **Judul:** Endpoint PATCH & DELETE /api/payments/[id]
- **Deskripsi:** Edit/hapus data pembayaran (koreksi kesalahan admin). Ambil snapshot data lama sebelum update, panggil `recordAuditLog` dengan aksi UPDATE/DELETE (dataLama + dataBaru).
- **Modul:** Payment
- **Prioritas:** Mid
- **Status:** Done
- **Dependensi:** T-20
- **Tanggal:** 2026-08-30
- **Estimasi:** 1.5 jam
- **File yang diubah:** `src/app/api/payments/[id]/route.ts`
- **Acceptance Criteria:** Setiap PATCH/DELETE menghasilkan 1 entry AuditLog dengan dataLama terisi benar

### T-22
- **Judul:** Halaman Catat Pembayaran (Admin) â€” Search-Select + Form
- **Deskripsi:** Implementasi alur 7-langkah sesuai DESIGN.md Bagian 5.4: fetch sekali 30 anggota, search-select client-side, sorting "Belum Bayar" duluan, form expand in-place, toast sukses dengan aksi "Input Lagi" (bukan auto-reset).
- **Modul:** Payment
- **Prioritas:** High
- **Status:** Done
- **Dependensi:** T-20, T-16, T-04
- **Tanggal:** 2026-08-30
- **Estimasi:** 3 jam
- **File yang diubah:** `src/app/(admin)/pembayaran/page.tsx`, `src/components/forms/PaymentForm.tsx`, `src/components/forms/MemberSearchSelect.tsx`
- **Catatan (2026-09-02):** Implementasi V1.0 DIGANTIKAN TOTAL oleh FASE-REDESIGN-3 (alur Speed-Tap 1-tap + drawer rapel, PRD FR-06 V1.1). `PaymentForm.tsx` & `MemberSearchSelect.tsx` DIHAPUS saat cleanup. Status tetap Done (implementasi V1.0 berjalan penuh sebelum redesign).
- **Acceptance Criteria:** Sesuai 7 langkah alur di DESIGN.md 5.4 â€” termasuk client-side reject sebelum submit jika sudah lunas

---

## Modul 4: Kas Keluar / Pengeluaran (FR-09, FR-10, FR-11, FR-21)

### T-23
- **Judul:** Endpoint GET & POST /api/categories
- **Deskripsi:** GET list kategori (default + custom). POST tambah kategori baru (FR-10).
- **Modul:** Expense
- **Prioritas:** Mid
- **Status:** Done
- **Dependensi:** T-06, T-12
- **Tanggal:** 2026-08-30
- **Estimasi:** 1 jam
- **File yang diubah:** `src/app/api/categories/route.ts`

### T-24
- **Judul:** Endpoint GET & POST /api/expenses
- **Deskripsi:** GET list pengeluaran dengan filter kategori/periode. POST catat pengeluaran baru (validasi jumlah > 0), panggil `recordAuditLog`.
- **Modul:** Expense
- **Prioritas:** High
- **Status:** Done
- **Dependensi:** T-15, T-23, T-06, T-12
- **Tanggal:** 2026-08-30
- **Estimasi:** 2 jam
- **File yang diubah:** `src/app/api/expenses/route.ts`

### T-25
- **Judul:** Endpoint PATCH & DELETE /api/expenses/[id]
- **Deskripsi:** Edit/hapus data pengeluaran, dengan audit log (sama pola dengan T-21).
- **Modul:** Expense
- **Prioritas:** Mid
- **Status:** Done
- **Dependensi:** T-24
- **Tanggal:** 2026-08-30
- **Estimasi:** 1.5 jam
- **File yang diubah:** `src/app/api/expenses/[id]/route.ts`

### T-26
- **Judul:** Halaman Catat Pengeluaran (Admin)
- **Deskripsi:** Implementasi alur sesuai DESIGN.md — dropdown native kategori (bukan search-select, karena item sedikit), form deskripsi/jumlah/tanggal, toast sukses dengan "Input Lagi".
- **Modul:** Expense
- **Prioritas:** High
- **Status:** Done
- **Dependensi:** T-24, T-23, T-04
- **Tanggal:** 2026-08-30
- **Estimasi:** 2 jam
- **File yang diubah:** `src/app/(admin)/pengeluaran/page.tsx`, `src/components/forms/ExpenseForm.tsx`
- **Catatan (2026-09-02):** Dropdown native kategori DIGANTI horizontal chip pills oleh FASE-REDESIGN-3 (PRD FR-09 V1.1). Perilaku submit/validasi/"Input Lagi" tetap.

---

## Modul 5: Dashboard & Filtering (FR-12, FR-13, FR-14)

### T-27
- **Judul:** Endpoint GET /api/dashboard/summary
- **Deskripsi:** Hitung saldo real-time (`SUM(Payment) - SUM(Expense)`), ringkasan bulan berjalan. Response berbeda untuk role ADMIN (detail + jumlahBelumBayar) vs ANGGOTA (ringkasan umum saja) sesuai FR-14.
- **Modul:** Dashboard
- **Prioritas:** High
- **Status:** Done
- **Dependensi:** T-20, T-24, T-12, T-06
- **Tanggal:** 2026-08-30
- **Estimasi:** 1.5 jam
- **File yang diubah:** `src/app/api/dashboard/summary/route.ts`
- **Acceptance Criteria:** Anggota yang request endpoint ini hanya menerima ringkasan umum, tidak ada data anggota lain

### T-28
- **Judul:** Halaman Dashboard Admin
- **Deskripsi:** Saldo real-time (angka besar, tabular-nums sesuai DESIGN.md), ringkasan masuk/keluar bulan berjalan, bottom navigation 4 tab.
- **Modul:** Dashboard
- **Prioritas:** High
- **Status:** Done
- **Dependensi:** T-27, T-04
- **Tanggal:** 2026-08-30
- **Estimasi:** 2 jam
- **File yang diubah:** `src/app/(admin)/dashboard/page.tsx`, `src/components/dashboard/SaldoCard.tsx`
- **Catatan (2026-09-02):** `SaldoCard.tsx` DIHAPUS saat FASE-3 cleanup — diganti `TreasuryHero.tsx` (FASE-REDESIGN-2). BottomNav kini 5 tab (bukan 4).

### T-29
- **Judul:** Halaman Status Anggota (View-Only)
- **Deskripsi:** Single-page scroll: status pembayaran pribadi per bulan (badge Lunas/Belum) + ringkasan saldo umum, sesuai FR-14. Tidak ada aksi edit sama sekali.
- **Modul:** Dashboard
- **Prioritas:** High
- **Status:** Done
- **Dependensi:** T-27, T-04
- **Tanggal:** 2026-08-30
- **Estimasi:** 1.5 jam
- **File yang diubah:** `src/app/(member)/status/page.tsx`

### T-30
- **Judul:** Komponen Filter & Tabel Transaksi (Reusable)
- **Deskripsi:** Komponen tabel dengan zebra-stripe, badge status, filter bulan/tahun/kategori/status (FR-13) â€” dipakai di halaman Pembayaran, Pengeluaran, dan Laporan.
- **Modul:** Dashboard
- **Prioritas:** Mid
- **Status:** Done
- **Dependensi:** T-04
- **Tanggal:** 2026-08-30
- **Estimasi:** 2.5 jam
- **File yang diubah:** `src/components/ui/DataTable.tsx`, `src/components/ui/FilterBar.tsx`, `src/components/ui/StatusBadge.tsx`
- **Catatan (2026-09-02):** `DataTable.tsx` & `StatusBadge.tsx` DIHAPUS saat FASE-3 cleanup (DataTable tak pernah punya konsumen; StatusBadge diganti pill neo inline; type `StatusBadgeStatus` dipindah ke FilterBar.tsx). FilterBar tetap hidup — dipakai /laporan (restyle neo + `testIdPrefix`).

---

## Modul 6: Pelaporan & Export (FR-15, FR-16, FR-17)

### T-31
- **Judul:** Helper Export PDF (jsPDF)
- **Deskripsi:** Fungsi generate PDF laporan (ringkasan kas masuk/keluar/saldo) berdasarkan periode, sesuai FR-15.
- **Modul:** Reports
- **Prioritas:** Mid
- **Status:** Done
- **Dependensi:** T-06
- **Tanggal:** 2026-08-30
- **Estimasi:** 2 jam
- **File yang diubah:** `src/lib/export/pdf.ts`

### T-32
- **Judul:** Helper Export Excel (SheetJS)
- **Deskripsi:** Fungsi generate file Excel (.xlsx) berisi data mentah transaksi berdasarkan periode, sesuai FR-16.
- **Modul:** Reports
- **Prioritas:** Mid
- **Status:** Done
- **Dependensi:** T-06
- **Tanggal:** 2026-08-30
- **Estimasi:** 1.5 jam
- **File yang diubah:** `src/lib/export/excel.ts`

### T-33
- **Judul:** Endpoint GET /api/reports/pdf & /api/reports/excel
- **Deskripsi:** Endpoint export periode bulan/tahun (FR-17, default bulan berjalan) dengan **semantik snapshot FR-23**: cek `ReportSnapshot` [bulan, tahun] — ada → render dari payload beku; tidak ada → hitung live (semantik T-27: masuk accrual, keluar cash-flow) + simpan snapshot + render. `?regenerate=true` → hitung ulang + upsert. Generate file via T-31/T-32, return sebagai file download. PDF & Excel bersumber satu snapshot. Perlu migration tabel `report_snapshots` (model di Tech Spec Bagian 2).
- **Modul:** Reports
- **Prioritas:** Mid
- **Status:** Done
- **Dependensi:** T-31, T-32, T-20, T-24, T-12
- **Tanggal:** 2026-08-30
- **Estimasi:** 1.5 jam
- **File yang diubah:** `src/app/api/reports/pdf/route.ts`, `src/app/api/reports/excel/route.ts`

### T-34
- **Judul:** Halaman Laporan (Admin)
- **Deskripsi:** UI pilih periode + tombol export PDF/Excel.
- **Modul:** Reports
- **Prioritas:** Mid
- **Status:** Done
- **Dependensi:** T-33, T-04
- **Tanggal:** 2026-08-30
- **Estimasi:** 1.5 jam
- **File yang diubah:** `src/app/(admin)/laporan/page.tsx`

---

## Modul 7: Testing & Verifikasi

### T-35
- **Judul:** Integration Test — Auth & RBAC + Batch Race/Edge
- **Deskripsi:** Test login sukses/gagal/lockout (T-10), test middleware RBAC menolak anggota di endpoint admin (T-12), sliding session.
- **Modul:** Testing
- **Prioritas:** High
- **Status:** Done
- **Dependensi:** T-10, T-12
- **Tanggal:** 2026-09-01
- **Estimasi:** 1.5 jam
- **File yang diubah:** `tests/unit/{auth,jwt-confusion,rate-limit,sliding-session}.test.ts`, `tests/integration/{login,lockout-e2e,dashboard,summary-empty-db,summary-race,race-payments,race-categories,report-race}.test.ts` + file race/edge lainnya (batch Modul 7 — 7 file 12 case: P2002 race, P2003, expenses-edge, snapshot race)
- **Catatan (2026-09-01):** LUNAS penuh + bug nyata fixed: race export pertama `src/lib/report-snapshot.ts` — `pg_advisory_xact_lock` per (bulan,tahun) + re-check post-lock.

### T-36
- **Judul:** Integration Test — Payment (Constraint & Audit Log)
- **Deskripsi:** Test POST payment sukses, test 409 saat duplikat, test AuditLog benar-benar tercatat setiap create/update/delete.
- **Modul:** Testing
- **Prioritas:** High
- **Status:** Done
- **Dependensi:** T-20, T-21
- **Tanggal:** 2026-08-30
- **Estimasi:** 1.5 jam
- **File yang diubah:** - (review gap — semua acceptance criteria sudah tercakup test existing)
- **Catatan (2026-09-01):** Review coverage, TANPA test baru — tidak ada gap nyata. Bukti: POST sukses + audit CREATE (`payments.test.ts` "sukses → 201, record tersimpan, audit CREATE"), 409 duplikat exact kontrak (`payments.test.ts` + PATCH 409 `payments-patch.test.ts` + race P2002 `race-payments.test.ts`), audit UPDATE/DELETE Payment (`payments-patch.test.ts` dataLama/dataBaru benar), audit CREATE/UPDATE/DELETE Expense (`expenses.test.ts`, `expenses-patch.test.ts`), audit transaksional & rollback (`audit.test.ts`). Tambah coverage = over-engineering (Tech Spec Bagian 5: alur kritikal saja).

### T-37
- **Judul:** E2E Smoke Test — 3 Alur Kritikal
- **Deskripsi:** Playwright test: (1) login admin & anggota, (2) catat pembayaran end-to-end, (3) export laporan PDF/Excel. Sesuai Tech Spec Bagian 5 Strategi Testing.
- **Modul:** Testing
- **Prioritas:** Mid
- **Status:** Done
- **Dependensi:** T-13, T-22, T-34
- **Tanggal:** 2026-08-30
- **Estimasi:** 2.5 jam
- **File yang diubah:** `tests/e2e/login.spec.ts`, `tests/e2e/catat-pembayaran.spec.ts`, `tests/e2e/export-laporan.spec.ts` (+ `tests/e2e/helpers.ts`, `playwright.config.ts`)
- **Catatan (2026-09-01):** 4 test / 3 alur, all pass (2× run penuh + 1× solo). Config: baseURL port 3100, webServer spawn dev server sendiri dengan `DATABASE_URL` di-override ke Docker test DB 5433 (e2e mutasi data — dev DB tidak tersentuh), `reuseExistingServer: false`, `expect.timeout` 15s (cold-compile route dev-mode > default 5s — sumber 1 fail run pertama). Chromium ter-install. Root "/" masih stub → spec goto /dashboard & /status eksplisit setelah login.
- **Catatan update (2026-09-02, FASE-REDESIGN-3):** 3 spec di-update ke UI Neo V2.2 (login PIN 6-box per-box, catat-pembayaran → alur Speed-Tap 1-tap roster, export selector baru) + spec baru `tests/e2e/speed-tap.spec.ts` (6 test: undo BATALKAN, badge BARU L1+L2 survive reload, drawer edit PATCH/hapus, rapel cross-month 409 → drawer prefill, chip+search gabungan, long-press kartu LUNAS). **Kini 10/10 test.** Tombol aksi sonner tidak bisa diberi data-testid (limitasi API) — pakai `getByRole("button", { name: "BATALKAN" })`.

---

## Modul 8: Deployment

### T-38
- **Judul:** Setup Deployment Vercel + Environment Variables
- **Deskripsi:** Hubungkan repo ke Vercel, set environment variables (DATABASE_URL, DIRECT_URL, JWT_SECRET, SEED_ADMIN_PHONE, SEED_ADMIN_PIN), verifikasi auto-deploy dari branch `main`.
- **Modul:** Deployment
- **Prioritas:** High
- **Status:** Todo
- **Dependensi:** T-35, T-36
- **Tanggal:** 2026-08-30
- **Estimasi:** 1 jam
- **File yang diubah:** Vercel dashboard config (bukan file kode)

### T-39
- **Judul:** Jalankan Migration & Seed di Production
- **Deskripsi:** `prisma migrate deploy` + `prisma db seed` di environment production Supabase â€” buat akun admin pertama nyata.
- **Modul:** Deployment
- **Prioritas:** High
- **Status:** Todo
- **Dependensi:** T-38, T-14
- **Tanggal:** 2026-08-30
- **Estimasi:** 0.5 jam
- **File yang diubah:** -

---

## Modul R: UI Overhaul Neo-Brutalism V2.2 (2026-09-02)

> Penomoran FASE-REDESIGN-N terpisah dari T-01–T-39 (task V1) — tidak campur aduk. Ground truth visual: `.agents/kassurs_ui_neobrutalism_final.html`; spesifikasi: `.agents/3-DESIGN.md` V2.2 (termasuk 5.10 Mitigasi Salah-Tap + Collision Protocol — FINAL). Rencana 3 fase dari kickoff user.

### FASE-REDESIGN-1
- **Judul:** Fondasi Neo-Brutalism — dokumen, deps, tokens, font, toaster
- **Deskripsi:** Rewrite 3-DESIGN.md V2.2; install lucide-react/sonner/clsx/tailwind-merge/vaul; tailwind.config.ts additive (neo colors, shadow neo*, borderWidth 1.5/2.5/3, font Bricolage/JetBrains Mono); layout.tsx font + Toaster sonner neo. Audit ulang pasca mockup `_final.html` (sinkron nama file, 5.10 Speed-Tap+drawer, neo-surface alias, quoted keys, neo-xl 10px, nominal=Bricolage+tabular-nums).
- **Modul:** Redesign
- **Prioritas:** High
- **Status:** Done (2026-09-02, terverifikasi: 138/138, tsc clean, build 20/20; audit user PASS)
- **Dependensi:** T-37
- **Tanggal:** 2026-09-02
- **File yang diubah:** `.agents/3-DESIGN.md`, `package.json`, `tailwind.config.ts`, `src/app/layout.tsx`

### FASE-REDESIGN-2
- **Judul:** Komponen UI Atomik (extract dari mockup)
- **Deskripsi:** `src/components/ui/NeoButton.tsx` (varian semantik + press-down), `src/components/dashboard/TreasuryHero.tsx` (saldo tabular-nums + progress bar chunky), `src/components/dashboard/MemberCard.tsx` (roster card 72px sesuai DOM 5.10: nama truncate + badge BARU inline + ikon status; wajib ikuti collision protocol 5.10), `src/components/member/PassbookCard.tsx` (passbook + matriks 12 bulan). Props wajib patuh DTO `src/lib/types.ts`.
- **Modul:** Redesign
- **Prioritas:** High
- **Status:** Done (2026-09-02 — tsc clean, build pass, vitest 138/138; + `src/lib/utils.ts` `cn()` clsx+tailwind-merge; oracle fix: long-press gated `!lunas` di MemberCard)
- **Dependensi:** FASE-REDESIGN-1
- **Tanggal:** 2026-09-02
- **File yang diubah:** `src/lib/utils.ts`, `src/components/ui/NeoButton.tsx`, `src/components/dashboard/{TreasuryHero,MemberCard}.tsx`, `src/components/member/PassbookCard.tsx`

### FASE-REDESIGN-3
- **Judul:** Integrasi Halaman Mobile-First + Cleanup
- **Deskripsi:** Restyle /login (PIN 6-box, banner lockout), /dashboard & /pembayaran (TreasuryHero, filter chips, roster + optimistic UI + mitigasi salah-tap), /status (PassbookCard), /pengeluaran (voucher + chip pills kategori), /laporan (selector periode + download). Hapus token Tailwind/CSS var lama setelah semua halaman migrasi; update E2E Playwright selector/copy; amendemen PRD FR-06 (alur 1-tap) — utang dokumen.
- **Modul:** Redesign
- **Prioritas:** High
- **Status:** Done (2026-09-02)
- **Dependensi:** FASE-REDESIGN-2
- **Tanggal:** 2026-09-02
- **File yang diubah:** `src/app/**` 7 halaman (+/anggota — keputusan user, restyle sebelum cleanup), `src/components/{forms,layout,ui,payments}/**`, `src/app/globals.css` + `tailwind.config.ts` (token V1.0 dihapus), `tests/e2e/**`, `.agents/1-PRD.md` (V1.1), `.agents/2-TECH-SPEC.md` (alur + categories), `.agents/3-DESIGN.md` (5.10 amendemen)
- **Catatan (2026-09-02):** Eksekusi 4 langkah ber-gate user + 2 oracle review. 5 bug nyata ditemukan & fixed (long-press LUNAS gate; drawer cross-month 409 tak terbuka; PATCH cross-month→roster tak flip; badge BARU di kartu BELUM; todayISO UTC salah hari WIB). Verifikasi final: tsc clean, build pass, vitest 138/138 (27 files), E2E 10/10. Cleanup: 6 komponen mati dihapus, token OKLCH V1.0 bersih. Detail: `.agents/HANDOFF.md`.

### FASE-REDESIGN-4 (Design Review Batch Fix)
- **Judul:** Audit & fix pasca-Modul R (2 MAYOR + 4 MINOR + 7 NIT)
- **Deskripsi:** Review menyeluruh UI V2.2 vs 3-DESIGN.md + mockup oleh agent designer. MAYOR: keyboard akses roster MemberCard (`tabIndex` + Enter/Space + focus-visible); BottomNav ganti SVG inline → lucide-react. MINOR: toast error coral (sonner classNames per-status); header /pembayaran `bg-neo-green`; touch target ≥44px (chip, panah periode, LogoutButton); prefix "+62" login. NIT: dead ternary, `font-mono` badge meta, kontras passbook slate-600, border-r progress kondisional, BottomNav border-t-3 + tab press-down, keyframe shake 150ms, drawer vaul 200ms override. popIn badge BARU di-skip (opsional by spec).
- **Modul:** Redesign
- **Prioritas:** Medium
- **Status:** Done (2026-09-02 — tsc clean; E2E re-run user 10/10)
- **Dependensi:** FASE-REDESIGN-3
- **Tanggal:** 2026-09-02
- **File yang diubah:** `src/components/{dashboard/MemberCard,layout/BottomNav,member/PassbookCard,dashboard/TreasuryHero,ui/LogoutButton,forms/LoginForm,forms/ExpenseForm}.tsx`, `src/app/layout.tsx`, `src/app/globals.css`, `src/app/(admin)/{pembayaran,anggota}/page.tsx`, `src/app/(member)/status/page.tsx`, `.agents/{HANDOFF,3-DESIGN}.md` (sinkron amendemen)

---

## ðŸ“Š Ringkasan

| Modul | Jumlah Task | Estimasi Total |
|---|---|---|
| Setup | T-01 â€“ T-06 | ~6.5 jam |
| Auth | T-07 â€“ T-14 | ~11 jam |
| Member | T-15 â€“ T-19 | ~8 jam |
| Payment | T-20 â€“ T-22 | ~7 jam |
| Expense | T-23 â€“ T-26 | ~6.5 jam |
| Dashboard | T-27 â€“ T-30 | ~7.5 jam |
| Reports | T-31 â€“ T-34 | ~6.5 jam |
| Testing | T-35 â€“ T-37 | ~5.5 jam |
| Deployment | T-38 â€“ T-39 | ~1.5 jam |
| **Total** | **39 task** | **~60 jam** (perkiraan kasar, asumsi 1 developer/agent fokus penuh, belum termasuk waktu review manual per task) |

**Catatan estimasi:** [Low confidence] â€” angka jam adalah perkiraan kasar berbasis kompleksitas task tertulis, bukan hasil pengukuran nyata. Kecepatan aktual sangat bergantung pada seberapa lancar agent bekerja tanpa perlu banyak koreksi, dan seberapa detail review yang dilakukan tiap task selesai.

## ðŸ”„ Status
Task list ini disusun dari `.agents/2-TECH-SPEC.md` yang sudah lengkap (API contract types + testing strategy), sehingga tiap task punya kontrak field yang jelas untuk dikerjakan tanpa tebak-tebak antar sesi. Dependensi diurutkan: Setup â†’ Auth (termasuk bootstrap admin FR-22) â†’ Member â†’ Payment/Expense â†’ Dashboard â†’ Reports â†’ Testing â†’ Deployment.

**Langkah selanjutnya:** T-38–T-39 (Deployment). Detail state: `.agents/HANDOFF.md`.
