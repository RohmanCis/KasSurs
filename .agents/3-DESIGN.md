# DESIGN.md — KasSurs

**Versi:** 2.2 — Neo-Brutalism
**Status:** Aktif (menggantikan total v1.0 OKLCH teal / Plus Jakarta Sans)
**Lokasi File:** `.agents/3-DESIGN.md`
**Dependensi:** `.agents/1-PRD.md`, `.agents/2-TECH-SPEC.md`
**Ground truth visual:** `.agents/kassurs_ui_neobrutalism_final.html` (mockup interaktif 1250 baris — class & DOM di sana adalah acuan implementasi)

---

## 1. Prinsip Desain

Target: **Neo-Brutalism** — high-contrast, tactile, bold. Border hitam tebal, hard shadow tanpa blur, warna flat berani, tipografi black-weight. Bukan minimalis lembut; bukan glassmorphism; bukan gradien.

Rasional untuk KasSurs:
- **Affordance maksimal di layar sentuh.** Border 2.5px + hard shadow membuat tombol/area interaktif tidak ambigu — admin tidak ragu elemen mana yang bisa di-tap saat buru-buru mencatat kas.
- **Kecepatan tugas tetap raja.** Estetika berani tidak boleh menambah jumlah tap. Speed-Tap Roster (1-tap lunas) adalah pola inti.
- **Flat & jujur.** Tidak ada blur, tidak ada gradient mesh, tidak ada shadow lembut berlapis. Shadow = offset hitam solid.
- **Kontras sebagai hierarki.** Hierarki visual dibangun dari ketebalan border, ukuran shadow, dan warna flat — bukan dari opacity/abu-abu pudar.
- **Zero-slop:** hindari Inter, gradien ungu-biru, card bersarang tak perlu, ikon generik tanpa fungsi.

---

## 2. Color System

Palet flat (hex), bukan OKLCH. Hitam `#000000` adalah warna struktural (semua border & shadow) — bukan sekadar warna teks.

### Token Warna

| Role | Token Tailwind | Hex | Penggunaan |
|---|---|---|---|
| Canvas | `neo-bg` | `#FFFDF0` | Background utama halaman (retro pale, hangat — bukan putih steril) — dipakai: `bg-neo-bg` di body (`layout.tsx`) |
| Surface | `neo-surface` | `#FFFFFF` | Card, input field, area elevated, background BottomNav (alias `neo-card` tersedia di config) |
| Structural Black | `neo-black` | `#000000` | SEMUA border, hard shadow, teks utama, tombol state aktif (inverted) |
| Green (Lunas/Success) | `neo-green` | `#86EFAC` | Status LUNAS, tombol aksi utama (Simpan/Masuk), progress bar terisi |
| Green Dark (teks) | `neo-darkgreen` | `#15803D` | Teks nominal masuk/positif di atas surface terang |
| Coral (Belum/Expense) | `neo-coral` | `#FCA5A5` | Status BELUM BAYAR, kas keluar, alert lockout, header halaman pengeluaran |
| Coral Dark (teks) | `neo-darkred` | `#B91C1C` | Teks nominal keluar/negatif di atas surface terang |
| Yellow (Highlight) | `neo-yellow` | `#FEF08A` | Header bar admin, toast, badge highlight, cell "bulan berjalan", select aktif |
| Sky | `neo-sky` | `#BAE6FD` | Header halaman anggota/passbook, tombol aksi sekunder (Laporan) |
| Purple | `neo-purple` | `#DDD6FE` | Badge label (SALDO, kategori), kartu ringkasan laporan, callout info |
| Orange | `neo-orange` | `#FED7AA` | Header halaman laporan |
| Pink | `neo-pink` | `#FBCFE8` | Badge teknis/meta (mis. "BCRYPT HASH", "Neo-Brutalist") |
| Gray | `neo-gray` | `#F3F4F6` | Track progress bar, cell bulan kosong/belum berjalan, input readonly |

