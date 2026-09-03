# PRD: KasSurs

**Versi:** 1.1
**Status:** Aktif — amendemen redesign UI disetujui
**Lokasi File:** `.agents/1-PRD.md`

**Changelog:**
- **1.1 (2026-09-03):** Amendemen minor FR-09 — pemilihan kategori pengeluaran dari **horizontal chip pills** (keputusan 2026-09-02) menjadi **grid 2 kolom + color dot** (selaras 3-DESIGN V2.2). Murni lapisan presentasi; tidak mengubah endpoint/API/scope.
- **1.1 (2026-09-02):** Amendemen alur catat pembayaran untuk UI Neo-Brutalism V2.2 (Speed-Tap). **FR-06 mayor** (rewrite: 2 mode input — 1-Tap Speed-Tap default + drawer rapel via long-press, mitigasi salah-tap 3 lapis). **FR-07/08/09/12/14 minor** (search + chip filter gabungan; drawer edit/hapus jadi UI konsumen FR-08; kategori chip pills bukan dropdown; progress bar dashboard; kupon + matriks 12 bulan /status).
- **1.0:** Baseline awal (23 FR, termasuk FR-22 bootstrap admin, FR-23 snapshot laporan — amendemen 2026-09-01).

---

## 📄 BAGIAN 1: Visi & Tujuan Produk

### Visi Produk
KasSurs adalah aplikasi web sederhana berbasis mobile untuk mengelola kas bulanan organisasi kecil (maksimal 30 anggota). Aplikasi ini menggantikan pencatatan manual di kertas dengan sistem digital yang memungkinkan bendahara (admin) mencatat pemasukan dan pengeluaran kas secara terstruktur, sementara anggota dapat memantau status pembayaran dan saldo kas secara transparan lewat HP masing-masing — tanpa kompleksitas sistem enterprise yang tidak dibutuhkan organisasi sekecil ini.

### Tujuan Utama
1. Menggantikan pencatatan kas manual (kertas) dengan sistem digital — Indikator: 100% transaksi kas tercatat di sistem, 0 pencatatan di kertas setelah go-live.
2. Memberi transparansi status pembayaran ke seluruh anggota — Indikator: anggota bisa cek status bayar sendiri kapan saja tanpa tanya admin.
3. Mempercepat proses pelaporan kas — Indikator: laporan PDF/Excel bisa di-generate dalam < 1 menit, dari sebelumnya manual rekap di kertas.
4. Menjaga keamanan data dasar meski sistem sederhana — Indikator: PIN ter-hash, ada rate-limiting anti brute-force.

### Value Proposition
- Sederhana: tidak over-engineered, sesuai skala organisasi ≤30 orang.
- Mobile-first: didesain untuk diakses lewat HP, bukan desktop.
- Transparan: anggota bisa self-service cek status bayar sendiri (read-only), mengurangi beban tanya-jawab manual ke admin.
- Gratis: dibangun di atas infrastruktur free-tier ($0 budget).

---

## 📄 BAGIAN 2: User Persona

### Persona 1: Admin/Bendahara
- **Usia/Pekerjaan:** 25-45 tahun, anggota organisasi yang ditunjuk sebagai bendahara/pengurus kas.
- **Level Teknis:** Pemula-Menengah (terbiasa pakai HP, tidak harus paham teknis mendalam).
- **Tujuan:** Mencatat kas masuk/keluar dengan cepat, tahu siapa saja yang belum bayar, dan bisa membuat laporan tanpa ribet.
- **Pain Points:** Pencatatan kertas gampang hilang/rusak, rekap manual makan waktu, sulit melacak siapa yang belum bayar tiap bulan, harus jelasin laporan satu-satu ke anggota.
- **Motivasi:** Ingin pekerjaan administrasi kas selesai lebih cepat dan bisa dipertanggungjawabkan secara transparan ke anggota.

