# KasSurs — Laporan & Presentasi Project

**Disusun:** 2 September 2026 · **Status: 95% selesai — siap deployment produksi**

---

## 1. Ringkasan Eksekutif

KasSurs adalah aplikasi web mobile-first untuk mengelola kas bulanan organisasi kecil (maks. 30 anggota). Aplikasi ini menggantikan pencatatan kas manual di kertas dengan sistem digital yang **cepat, transparan, aman, dan gratis dijalankan**.

**Pencapaian utama:**

| Metrik | Hasil |
|---|---|
| Functional requirements diselesaikan | 23/23 (PRD V1.1) |
| Task development selesai | 37/39 + redesign UI penuh |
| Unit & integration tests | **138/138 lulus** (27 file test) |
| End-to-end tests | **10/10 lulus** (4 skenario kritikal) |
| Type safety | 0 error TypeScript |
| Biaya operasional bulanan | **Rp0** (100% free-tier) |
| Target laporan < 1 menit | ✅ Export PDF/Excel sekali klik |

Sisa pekerjaan: **T-38–T-39 (deployment ke produksi)** — konfigurasi environment Vercel + migrasi database production, estimasi < 1 hari kerja.

---

## 2. Masalah yang Dipecahkan

**Sebelum KasSurs (pencatatan kertas):**
- Catatan mudah hilang/rusak, tidak ada backup
- Bendahara sulit melacak siapa yang belum bayar tiap bulan
- Rekap laporan manual memakan waktu berjam-jam
- Anggota tidak tahu status pembayarannya — harus japri admin
- Tidak ada transparansi penggunaan kas

**Setelah KasSurs:**
- Semua transaksi tercatat digital, tersimpan permanen, ada jejak audit
- Daftar "belum bayar" real-time, tagih dengan tepat
- Laporan PDF/Excel < 1 menit
- Anggota cek status bayar & saldo sendiri dari HP (self-service, read-only)
- Setiap perubahan data kas tercatat di audit log yang tidak bisa dihapus

---

## 3. Solusi Produk

### 3.1 Dua Peran Pengguna

**Admin/Bendahara** — akses penuh:
- Kelola anggota (tambah, nonaktifkan, reset PIN/No HP)
- Catat kas masuk & keluar
- Lihat dashboard saldo real-time
- Generate & export laporan PDF/Excel

**Anggota** — akses read-only:
- Cek status pembayaran sendiri per bulan (matriks 12 bulan)
- Lihat ringkasan saldo kas umum
- Tidak bisa mengubah data apa pun (dijaga di level middleware)

### 3.2 Fitur Unggulan

**⚡ Speed-Tap — pencatatan 1 sentuhan (FR-06)**
Fitur andalan untuk bendahara: cukup **1 tap** pada kartu anggota untuk mencatat pembayaran lunas. Tanpa form, tanpa konfirmasi — selesai dalam < 1 detik. Dilengkapi mitigasi salah-tap 3 lapis:
1. **Undo 5 detik** — toast "BATALKAN" langsung muncul setelah catat
2. **Badge BARU 10 menit** — pembayaran baru ditandai jelas
3. **Drawer edit/hapus** — koreksi lewat long-press / tap kartu lunas (hapus selalu butuh konfirmasi)

Untuk kasus khusus (rapel/sumbangan beda nominal), tersedia **long-press 450ms** → drawer input lengkap dengan nominal editable.

**📊 Dashboard & Transparansi**
- Saldo kas real-time + progress bar tingkat keikutsertaan bulan berjalan
- Filter gabungan: chip status + pencarian nama
- Kategori pengeluaran sebagai chip pills (Konsumsi, Acara, ATK, Sumbangan, Lain-lain + kategori custom)

**📄 Laporan Beku (Snapshot)**
- Laporan per periode "dibekukan" saat pertama kali dibuka — angka konsisten walau data berubah setelahnya
- Regenerasi eksplisit via `?regenerate=true`
- Export **PDF** (formal, siap cetak/bagikan) & **Excel** (olah lanjut)