### Aturan Penerapan
- **Border selalu hitam pekat** (`#000000`), ketebalan 1.5px / 2px / 2.5px / 3px sesuai bobot elemen (lihat Bagian 5). Tidak ada border abu-abu lembut.
- **Shadow selalu hard offset hitam, tanpa blur:** `shadow-neo-sm` = `2px 2px 0 0 #000`, `shadow-neo` = `3.5px 3.5px 0 0 #000`, `shadow-neo-lg` = `6px 6px 0 0 #000`, `shadow-neo-xl` = `10px 10px 0 0 #000`.
- Warna status (green/coral) **selalu disertai teks/label** ("✓ Lunas", "Belum") — informasi tidak boleh hanya lewat warna.
- Nominal masuk = `neo-darkgreen`, nominal keluar = `neo-darkred` — varian dark dipakai untuk teks di atas surface terang agar kontras AA.
- Hitam-dan-putih inverted (bg hitam, teks putih/kuning) dipakai untuk state **terpilih/aktif**: chip filter aktif, cell bulan berjalan di matriks, tab aktif.

---

## 3. Typography

**Satu font tunggal: Bricolage Grotesque** (via `next/font/google`, subset weights 400/700/800, CSS variable `--font-bricolage`). Karakter grotesque-experimentalnya cocok dengan estetika brutalist; tetap legible untuk Bahasa Indonesia. Fallback: `system-ui, sans-serif`. (Amendemen FASE perf 2026-09-03: subset 3 weight — **hanya weight 400/700/800 yang di-load; class weight lain tidak dipakai**. `font-medium`/`font-semibold`/`font-black` tidak muncul di kode — audit grep 2026-09-03, seluruh pemakaian sudah di-snap ke bold/extrabold; tidak ada `fontWeight` extend di tailwind.config.ts.)

**Font kedua: TIDAK ADA** (amendemen 2026-09-03 — JetBrains Mono dihapus dari project, ~25KB woff2 hanya terpakai 1x badge). Meta teknis/badge pakai Bricolage + `tabular-nums`, atau generic mono stack (`font-mono` → `ui-monospace`/`SFMono-Regular`/`Menlo`/`monospace`).

**Pengecualian mono (keputusan implementasi 2026-09-03):** angka hero kartu "Belum Bayar N" di dashboard (`dashboard/page.tsx:76`) memakai `font-mono text-2xl font-extrabold tabular-nums` — generic mono stack (bukan font file tambahan), memberi karakter counter khas di satu-satunya angka hero halaman.

| Item | Pilihan |
|---|---|
| Body/UI | Bricolage Grotesque, weight dominan **700-800** (`font-bold`/`font-extrabold`) untuk label, tombol, heading; 400-500 hanya untuk teks pendukung panjang |
| Nominal Rupiah | **Bricolage Grotesque + `tabular-nums`** (BUKAN mono) — saldo hero `text-3xl font-extrabold tabular-nums`; `font-variant-numeric: tabular-nums` menjamin digit rata kolom. JetBrains Mono tidak dipakai untuk nominal di mockup final |
| Label kecil | uppercase, `tracking-wider`, font-extrabold, ukuran 10-11px (`text-[10px]`–`text-xs`) |
| Heading halaman | `text-xl`–`text-2xl`, font-extrabold, `tracking-tight` |
| Skala | `text-[10px]` (badge/meta) · `text-xs` (12px, label/body kecil) · `text-sm` (14px, body) · `text-base` (16px) · `text-lg` (20px, nominal kartu) · `text-2xl` (28px, saldo hero/heading) |

**Catatan:** Jangan pakai Inter, jangan pakai Plus Jakarta Sans lagi (v1.0 sudah diganti). Dilarang gradien teks.

---

## 4. Spacing & Layout