### Persona 2: Anggota Organisasi
- **Usia/Pekerjaan:** 20-50 tahun, anggota biasa organisasi/komunitas kecil.
- **Level Teknis:** Pemula (pengguna HP awam, tidak familiar dengan aplikasi kompleks).
- **Tujuan:** Ingin tahu status pembayaran kas dirinya sendiri dan saldo kas organisasi secara umum, tanpa perlu tanya admin langsung.
- **Pain Points:** Tidak tahu apakah sudah bayar bulan ini atau belum, tidak ada transparansi soal penggunaan kas, harus japri admin untuk tanya status.
- **Motivasi:** Ingin merasa yakin kontribusinya tercatat dan penggunaan kas transparan.

---

## 📄 BAGIAN 3: User Stories

### Modul 1: Autentikasi
- Sebagai admin, saya ingin login menggunakan No HP + PIN, agar bisa mengakses sistem dengan aman.
- Sebagai anggota, saya ingin login menggunakan No HP + PIN yang diberikan admin, agar bisa melihat status kas saya.
- Sebagai anggota, saya ingin sistem memblokir sementara setelah 5x salah PIN, agar akun saya terlindungi dari percobaan tebak PIN oleh orang lain.
- Sebagai admin, saya ingin bisa reset PIN dan No HP anggota, agar anggota yang lupa PIN atau ganti nomor tetap bisa akses.

### Modul 2: Manajemen Anggota (Admin)
- Sebagai admin, saya ingin menambahkan data anggota baru (nama, No HP, PIN awal), agar anggota bisa mulai login.
- Sebagai admin, saya ingin menonaktifkan anggota yang keluar dari organisasi, agar datanya tetap tersimpan sebagai arsip tanpa perlu dihapus.
- Sebagai admin, saya ingin melihat daftar seluruh anggota beserta status keaktifannya, agar mudah mengelola data.

### Modul 3: Pencatatan Kas Masuk (Admin)
- Sebagai admin, saya ingin mencatat pembayaran kas bulanan per anggota (Rp30.000/bulan), agar tercatat siapa saja yang sudah bayar.
- Sebagai admin, saya ingin melihat daftar anggota yang belum bayar di bulan berjalan, agar bisa menagih dengan tepat.
- Sebagai admin, saya ingin mengoreksi/mengedit data pembayaran yang salah input, agar data tetap akurat.

### Modul 4: Pencatatan Kas Keluar (Admin)
- Sebagai admin, saya ingin mencatat pengeluaran kas dengan kategori (Konsumsi, Acara, ATK, Sumbangan, Lain-lain), agar pengeluaran terklasifikasi dengan rapi.
- Sebagai admin, saya ingin menambah kategori pengeluaran baru selain default, agar sistem fleksibel mengikuti kebutuhan organisasi.
- Sebagai admin, saya ingin mengedit/menghapus data pengeluaran yang salah input, agar data tetap akurat.

### Modul 5: Dashboard & Filtering
- Sebagai admin, saya ingin melihat saldo kas real-time di dashboard, agar tahu kondisi keuangan organisasi kapan saja.
- Sebagai admin, saya ingin memfilter data transaksi berdasarkan bulan, tahun, kategori, dan status bayar, agar mudah mencari data spesifik.
- Sebagai anggota, saya ingin melihat status pembayaran kas saya sendiri per bulan, agar tahu apakah sudah lunas atau belum.
- Sebagai anggota, saya ingin melihat ringkasan saldo kas umum organisasi, agar merasa yakin dengan transparansi pengelolaan kas.

### Modul 6: Pelaporan & Export
- Sebagai admin, saya ingin mengekspor laporan kas ke PDF, agar bisa dibagikan secara formal ke anggota/pihak lain.
- Sebagai admin, saya ingin mengekspor data kas ke Excel, agar bisa diolah lebih lanjut jika diperlukan.
- Sebagai admin, saya ingin laporan bisa difilter berdasarkan periode (bulanan/tahunan) sebelum diekspor, agar laporan sesuai kebutuhan.

*(Total 20 user stories)*

---