**🔐 Keamanan Dasar yang Solid**
- PIN di-hash **bcrypt** (tidak pernah tersimpan/dikirim plaintext)
- **Anti brute-force:** 5x salah PIN → terkunci 15 menit (tersimpan di database, tahan server restart)
- Session **JWT httpOnly cookie** 30 hari *sliding* (autoiperpanjang saat rutin dipakai) — anti XSS & CSRF
- **RBAC middleware** — anggota ditolak 403 sebelum menyentuh database
- **Audit log append-only** — setiap create/update/delete kas tercatat (siapa, apa, data lama → baru, kapan); tidak ada endpoint untuk mengubah/hapusnya

### 3.3 Aturan Bisnis Kritis (dijaga di level database, bukan sekadar UI)

| Aturan | Jaminan |
|---|---|
| 1 pembayaran lunas per anggota per bulan | Unique constraint DB + validasi server → `409 Conflict` |
| Tidak bisa menonaktifkan admin terakhir | Ditolak `403` — cegah lockout sistem |
| Nonaktifkan anggota = soft delete | Data historis permanen untuk arsip |
| Validasi tanggal ketat | Tanggal kalender invalid (mis. 30 Feb) ditolak, bukan diam-diam dikoreksi |
| Nominal kas default Rp30.000 | Editable untuk rapel/sumbangan, minimum > 0 |

---

## 4. Teknologi

| Layer | Teknologi | Alasan |
|---|---|---|
| Frontend + Backend | Next.js 14 (App Router) + TypeScript | Satu codebase, deploy sekali, type-safety end-to-end |
| Database | PostgreSQL (Supabase free tier) | Reliabel, gratis, cukup untuk 30 anggota |
| ORM | Prisma | Migrations terkontrol, query type-safe |
| Autentikasi | Custom (No HP + PIN, bcrypt, JWT cookie) | Sederhana sesuai kebutuhan, tanpa biaya auth pihak ketiga |
| UI | Tailwind CSS + Neo-Brutalism V2.2 | Khas, berkarakter, mobile-first |
| Export | jsPDF + SheetJS | PDF & Excel tanpa server tambahan |
| Hosting | Vercel free tier | HTTPS otomatis, $0 |

**Prinsip arsitektur: tanpa over-engineering.** Tidak ada caching layer, load balancer, atau microservices — sistem didesain tepat untuk skala ≤30 pengguna. Kontrak tipe TypeScript didefinisikan sekali, dipakai bersama frontend & backend — tidak ada selisih interpretasi antar layer.

### 4.1 Daftar Library & Plugin Lengkap (dari `package.json`)

**Dependencies produksi (14):**

| Library | Versi | Fungsi |
|---|---|---|
| `next` | ^14.2.33 | Framework fullstack (App Router, API routes, SSR) |
| `react` / `react-dom` | ^18.3.1 | Library UI |
| `@prisma/client` | ^5.22.0 | ORM — query database type-safe |
| `bcryptjs` | ^3.0.3 | Hash PIN (salt rounds ≥10) |
| `jose` | ^6.2.10 | Sign/verify JWT session cookie |
| `zod` | ^4.5.4 | Validasi input semua API route |
| `tailwind-merge` + `clsx` | ^3.6.0 / ^2.1.1 | Utility merge class CSS (`cn()`) |
| `lucide-react` | ^1.39.0 | Icon set (BottomNav, ikon UI) |
| `sonner` | ^2.0.8 | Toast notification (undo Speed-Tap, error) |
| `vaul` | ^1.1.2 | Drawer bottom-sheet mobile (edit/hapus pembayaran) |
| `jspdf` + `jspdf-autotable` | ^4.2.1 / ^5.0.8 | Export laporan PDF + tabel |
| `xlsx` (SheetJS) | ^0.18.5 | Export laporan Excel |

**DevDependencies (13):**

| Library | Versi | Fungsi |
|---|---|---|
| `typescript` | ^5.7.3 | Type safety end-to-end |
| `tailwindcss` / `postcss` / `autoprefixer` | ^3.4.17 | Styling pipeline |
| `vitest` | ^4.1.11 | Unit + integration test runner |
| `@playwright/test` | ^1.62.1 | E2E browser test |
| `prisma` (CLI) | ^5.22.0 | Migrations & seed |
| `tsx` | ^4.23.13 | Runner script seed |
| `eslint` + `eslint-config-next` | ^8.57.1 | Linting |
| `@types/node` / `@types/react` | 26.x / 19.x | Type definitions |