- **Spacing scale:** kelipatan 4px (Tailwind default). Padding card umumnya `p-3.5` (14px) di dalam phone viewport; gap grid roster `gap-2`.
- **Mobile-first:** default 360-430px. Layout phone-centric: satu kolom vertical flow; bottom navigation bar untuk admin (**5 tab: Beranda, Anggota, Pembayaran, Pengeluaran, Laporan** — amendemen 2026-09-02, mengoreksi "4 tab" V2.2 awal; sesuai implementasi BottomNav T-28+T-34).
- **Corner radius:** `rounded-lg` (8px, badge/cell kecil) → `rounded-xl` (12px, tombol/input/card standar) → `rounded-2xl` (16px, kartu besar/hero/passbook). Konsisten rounded — tidak ada sharp-corner murni.
- **Grid roster anggota:** 2 kolom (`grid-cols-2`), card per anggota — Speed-Tap.
- **Matriks 12 bulan:** 4 kolom × 3 baris (`grid-cols-4`).
- **PIN input:** 6 kotak (`grid-cols-6`).
- Card di dalam card diperbolehkan **hanya** jika fungsional (mis. baris nominal di dalam kartu ringkasan) — selalu dengan border hitam sendiri, bukan nesting tanpa batas.

---

## 5. Komponen Utama

Resep inti (semua border hitam `#000`):

### 5.1 `neo-box` — kartu/container
`border-[2.5px] border-black bg-neo-surface rounded-2xl shadow-neo` (varian besar) atau `border-2 rounded-xl shadow-neo-sm` (varian kecil/list item).

### 5.2 `neo-btn` — tombol
`border-[2.5px] border-black rounded-xl font-bold shadow-neo neo-press select-none` — **press-down wajib via utility plugin `neo-press`**: saat `:active` translate 3.5px + shadow-none, transition scoped transform/box-shadow/background-color/color 100ms (definisi di tailwind.config.ts plugins). Varian offset lebih kecil: `neo-press-md` (2.5px) & `neo-press-sm` (2px). Hover opsional: `hover:-translate-x-px hover:-translate-y-px` + shadow membesar (di-gate `[@media(hover:hover)]` di perangkat touch). Semua tombol WAJIB punya feedback press-down — ini inti rasa "tactile". **Aturan: JANGAN tulis blob `active:translate-*` + `active:shadow-none` manual — press-down wajib lewat utility `neo-press*`** (amendemen 2026-09-03: konsolidasi blob duplikat 13 site di 9 file jadi plugin — visual identik, repaint turun).

### 5.3 `neo-tag` — badge/label
`border-2 border-black rounded-lg font-bold shadow-neo-sm px-2 py-0.5` + warna flat sesuai semantik (yellow=highlight, purple=label, pink=meta, green=lunas, coral=belum).

### 5.4 Roster card anggota (Speed-Tap)
Resep persis implementasi: `p-2.5 h-[72px] flex flex-col justify-between cursor-pointer border-[2.5px] border-black rounded-[14px] neo-press neo-press-md select-none [touch-action:manipulation]` — press-down via utility `neo-press` + `neo-press-md` (offset 2.5px saat `:active`). Durasi transisi 100ms, konsisten dengan tombol lain. (Amendemen 2026-09-03: blob `active:translate-x-[2.5px]` manual + `duration-[120ms]` diganti utility — durasi 100ms, bukan 120ms; repaint turun, visual identik.)
- **Belum bayar:** `bg-white shadow-neo hover:bg-neo-yellow` — ikon `clock` di badge coral, nominal "Rp 30k" slate, badge bawah `bg-neo-coral` teks **"TAP LUNAS"**.
- **Lunas:** `bg-neo-green shadow-neo-sm` — ikon `check` di badge putih, badge bawah `bg-white` teks **"LUNAS (tgl)"**.
- Ikon badge: lucide `check`/`clock`, `w-3 h-3 stroke-[3]`, di dalam kotak kecil `border border-black rounded`.
- Filter chip di atas roster: "Semua (30)" / "Belum (N)" — chip aktif **inverted** `bg-black text-white`, nonaktif `bg-white` / `bg-neo-coral`. Default ordering: **Belum Bayar selalu di atas**, baru Lunas (client-side sort dari data di memory).

### 5.5 Progress bar (chunky)
Track: `h-3.5 bg-neo-gray border-2 border-black rounded-lg p-0.5`. Isi: `bg-neo-green rounded` dengan `transition-[width] duration-300`; `border-r-2 border-black` HANYA saat `persen > 0` (amendemen 2026-09-02 — cegah garis hitam 2px saat fill 0%; amendemen FASE perf 2026-09-03: `transition-all` → `transition-[width]` — hanya lebar yang beranimasi).