## 📄 BAGIAN 4: Functional Requirements

### Modul 1: Autentikasi

**FR-01: Login No HP + PIN**
- **Input:** No HP, PIN (4-6 digit)
- **Proses:** Verifikasi kredensial terhadap data tersimpan (PIN di-hash), buat sesi login
- **Output:** Akses ke dashboard sesuai role (admin/anggota)
- **Aturan Bisnis:** 5x percobaan salah PIN berturut-turut → akun terkunci sementara 15 menit

**FR-02: Reset Akses Anggota (Admin)**
- **Input:** ID anggota, No HP baru (opsional), PIN baru
- **Proses:** Admin update No HP dan/atau reset PIN anggota tertentu
- **Output:** Anggota bisa login dengan kredensial baru
- **Aturan Bisnis:** Hanya admin yang bisa melakukan reset; PIN baru otomatis di-hash sebelum simpan

### Modul 2: Manajemen Anggota

**FR-03: Tambah Anggota**
- **Input:** Nama, No HP (unik), PIN awal
- **Proses:** Validasi No HP belum terdaftar, hash PIN, simpan ke database
- **Output:** Anggota baru tersimpan, status aktif, role default ANGGOTA
- **Aturan Bisnis:**
  - No HP harus unik di seluruh sistem
  - Role tidak dipilih manual saat tambah anggota via UI — selalu ANGGOTA. Perubahan role menjadi ADMIN hanya bisa dilakukan langsung di database (bukan lewat UI), karena V1 hanya butuh 1 admin tunggal dan tidak ada use case promote-to-admin dari UI (lihat Modul 7A untuk akun admin pertama)

**FR-04: Nonaktifkan Anggota**
- **Input:** ID anggota
- **Proses:** Ubah status anggota menjadi nonaktif (bukan hapus data)
- **Output:** Anggota nonaktif tidak bisa login, data historis tetap tersimpan untuk arsip
- **Aturan Bisnis:**
  - Data pembayaran & histori anggota nonaktif tidak dihapus
  - **Sistem menolak** menonaktifkan akun dengan role ADMIN jika itu satu-satunya akun ADMIN aktif tersisa di sistem — mencegah lockout permanen (tidak ada admin yang bisa login untuk mengaktifkan kembali)

**FR-05: Lihat Daftar Anggota**
- **Input:** -
- **Proses:** Ambil seluruh data anggota dari database
- **Output:** List anggota dengan nama, No HP, status aktif/nonaktif
- **Aturan Bisnis:** Hanya admin yang bisa akses

### Modul 7A: Bootstrap Sistem (Setup Awal)

**FR-22: Akun Admin Pertama**
- **Input:** No HP + PIN admin, diisi lewat environment variable saat seed pertama kali (`SEED_ADMIN_PHONE`, `SEED_ADMIN_PIN`) — bukan hardcode di source code
- **Proses:** Script seed baca environment variable, hash PIN, buat 1 record Member dengan role=ADMIN
- **Output:** Akun admin pertama siap dipakai untuk login setelah deployment awal
- **Aturan Bisnis:**
  - PIN default wajib diganti oleh admin setelah login pertama kali (tidak wajib dipaksa di V1, tapi direkomendasikan sebagai langkah manual pertama)
  - Seed script tidak boleh dijalankan ulang jika sudah ada akun ADMIN di database (idempotent — cegah duplikat admin dari re-run seed)

### Modul 3: Kas Masuk