**Tooling eksternal:** Docker (test DB Postgres 17 terisolasi, port 5433), Vercel (hosting), Supabase (Postgres 15 free tier).

Catatan: Tailwind config **tanpa plugin tambahan** (`plugins: []`) — semua efek visual (hard shadow, border custom) didefinisikan sebagai design token native Tailwind. Ini pilihan sadar: nol dependency styling tambahan, upgrade path aman.

---

## 5. Desain Antarmuka — Neo-Brutalism V2.2

Identitas visual yang **berbeda dari aplikasi kas pada umumnya**: warna flat berani, border hitam pekat, hard shadow, tipografi Bricolage Grotesque dengan angka rata kolom (tabular-nums).

- **Mobile-first** — dioptimalkan untuk layar HP 360–430px (cara aktual pengguna memakai aplikasi)
- **Feedback fisik** — semua tombol/kartu punya efek "press-down" (turun + shadow hilang saat ditekan)
- **Haptic** — getaran halus di HP: sukses 45ms, undo pola khusus
- **Aksesibilitas** — status selalu teks+bukan warna saja, kontras AA, dukungan keyboard penuh di daftar anggota, `prefers-reduced-motion` dihormati, touch target ≥44px
- **7 halaman dirancang ulang penuh** dalam fase redesign (dashboard, pembayaran, anggota, pengeluaran, laporan, status, login)

Proses redesign melewati **2 putaran review arsitektur independen + 1 design review khusus + QA manual user** — total 7 bug nyata ditemukan dan diperbaiki, semuanya dengan regression test E2E agar tidak kambuh.

### 5.1 Design System Detail (token resmi dari `tailwind.config.ts`)

**Palet warna Neo-Brutalism V2.2** — flat, saturated, tanpa gradient:

| Token | Hex | Penggunaan |
|---|---|---|
| `neo-bg` | `#FFFDF0` | Background aplikasi (cream hangat) |
| `neo-surface` / `neo-card` | `#FFFFFF` | Kartu & panel |
| `neo-black` | `#000000` | Border & shadow (pekat, bukan abu) |
| `neo-yellow` | `#FEF08A` | Aksen utama, toast default |
| `neo-green` / `neo-darkgreen` | `#86EFAC` / `#15803D` | Status LUNAS, header /pembayaran |
| `neo-coral` / `neo-darkred` | `#FCA5A5` / `#B91C1C` | Status BELUM, toast error |
| `neo-purple` | `#DDD6FE` | Header /anggota |
| `neo-sky` | `#BAE6FD` | Header /pengeluaran |
| `neo-orange` | `#FED7AA` | Aksen sekunder |
| `neo-pink` | `#FBCFE8` | Aksen sekunder |
| `neo-gray` | `#F3F4F6` | Permukaan netral |

**Hard shadow (tanpa blur — khas brutalism):**

| Token | Nilai |
|---|---|
| `shadow-neo-sm` | `2px 2px 0 #000` |
| `shadow-neo` | `3.5px 3.5px 0 #000` |
| `shadow-neo-lg` | `6px 6px 0 #000` |
| `shadow-neo-xl` | `10px 10px 0 #000` |

**Border custom:** `1.5px` / `2.5px` / `3px` — hitam pekat di semua kartu, tombol, chip.

**Tipografi:**

| Role | Font | Penggunaan |
|---|---|---|
| Display/body | **Bricolage Grotesque** (`next/font/google`) | Semua teks — berkarakter, modern |
| Mono | Generic monospace stack (`ui-monospace`, `Menlo`, dst.) | Meta teknis sesaat — badge teknis login saja; nominal Rupiah tetap Bricolage + `tabular-nums` |

Skala ukuran: sm 14 / base 16 / lg 20 / 2xl 28 px.

**Resep interaksi standar (dipakai konsisten di semua komponen):**
- **Press-down:** `active:translate-x/y + active:shadow-none` — elemen "tenggelam" saat ditekan, wajib di semua tombol/kartu interaktif
- **Drawer:** vaul bottom-sheet, animasi 200ms
- **Toast:** sonner, warna per-status (default kuning, error coral)
- **Gesture:** long-press 450ms (scroll-safe >10px) untuk mode rapel; haptic via Vibrate API

**Komponen atomik inti:** `NeoButton`, `TreasuryHero`, `MemberCard` (dengan gesture engine), `PassbookCard`, `FilterBar` (chip + search).