### 5.6 Input
`border-2 / border-[2.5px] border-black rounded-xl bg-white px-3 py-2.5 font-bold shadow-neo-sm`. Prefix (mis. "+62") = span terpisah dengan `border-r-[2.5px] border-black bg-neo-yellow`. Readonly/disabled: `bg-neo-gray` + ikon lucide (mis. `calendar`). Nominal besar: `text-2xl font-extrabold tabular-nums` (Bricolage, bukan mono). **Amendemen 2026-09-03 (FilterBar select):** native `<select>` kini `appearance-none` + `pr-8` + `cursor-pointer`, chevron SVG overlay hitam 12px via `SelectWrapper` (`pointer-events-none`, `right-2.5` center vertikal) — panah native select tidak konsisten antar browser. Kontrak props/logic tidak berubah.

### 5.7 Header bar halaman
Warna flat per konteks (dashboard=Yellow, pembayaran=Green, pengeluaran=Coral, anggota=Purple, laporan=Orange, status anggota=Sky), `border-b-[2.5px] border-black`, judul uppercase font-extrabold. (Amendemen 2026-09-02: /pembayaran split ke tab sendiri diberi Green — semua warna lain sudah terpakai; /anggota Purple menggantikan Sky sesuai keputusan user FASE-3.)

### 5.8 Toast (sonner)
Styling neo-brutalist sesuai mockup in-app toast: `border-[3px] border-black bg-neo-yellow text-black font-extrabold text-xs rounded-xl shadow-neo-lg px-3.5 py-2.5` + ikon lucide `check` `stroke-[3]`. **Error toast = coral**: via `classNames` per-status di Toaster (`error: "bg-neo-coral"`, default/success kuning — amendemen 2026-09-02). Toast speed-tap = **undo toast `duration: 5000` + aksi "BATALKAN"** (lihat 5.10 Mitigasi Salah-Tap; auto-dismiss ~2.2s di mockup hanya demo, tidak dipakai). Toast sukses form tetap tampil dengan aksi eksplisit "Input Lagi" (lihat 5.10).

### 5.9 Ikon
**lucide-react**, `strokeWidth` **2.5** standar (`stroke-[2.5]` — mengimbangi border 2.5px); `stroke-[3]` untuk ikon kecil (`w-3`) agar tidak tipis; `stroke-[2]` hanya di tampilan sekunder/gallery. Ukuran `w-4 h-4` (16px) umum di mobile, `w-5/w-6` untuk logo/hero. Ikon fungsional (nav, aksi, status check/clock) selalu lucide — emoji hanya aksen di marquee/preview gallery mockup, bukan di app.

### 5.10 Alur form (V2.2 — Speed-Tap + Drawer)

**Alur Catat Pembayaran — dua mode:**