**FR-06: Catat Pembayaran Kas (V1.1 — Speed-Tap, amendemen 2026-09-02)**
- **Input (2 mode):**
  - **(a) 1-Tap Speed-Tap (mode default, mayoritas kasus):** admin tap kartu anggota "Belum Bayar" di Speed-Tap Roster → **langsung tercatat lunas Rp30.000 tanggal hari ini — tanpa form, tanpa halaman baru, tanpa konfirmasi.** Roster = grid 2 kolom semua anggota aktif; data diambil saat halaman dibuka dari 2 endpoint existing (`GET /api/members?bulan=&tahun=` untuk roster + `GET /api/payments?bulan=&tahun=` untuk badge "BARU" & prefill drawer — tanpa endpoint baru), ordering "Belum Bayar" selalu di atas (client-side)
  - **(b) Bottom Drawer (rapel/kustom):** untuk nominal non-default atau bulan/tanggal berbeda — admin **long-press 450ms** kartu "Belum Bayar" (batal otomatis jika geser >10px — scroll-safe) → bottom drawer berisi form: nominal (prefill Rp30.000), bulan/tahun, tanggal bayar (prefill hari ini)
- **Proses:** Simpan record pembayaran via POST yang sama untuk kedua mode; **optimistic UI** — kartu langsung flip ke state Lunas sebelum response server, gagal → rollback kartu + toast error
- **Output:** Status anggota bulan itu "Lunas"; feedback tactile `navigator.vibrate(45)` + **undo toast 5 detik** "✓ {nama} Lunas (Rp 30.000)" dengan tombol **BATALKAN**
- **Aturan Bisnis:**
  - 1 anggota hanya bisa punya 1 record lunas per bulan per tahun — duplikat ditolak `409 ALREADY_PAID` "Sudah lunas bulan ini" (bukan silent overwrite / auto-redirect ke edit); client-side check hanya UX shortcut — server unique constraint tetap otoritatif; `existingPaymentId` dalam response 409 dapat dipakai deep-link langsung ke drawer edit/hapus
  - **Mitigasi salah-tap 3 lapis** (1-tap sengaja tanpa konfirmasi — trade-off SADAR: kecepatan alur > window undo panjang; keputusan final user 2026-09-02):
    1. **Undo toast 5 detik** + tombol BATALKAN → `DELETE /api/payments/{id}` + kartu rollback ke Belum, tanpa konfirmasi tambahan (payment masih hangat, undo bukan aksi destruktif secara mental)
    2. **Badge "BARU"** di kartu anggota selama 10 menit sejak dicatat lunas (2 lapis storage tanpa perubahan API/schema: session-memory saat POST sukses + join client-side `createdAt` dari `GET /api/payments?bulan=&tahun=` — selamat refresh; PATCH edit TIDAK menghapus badge karena `createdAt` tidak berubah)
    3. **Drawer Edit/Hapus** untuk telat sadar — tap kartu Lunas (lewat window undo) membuka drawer detail + Edit (PATCH) + Hapus (DELETE + **wajib konfirmasi destruktif** — sengaja beda dari undo toast); vibrate undo dibedakan `[30, 40, 30]`
  - Nominal **boleh berbeda dari default Rp30.000** (rapel/nunggak/sumbangan — via mode drawer) — validasi hanya `jumlah > 0`, tidak ada batas atas
  - **In-flight tap guard:** tap kedua pada kartu yang POST-nya masih berjalan → silent ignore (tanpa error toast)
  - Race double-submit lintas kartu / 2 tab: client check + server `409 ALREADY_PAID` dengan `existingPaymentId` → deep-link drawer

*(Amendemen menghapus dari V1.0: input via search-select member, Pola A "satu-per-satu per transaksi" sebagai satu-satunya alur, "form tidak auto-reset + tombol Input Lagi" untuk pembayaran — digantikan alur 2-mode di atas. Toast sukses dengan aksi eksplisit "Input Lagi" TETAP dipertahankan untuk form pengeluaran, lihat FR-09.)*