Ground truth visual tersimpan sebagai mockup HTML `.agents/kassurs_ui_neobrutalism_final.html` + spesifikasi lengkap `.agents/3-DESIGN.md` — konsistensi terjaga untuk pengembangan UI lanjutan.

---

## 6. Kualitas & Pengujian

Strategi testing proporsional untuk skala project — fokus di mana risikonya:

| Lapisan | Cakupan | Status |
|---|---|---|
| **Unit** | Hash PIN, kalkulasi saldo, aturan bisnis, rate-limiting | ✅ 138/138 |
| **Integration** | API payments (termasuk kasus 409 duplikat), login (termasuk lockout), audit log tercatat di semua mutasi, RBAC 403 | ✅ |
| **E2E (Playwright)** | Login admin & anggota, alur Speed-Tap end-to-end (undo/badge/drawer/409 lintas bulan), export PDF/Excel | ✅ 10/10 |

Praktik engineering selama development:
- Database test **terisolasi** (Docker terpisah) — test tidak pernah menyentuh data asli
- Race condition pembuatan snapshot laporan diatasi dengan advisory lock Postgres
- Test konkurensi pembayaran ganda (dua request bersamaan) — lolos, tidak ada duplikat
- Setiap bug yang ditemukan selama QA diberi regression test sebelum ditutup

---

## 7. Timeline & Riwayat Proyek

| Tanggal | Milestone |
|---|---|
| 30 Agu 2026 | Modul inti lengkap: setup, auth, anggota, pembayaran, pengeluaran, dashboard, laporan (T-01–T-34) |
| 31 Agu 2026 | Testing suite lengkap (T-35–T-37), QA manual fix #1, sliding session, test DB terisolasi, fix race snapshot |
| 2 Sep 2026 | **UI overhaul Neo-Brutalism V2.2**: 7 halaman redesign, komponen baru, Speed-Tap, cleanup total + design review fix + QA manual fix #2 |

Rata-rata milestone selesai sesuai/tanpa penundaan signifikan, dengan review kualitas berlapis di setiap fase.

---

## 8. Yang Tersisa: Deployment (T-38–T-39)

Langkah go-live (estimasi < 1 hari kerja):

1. Setup environment variables di Vercel (DATABASE_URL, DIRECT_URL, JWT_SECRET, akun admin awal)
2. Jalankan migrasi database produksi (`prisma migrate deploy`)
3. Seed data awal (kategori default + 1 akun admin) — idempotent, aman diulang
4. Smoke test di URL produksi
5. Serah terima: panduan login admin, demo ke anggota

Setelah go-live, tidak ada biaya berjalan (seluruh stack free-tier, cukup untuk 30 anggota).

---

## 9. Garis Besar Pemeliharaan

- **Yang perlu dilakukan admin rutin:** catat kas, review laporan bulanan — tidak ada maintenance teknis wajib
- **Kapasitas:** free-tier Supabase (500 MB storage) menampung bertahun-tahun data untuk 30 anggota
- **Batas sadar (V1):** 1 admin utama; penambahan admin lain langsung via database (keputusan desain demi kesederhanaan, bisa dikembangkan di V2 jika dibutuhkan)
- **Dokumentasi lengkap tersimpan** (PRD, Tech Spec, Design System, Task Breakdown, Handoff) — project dapat dilanjutkan pengembang lain kapan pun tanpa kehilangan konteks

---

## 10. Penutup

KasSurs dikembangkan **tepat sesuai kebutuhan** — tidak kurang, tidak berlebihan. Semua fitur yang dijanjikan di PRD sudah terimplementasi dan teruji (138 unit/integration + 10 E2E, semua hijau). Kualitas dijaga dengan review berlapis dan regression test untuk setiap bug. Aplikasi siap go-live setelah langkah deployment singkat.

**Demo tersedia:** login admin & akun anggota, alur pencatatan Speed-Tap 1-tap, undo, laporan & export PDF/Excel.

---

*Lampiran teknis detail: `.agents/1-PRD.md` (kebutuhan produk), `.agents/2-TECH-SPEC.md` (spesifikasi teknis), `.agents/3-DESIGN.md` (design system), `.agents/HANDOFF.md` (state terkini).*