**(a) 1-Tap Speed-Tap (mode default, mayoritas kasus):**
1. Dashboard menampilkan Speed-Tap Roster — grid 2 kolom semua anggota aktif, data di-fetch sekali (`GET /api/members?bulan=&tahun=`), ordering "Belum Bayar" di atas (client-side).
2. Admin tap kartu anggota "Belum" → **langsung tercatat lunas Rp30.000 tanggal hari ini.** Tidak ada form, tidak ada halaman baru.
3. **Optimistic UI:** kartu langsung flip ke state Lunas (hijau) sebelum response server → POST `/api/payments` di background. Gagal → dibedakan per penyebab (oracle #1 fix): **`409 ALREADY_PAID`** (race double-submit/2 tab — anggota SUDAH lunas) → kartu TIDAK rollback ke Belum, melainkan settle ke state Lunas (truth server) + badge BARU dari `createdAt` payment existing + deep-link drawer via `existingPaymentId`; **gagal lain** (network/4xx/5xx non-409) → rollback kartu ke Belum + toast error.
4. Feedback tactile: `navigator.vibrate(45)` di mobile + **undo toast sonner 5 detik** "✓ {nama} Lunas (Rp 30.000)" dengan tombol "BATALKAN" — detail di sub-section Mitigasi Salah-Tap di bawah.
5. **Duplicate check client-side:** tap kartu yang sudah Lunas bulan ini → tidak POST; buka Drawer Edit/Hapus (mitigasi c) atau tampil pesan "Sudah lunas bulan ini". Server tetap validasi ulang via unique constraint → `409 ALREADY_PAID` (client check = UX shortcut, bukan pengganti validasi server).

**Mitigasi Salah-Tap (FINAL — keputusan sadar user 2026-09-02):**

Speed-Tap 1-tap sengaja tanpa konfirmasi demi kecepatan; salah-tap dimitigasi 3 lapis + haptic terbedakan:

- **a) Undo toast 5 DETIK** (final — 3s sempat dipertimbangkan, dinaikkan ke 5s; durasi singkat adalah trade-off SADAR: kecepatan alur > window undo panjang): POST langsung dieksekusi → **toast muncul SETELAH POST sukses 201** (bukan optimistic di waktu tap — tombol BATALKAN butuh `paymentId` dari response POST `PaymentDTO`; window 5 detik dihitung dari selesainya POST). Toast sonner `duration: 5000` + tombol aksi **"BATALKAN"** → tap BATALKAN = `DELETE /api/payments/{id}` (id dari response POST `PaymentDTO`) → kartu rollback ke Belum + toast konfirmasi "Pembayaran {nama} dibatalkan". **Tanpa konfirmasi tambahan di toast** (payment masih hangat, undo bukan aksi destruktif secara mental — beda dengan Hapus di drawer). POST gagal non-409 → tanpa undo toast, diganti toast error + rollback (lihat nomor 3 di atas).
- **b) Indikator "BARU"** di kartu anggota yang baru dicatat lunas:
  - Durasi: **10 menit** (`now − payment.createdAt < 10 menit`).
  - Storage 2 lapis, TANPA perubahan API/schema: **L1** session-memory `Map<memberId, timestamp>` di state roster (instan saat POST sukses, optimistic); **L2** join client-side `GET /api/payments?bulan=&tahun=` (endpoint admin existing, `PaymentDTO` sudah punya `createdAt`) — selamat refresh, indikator tetap tampil.
  - Visual (FINAL 2026-09-02 — **inline**, menimpa spec "absolute kanan-atas" sebelumnya): badge "BARU" disisipkan inline di baris atas kartu, di antara nama dan kotak ikon status. Struktur DOM baris atas (kartu roster 72px, mengacu mockup baris 1073-1077):
    - Container: `flex items-center justify-between gap-1 w-full`
    - Kiri: `<span class="text-xs font-bold text-black truncate flex-1 min-w-0">{nama}</span>` — nama menyusut (truncate) sementara selama badge tampil; harga termurah, admin scan status bukan baca nama penuh
    - Tengah (HANYA jika usia bayar < 10 menit): `<span class="pointer-events-none bg-neo-yellow border-1.5 border-black rounded px-1 text-[9px] font-extrabold uppercase shadow-neo-sm shrink-0">BARU</span>`
    - Kanan: kotak status ikon check/clock `shrink-0 p-0.5 border border-black rounded` (tidak berubah dari mockup)
  - Alasan posisi inline: menghindari tabrakan dengan ikon status kanan-atas DAN menghindari corner-straddle yang memicu tap collision antar kartu di grid `gap-2`. Badge `pointer-events-none` — seluruh kartu tetap satu tap target.
  - Muncul INSTAN tanpa animasi (badge BARU tidak punya animasi masuk — `popIn` TIDAK diimplementasikan, lihat §6) — kuning kontras di atas kartu hijau Lunas.
  - Hilang saat: usia > 10 menit, atau kartu di-undo/dihapus. **PATCH edit TIDAK menghapus badge** (`createdAt` tidak berubah).
  - **Independen dari toast:** badge TIDAK ikut hilang saat toast 5 detik berakhir.