**FR-07: Lihat Status Pembayaran Bulan Berjalan**
- **Input:** Bulan, tahun (default: bulan berjalan)
- **Proses:** Bandingkan seluruh anggota aktif dengan data pembayaran bulan tersebut
- **Output:** List anggota dengan status Lunas/Belum Bayar
- **Aturan Bisnis:**
  - Hanya anggota berstatus aktif yang dihitung
  - Urutan default list (saat filter kosong): anggota **"Belum Bayar" muncul lebih dulu** daripada yang sudah "Lunas" — memudahkan admin melihat siapa yang perlu ditagih tanpa perlu tahu nama spesifik dulu (sorting client-side dari data yang sudah di-fetch)
  - **(Amendemen 2026-09-02)** Filter roster = **kombinasi chip filter + search nama**: chip "Semua (N)" / "Belum (N)" (chip aktif inverted hitam) untuk filter cepat status bayar, DI SAMPING search box nama — keduanya digabung (search tetap berguna sebagai fallback cepat untuk 30 anggota; saat mengetik di search, hasil difilter nama DAN tetap menghormati chip aktif)

**FR-08: Edit/Hapus Data Pembayaran (V1.1 — amendemen 2026-09-02)**
- **Input:** ID record pembayaran, data baru
- **Proses:** Update atau hapus record pembayaran — akses via **bottom drawer** (tap kartu Lunas di roster, atau deep-link dari `existingPaymentId` response `409 ALREADY_PAID`)
- **Output:** Data pembayaran terkoreksi
- **Aturan Bisnis:**
  - Hanya admin yang bisa edit/hapus; **wajib log audit** siapa yang mengubah — lihat FR-21 (append-only)
  - **Hapus wajib konfirmasi destruktif** (beda dari undo toast 5 detik yang tanpa konfirmasi — lihat FR-06 mitigasi lapis 3)
  - Drawer edit: form prefill data payment (nominal, bulan/tahun, tanggal); konsumen UI pertama untuk PATCH/DELETE payment

### Modul 4: Kas Keluar

**FR-09: Catat Pengeluaran (V1.1 — amendemen 2026-09-02)**
- **Input:** Kategori, deskripsi, jumlah, tanggal (default hari ini)
- **Proses:** Simpan record pengeluaran, kurangi saldo kas
- **Output:** Data pengeluaran tersimpan
- **Aturan Bisnis:**
  - Jumlah harus > 0 (validasi client + server), kategori wajib dipilih
  - **(Amendemen 2026-09-03)** Pemilihan kategori via **grid 2 kolom + color dot** — tiap kategori berupa kartu dalam grid 2 kolom dengan dot warna di samping label, kategori aktif inverted hitam-putih; dot warna mempercepat scan kategori & tap target besar di mobile tanpa scroll horizontal — **BUKAN dropdown native `<select>`** *(menggantikan keputusan horizontal chip pills dari amendemen 2026-09-02; diselaraskan dengan 3-DESIGN V2.2 — amendemen FR-09 2026-09-03)*
  - Nominal besar (input voucher, tabular-nums); toast sukses dengan aksi eksplisit **"Input Lagi"** (tidak auto-reset — tetap dari V1.0)

**FR-10: Kelola Kategori Pengeluaran**
- **Input:** Nama kategori baru
- **Proses:** Tambah kategori custom ke daftar kategori
- **Output:** Kategori baru tersedia untuk dipilih saat catat pengeluaran
- **Aturan Bisnis:** Kategori default: Konsumsi, Acara, ATK, Sumbangan, Lain-lain — admin bisa tambah lebih

**FR-11: Edit/Hapus Data Pengeluaran**
- **Input:** ID record pengeluaran, data baru
- **Proses:** Update atau hapus record pengeluaran
- **Output:** Data pengeluaran terkoreksi
- **Aturan Bisnis:** Hanya admin yang bisa edit/hapus

### Modul 5: Dashboard & Filtering

**FR-12: Dashboard Saldo Real-time (V1.1 — amendemen 2026-09-02)**
- **Input:** -
- **Proses:** Hitung total kas masuk dikurangi total kas keluar
- **Output:** Saldo kas saat ini, ringkasan bulan berjalan (total masuk, total keluar), **+ progress bar "Iuran Terkumpul N/M Orang"** (bulan berjalan — data dari `jumlahBelumBayar` agregat yang sudah ada, tanpa endpoint baru)
- **Aturan Bisnis:** Saldo dihitung dari seluruh histori transaksi, bukan hanya bulan berjalan; dashboard admin tetap ringkas — roster lengkap + filter ada di halaman `/pembayaran` terpisah (BottomNav 5 tab)