- **c) Drawer Edit/Hapus (telat sadar):** tap kartu Lunas (lewat window undo) → bottom drawer `vaul` berisi detail payment + aksi **Edit** (PATCH, form prefill) + **Hapus** (DELETE + **konfirmasi destruktif** — sengaja beda dari undo toast yang tanpa konfirmasi). Catatan: drawer ini adalah **konsumen UI pertama** untuk PATCH/DELETE payment, dan `existingPaymentId` dari response `409 ALREADY_PAID` dapat dipakai deep-link langsung ke drawer ini.
- **d) Vibrate pattern dibedakan:** sukses catat `navigator.vibrate(45)`; undo/batal `navigator.vibrate([30, 40, 30])`.

**Protokol Event & Collision Guard (FINAL 2026-09-02):**

- **In-flight Tap Guard:** `useRef(new Set<string>())` melacak memberId yang sedang POST. Tap kedua saat masih in-flight → **silent ignore** (tidak error toast — kartu sudah dalam transisi). Setelah selesai (sukses/gagal) → hapus dari Set.
- **Long-Press Handler (Rapel Drawer):** aktif HANYA pada kartu status "Belum Bayar" (kartu Lunas → tap biasa membuka drawer edit/hapus, item c). Timer **450ms**; batal seketika jika `touchmove` bergeser > 10px dari koordinat awal (**scroll-safe**). Saat timer tercapai → haptic `navigator.vibrate(20)` sebagai sinyal drawer akan terbuka.
- **Non-blocking Scoped Undo:** panggilan `toast()`/`toast.custom()` sonner menyimpan `paymentId` spesifik di **closure** action BATALKAN — bukan state global yang bisa tertukar. Admin bebas tap anggota lain selagi toast 5 detik masih tampil; undo hanya berlaku untuk payment di closure toast itu.
- **Tap pada kartu Lunas (tabrakan makna):** pill teks membedakan affordance — "TAP LUNAS" (aksi catat) vs "LUNAS (tgl)" (status; tap → drawer detail/edit/hapus). Tetap dipertahankan.
- **Race double-submit lintas kartu / 2 tab:** client check + server unique constraint `409 ALREADY_PAID` dengan `existingPaymentId` → deep-link drawer (rujuk item c).

**(b) Bottom Drawer (`vaul`) — pembayaran rapel/kustom:**
1. Untuk nominal non-default (rapel, sumbangan) atau bulan/tanggal berbeda → admin **long-press 450ms** kartu "Belum Bayar" (scroll-safe, haptic `vibrate(20)` — detail di Protokol Event & Collision Guard) → **bottom drawer** terbuka.
2. Drawer slide-up dari bawah berisi form: nominal (prefill Rp30.000), bulan/tahun, tanggal (prefill hari ini).
3. Submit dari drawer → POST sama, toast sukses sama. Duplicate check sama (client + server 409).

Tidak ada lagi pola "tap nama → form expand in-place / accordion" (artefak v1.0, dihapus).

**Alur Catat Pengeluaran:**
1. Kategori via **Chip Pills** — **BUKAN native `<select>`**: Konsumsi, Acara, ATK, Sumbangan, Lain-lain (+ kategori custom). **Amendemen 2026-09-03: layout grid 2 kolom** (menggantikan horizontal scroll pills) dengan **color dot** kategori (`h-2 w-2 rounded-full border-[1.5px]`, inline style): Konsumsi `#86EFAC`, Acara `#FCA5A5`, ATK `#BAE6FD`, Sumbangan `#FED7AA`, Lain-lain `#DDD6FE`, kategori custom fallback `#F3F4F6` (sinkron token neo). Chip: `border-2 rounded-[10px] min-h-[36px] text-[11px] font-bold`, base `bg-white text-black shadow-[2.5px_2.5px_0_#000]`. **State terpilih** = **inverted** `bg-black text-white` + dot kuning `#FEF08A` + **translate permanen 2.5px** (`translate-x-[2.5px] translate-y-[2.5px]`) + `shadow-none`. **Keputusan implementasi 2026-09-03:** press chip memakai `neo-press` (translate 3.5px saat `:active`, offset sama dengan tombol lain) di atas shadow 2.5px, plus `transition-none` → press snap instan tanpa animasi, keputusan sadar (berbeda dari tombol form yang 100ms). Tombol "Tambah Kategori Baru" `col-span-2` dashed `bg-neo-yellow`.
2. Nominal besar (input voucher `text-2xl font-extrabold tabular-nums`), deskripsi, tanggal (default hari ini, readonly-style `bg-neo-gray` + ikon calendar).
3. Tombol "SIMPAN PENGELUARAN" `bg-neo-green` → toast sukses dengan aksi eksplisit "Input Lagi" (tidak auto-reset). Validasi `jumlah > 0` di client (toast "Nominal pengeluaran harus > 0") + server (Zod).