**FR-13: Filter Transaksi**
- **Input:** Bulan, tahun, kategori (untuk pengeluaran), status bayar (untuk pemasukan)
- **Proses:** Query data sesuai filter yang dipilih
- **Output:** List transaksi terfilter
- **Aturan Bisnis:** Filter bisa dikombinasikan (misal: bulan + kategori sekaligus)

**FR-14: Dashboard Anggota (View-Only) (V1.1 — amendemen 2026-09-02)**
- **Input:** ID anggota (dari sesi login)
- **Proses:** Ambil status pembayaran anggota tersebut per bulan + ringkasan saldo kas umum
- **Output:** Status Lunas/Belum per bulan, saldo kas umum organisasi — ditampilkan sebagai **kupon status bulan berjalan** (LUNAS hijau / BELUM BAYAR coral, selalu disertai teks & ikon — informasi tidak pernah lewat warna saja) + **matriks iuran 12 bulan** (grid 4 kolom; cell bulan berjalan yang lunas di-inverse hitam-kuning)
- **Aturan Bisnis:** Anggota hanya bisa lihat data dirinya sendiri untuk pembayaran; saldo kas umum bisa dilihat semua anggota; tidak ada akses edit sama sekali — scope read-only TIDAK berubah oleh amendemen (murni visual)

### Modul 6: Pelaporan & Export

**FR-15: Export Laporan PDF**
- **Input:** Periode (bulan/tahun — rentang tanggal di luar scope V1)
- **Proses:** Generate dokumen PDF berisi ringkasan kas masuk, kas keluar, dan saldo
- **Output:** File PDF terunduh
- **Aturan Bisnis:** Hanya admin yang bisa export; laporan bersifat **beku (snapshot)** — angka yang sudah di-export tidak berubah nilai meski ada transaksi/rapel/koreksi baru untuk periode yang sama setelahnya (detail mekanisme: FR-23)

**FR-16: Export Data Excel**
- **Input:** Periode (bulan/tahun — rentang tanggal di luar scope V1)
- **Proses:** Generate file Excel berisi data mentah transaksi (masuk & keluar)
- **Output:** File Excel (.xlsx) terunduh
- **Aturan Bisnis:** Hanya admin yang bisa export; memakai snapshot periode yang sama dengan PDF — kedua format dijamin konsisten karena bersumber dari satu snapshot (FR-23)

**FR-17: Filter Sebelum Export**
- **Input:** Rentang periode (bulan + tahun)
- **Proses:** Terapkan filter periode sebelum generate laporan
- **Output:** Laporan sesuai periode yang dipilih
- **Aturan Bisnis:** Default periode: bulan berjalan jika tidak dipilih; periode yang sudah pernah di-export diambil dari snapshot yang ada (tidak dihitung ulang) — lihat FR-23

### Modul 7: Keamanan Sistem

**FR-18: Rate Limiting Login**
- **Input:** Percobaan login (No HP + PIN)
- **Proses:** Hitung percobaan gagal berturut-turut per akun
- **Output:** Lockout sementara jika melebihi batas
- **Aturan Bisnis:** Maksimal 5x salah → lockout 15 menit

**FR-19: Hash PIN**
- **Input:** PIN plaintext (saat set/reset)
- **Proses:** Hash PIN menggunakan bcrypt sebelum disimpan ke database
- **Output:** PIN tersimpan dalam bentuk hash, tidak pernah plaintext di database
- **Aturan Bisnis:** Tidak ada endpoint/fitur yang mengembalikan PIN asli

**FR-20: Role-Based Access Control**
- **Input:** Sesi login (role: admin/anggota)
- **Proses:** Validasi role di setiap request ke endpoint yang membutuhkan otorisasi
- **Output:** Akses diizinkan/ditolak sesuai role
- **Aturan Bisnis:** Anggota tidak bisa mengakses endpoint CRUD data (create/update/delete) sama sekali