### 5.11 Empty & Loading States
- Empty: teks + CTA dalam neo-box, bukan halaman kosong.
- Loading: skeleton dengan border hitam + pulse, bukan spinner tanpa konteks.

### 5.12 Target Performa (target desain, belum terukur)
Sama seperti v1.0: FCP < 1.5s di 4G, filter client-side < 50ms, API CRUD < 500ms, JS halaman utama < 200KB gzip.

### 5.13 FASE perf (2026-09-03) — First Load JS
- `next.config.js`: `experimental.optimizePackageImports: ["lucide-react"]` — barrel-optimization otomatis Next (bukan tree-shake manual; import per-komponen tidak berubah).
- `next/dynamic` untuk **PaymentRapelDrawer** + **PaymentEditDrawer** (`pembayaran/page.tsx:31-32`) — drawer ter-code-split dari bundle awal roster; type-only import `RapelInput` tetap static.
- Tujuan: mengecilkan First Load JS halaman /pembayaran (roster Speed-Tap jadi render lebih cepat; drawer rapel/edit dimuat on-demand saat dibuka).

---

## 6. Motion & Animasi

Level: **ringan tapi tactile** — press-down adalah animasi utama, bukan transisi halaman mewah.

| Interaksi | Animasi | Durasi | Easing |
|---|---|---|---|
| Tap/press tombol & card | translate +3.5px x/y + shadow hilang via `neo-press` (roster card: +2.5px via `neo-press-md`) | 100ms | `cubic-bezier(0.4,0,0.2,1)` |
| Hover tombol | translate -1px, shadow +1.5px | 100ms | sama |
| Speed-tap sukses | `navigator.vibrate(45)` + kartu flip hijau + undo toast 5s | instan | — |
| Speed-tap undo/batal | `navigator.vibrate([30, 40, 30])` + kartu rollback + toast konfirmasi | instan | — |
| Drawer (vaul) | slide-up dari bawah + backdrop fade | 200ms | `ease-out` |
| Toast masuk | slide-down dari atas + fade | 200ms | `ease-out` |
| Badge BARU (lunas baru) | **TIDAK diimplementasikan** — badge BARU muncul tanpa animasi (keputusan sadar; bukan spesifikasi aktif) | — | — |
| Progress bar update | width transition | 300ms | default |
| Error field | shake halus + toast coral | 150ms | `ease-in-out` |
| Modal | fade backdrop + slide-up dari bawah | 200ms | `ease-out` |

**Aturan:**
- Semua < 300ms. Tidak ada animasi dekoratif (parallax, partikel).
- Press-down (`neo-press*` utility) TIDAK BOLEH dihapus — itu signature interaksi neo-brutalist; wajib via utility, jangan tulis ulang blob `active:translate` manual (lihat 5.2).
- Hormati `prefers-reduced-motion` (sudah ada di globals.css — pertahankan).

**Implementasi:** Tailwind transitions + keyframe `shake` di globals.css (error field). Library tambahan hanya **sonner** (toast) dan **vaul** (drawer/modal mobile) — tidak perlu Framer Motion.

---

## 7. Aksesibilitas