**FR-21: Audit Trail Perubahan Data**
- **Input:** Setiap operasi create/update/delete pada data pembayaran dan pengeluaran
- **Proses:** Catat siapa (admin mana) dan kapan (timestamp) melakukan perubahan, termasuk data sebelum/sesudah untuk edit
- **Output:** Log audit tersimpan, bisa ditelusuri per record transaksi
- **Aturan Bisnis:** Wajib di V1 — setiap create/update/delete pada `payments` dan `expenses` harus tercatat di log audit; log tidak bisa dihapus/diedit oleh siapapun (append-only)

**FR-23: Snapshot Laporan (Laporan Beku)**
- **Input:** Periode export (bulan/tahun) — dipicu export pertama kali untuk periode tersebut
- **Proses:** Saat export pertama untuk suatu periode, sistem membekukan hasil kalkulasi laporan (ringkasan agregat + detail baris transaksi, termasuk nama anggota/kategori saat itu) ke tabel snapshot; export periode yang sama di kemudian hari (PDF maupun Excel) di-generate dari snapshot tersebut, bukan dihitung ulang dari data live
- **Output:** Laporan per periode yang nilainya permanen — tidak berubah diam-diam meski ada rapel, edit, atau penghapusan transaksi setelahnya; laporan yang sudah dibagikan ke anggota tetap cocok dengan re-export di masa depan
- **Aturan Bisnis:** 1 snapshot per periode (unique bulan+tahun); dibuat hanya saat export pertama periode itu (bukan otomatis tiap akhir bulan); hitung ulang hanya lewat aksi eksplisit admin (parameter `regenerate` — untuk koreksi salah input); kalkulasi yang dibekukan tetap memakai semantik yang disetujui: pemasukan accrual per bulan/tahun iuran, pengeluaran cash-flow per tanggal, saldo = historis — snapshot membekukan **hasil**, bukan mengubah **cara** hitung

*(Total 23 FR — FR-06/07/08/09/12/14 diamendemen V1.1 2026-09-02: FR-06 rewrite mayor alur Speed-Tap, lainnya minor visual/UX. Tidak ada FR baru; tidak ada perubahan endpoint/API/scope keamanan — amendemen murni lapisan presentasi & alur input, kecuali drawer edit/hapus payment yang kini punya konsumen UI nyata (FR-08), PATCH/DELETE sudah ada sejak T-21.)*

---

## 📄 BAGIAN 5: Non-Functional Requirements

### Performa
- Waktu muat halaman < 2 detik di koneksi mobile data biasa (3G/4G)
- API response < 500ms untuk operasi CRUD standar
- Sistem harus tetap responsif untuk beban maksimal 30 user (bukan target skala besar)

### Keamanan
- PIN disimpan dalam bentuk hash (bcrypt), tidak pernah plaintext
- HTTPS wajib untuk seluruh komunikasi
- Rate limiting pada endpoint login (anti brute-force)
- Role-based access control: admin (full CRUD) vs anggota (read-only, scope terbatas ke data sendiri + ringkasan umum)
- Session login menggunakan **sliding session** (amendemen 2026-09-01, menggantikan fixed-expiry 30 hari): setiap request yang lolos autentikasi memperpanjang masa berlaku token menjadi 30 hari dari titik itu (re-issue JWT oleh middleware, dengan ambang refresh — detail mekanisme di Tech Spec Bagian 4). Selama user membuka app minimal sekali dalam 30 hari, sesi tidak pernah expired; hanya jika app tidak dibuka sama sekali selama 30 hari berturut-turut, sesi mati natural dan wajib login ulang (anggota jarang buka app, prioritas kenyamanan di atas keamanan ketat untuk skala organisasi ini)
- Konsekuensi disadari & diterima: akses anggota nonaktif (soft-deactivated) yang token-nya masih valid kini efektif **tidak terbatas waktu** selama orang itu terus membuka app (sebelumnya maksimal 30 hari flat dari login terakhir) — tidak ada pengecekan `statusAktif` ke DB di sesi V1; cabut akses nonaktif = reset PIN / nonaktifkan ulang login via jalur admin

### Skalabilitas
- Target maksimal 30 user aktif — sistem tidak perlu didesain untuk scale horizontal atau load balancer
- Database cukup single-instance (free-tier Supabase Postgres)
- Tidak perlu caching layer terpisah (Redis dll.) — skala terlalu kecil untuk membutuhkan itu

### Usability
- Wajib mobile-first & responsive (prioritas utama: layar HP)
- Bahasa Indonesia untuk seluruh antarmuka
- UI sederhana, minim langkah untuk tugas paling sering (catat pembayaran, catat pengeluaran)
- Tidak wajib dark mode (opsional, bukan prioritas untuk V1)

### Reliabilitas & Auditability
- **Wajib:** setiap create/update/delete pada data pembayaran dan pengeluaran tercatat siapa (admin) & kapan mengubah — lihat FR-21. Log bersifat append-only (tidak bisa diedit/dihapus).
- Backup data otomatis mengikuti kebijakan default Supabase free-tier
- **Retensi `LoginAttempt`:** tidak ada pembersihan/cleanup otomatis di V1 — data percobaan login disimpan permanen (volume kecil untuk skala 30 user, tidak signifikan terhadap storage free-tier). Jika suatu saat storage jadi perhatian, tambahkan job cleanup berkala (misal hapus record >90 hari) sebagai peningkatan V2 — bukan kebutuhan V1.

---

## 📄 BAGIAN 6: Out of Scope & Dependensi

### Out of Scope (Tidak Dikerjakan di V1)
- Notifikasi otomatis (WhatsApp/email/push) untuk pengingat bayar atau tagihan jatuh tempo — ditunda ke v2
- Fitur denda/telat bayar otomatis — belum ada aturan denda yang disepakati, ditunda sampai ada keputusan
- Anggota submit konfirmasi bayar mandiri (self-report) dengan approval admin — sudah diputuskan anggota view-only saja
- OTP/WhatsApp verification untuk login — sudah diputuskan pakai No HP + PIN sederhana
- Multi-admin/multi-role granular (misal wakil bendahara dengan akses terbatas) — saat ini cukup 1 role admin tunggal
- Integrasi payment gateway (bayar online langsung dari app) — pembayaran tetap dilakukan di luar sistem (tunai/transfer manual), sistem hanya mencatat
- Aplikasi native mobile (iOS/Android) — cukup web app responsive

### Dependensi
- **Supabase** — Database (PostgreSQL) + hosting backend, free tier
- **Vercel** — Hosting frontend + API routes, free tier
- **jsPDF** — Library generate export PDF (client-side)
- **SheetJS (xlsx)** — Library generate export Excel (client-side)
- **bcrypt** — Library hashing PIN

### Asumsi
- Admin (bendahara) memiliki akses internet stabil saat input data
- Anggota memiliki HP dengan browser modern (Chrome/Safari mobile) untuk akses web app
- No HP setiap anggota unik dan dijadikan identifier utama login
- Pembayaran kas tetap dilakukan secara tunai/transfer manual di luar sistem — sistem ini murni pencatatan, bukan payment processor
- Jumlah anggota tidak akan melebihi 30 orang dalam waktu dekat (asumsi ini memengaruhi keputusan arsitektur "tanpa over-engineering")

---

## 🔄 Status
PRD V1.1 telah **disetujui** dan menjadi source of truth bersama (berdampingan dengan TECH-SPEC v1.6, 3-DESIGN V2.2, dan 3-TASKS). Amendemen terakhir: **2026-09-03** — FR-09 pemilihan kategori jadi grid 2 kolom + color dot (menggantikan keputusan chip pills 2026-09-02). Implementasi berjalan; rujukan task & progress ada di `.agents/3-TASKS.md` dan `.agents/HANDOFF.md`.