- Kontras WCAG AA: teks selalu hitam di atas warna flat terang (semua warna neo L tinggi — hitam di atasnya > 7:1); teks putih hanya di atas hitam pekat. Teks berwarna (`neo-darkgreen`/`neo-darkred`) hanya untuk nominal di atas putih.
- Status tidak pernah hanya warna — selalu ada teks ("✓ Lunas", "Belum", "Tap Rp 30k").
- Tap target ≥ 44×44px (tombol full-width `py-3.5`, roster card `p-3`, chip filter `min-h-[44px]`; bottom bar — amendemen 2026-09-03: `h-16` fixed → `py-2` auto-height + `pb-[env(safe-area-inset-bottom)]` tetap dipertahankan, tinggi link tetap `min-h-[44px]`; chip kategori pengeluaran kini `min-h-[36px]` sejak amendemen grid 2-col — **keputusan sadar user 2026-09-03 demi UX**, di bawah 44px, jangan dinaikkan tanpa arahan).
- Label form selalu terlihat (uppercase font-extrabold di atas input), bukan placeholder-only.
- `prefers-reduced-motion` menonaktikkan shake/press-translate.
- Border tebal justru membantu low-vision: batas elemen selalu eksplisit.
- Roster card keyboard-accessible (amendemen 2026-09-02): `tabIndex={0}` + Enter/Space → onTap + `focus-visible:ring-2 ring-inset ring-black`. Long-press (drawer rapel) tetap eksklusif pointer.

---

## 8. Referensi Implementasi

Token terdaftar di `tailwind.config.ts` (token lama v1.0 OKLCH/canvas/surface/primary SUDAH DIHAPUS pasca FASE-3 — UI neo-only). Isi blok di bawah (colors/boxShadow/borderWidth/fontFamily/plugins) sinkron dengan tailwind.config.ts aktual:

```ts
colors: {
  neo: {
    bg: "#FFFDF0", surface: "#FFFFFF", card: "#FFFFFF", black: "#000000",
    yellow: "#FEF08A", green: "#86EFAC", darkgreen: "#15803D",
    coral: "#FCA5A5", darkred: "#B91C1C", purple: "#DDD6FE",
    sky: "#BAE6FD", orange: "#FED7AA", pink: "#FBCFE8", gray: "#F3F4F6",
  },
},
boxShadow: {
  "neo-sm": "2px 2px 0px 0px #000000",
  neo: "3.5px 3.5px 0px 0px #000000",
  "neo-lg": "6px 6px 0px 0px #000000",
  "neo-xl": "10px 10px 0px 0px #000000",
},
borderWidth: { "1.5": "1.5px", "2.5": "2.5px", "3": "3px" },
fontFamily: {
  sans: ["var(--font-bricolage)", "system-ui", "sans-serif"],
  mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
},
plugins: [
  plugin(({ addComponents }) => {
    addComponents({
      // press-down neo-brutalist — konsolidasi blob duplikat (review 2026-09-03)
      ".neo-press": {
        transitionProperty: "transform, box-shadow, background-color, color",
        transitionDuration: "100ms",
        "&:active": { transform: "translate(3.5px, 3.5px)", boxShadow: "none" },
      },
      ".neo-press-md": { "&:active": { transform: "translate(2.5px, 2.5px)" } },
      ".neo-press-sm": { "&:active": { transform: "translate(2px, 2px)" } },
    });
  }),
],
```

Utility class gabungan via `clsx` + `tailwind-merge` (`cn()` helper). Dependencies UI: `lucide-react` (ikon), `sonner` (toast), `vaul` (drawer), `clsx`, `tailwind-merge`.

Acuan class/DOM per layar: `.agents/kassurs_ui_neobrutalism_final.html` — samakan struktur, jangan mengarang ulang.

> Amendemen 2026-09-03: mockup masih load JetBrains Mono — TIDAK diikuti; font mono di mockup digantikan Bricolage/generic mono stack.

---

## 🔄 Status

V2.2 Neo-Brutalism menggantikan total v1.0. FASE 1-3 + design review batch fix SELESAI (2026-09-02): 2 MAYOR + 4 MINOR + 7 NIT fixed — keyboard roster, ikon lucide BottomNav, toast error coral, header /pembayaran green, touch target 44px, prefix +62, shake error, drawer 200ms. E2E 10/10 pasca-fix. Mockup tetap ground truth visual KECUALI amendemen bertanggal 2026-09-02 yang tertulis di dokumen ini.
