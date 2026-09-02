# QA Manual — KasSurs (Local)

Checklist QA end-to-end + temuan. Kerjakan berurutan. Update kolom Hasil saat QA (✅ pass / ❌ fail / — skip).

**Persiapan:**

```powershell
docker start kassurs-test-db   # tidak wajib untuk QA manual (QA pakai dev DB)
npm run dev -- -p 3100
```

Buka `http://localhost:3100/login`. Admin: `081213024017` / PIN `000000`.

> ✅ Setelah login kamu langsung diarahkan by-role: ADMIN → `/dashboard`, ANGGOTA → `/status` (fix Temuan #1).

---

## 1. Login Admin

| # | Aksi | Harusnya | Hasil |
|---|---|---|---|
| 1.1 | Kosongkan form → **Masuk** | Tidak submit, validasi muncul | |
| 1.2 | PIN salah → **Masuk** | Merah: "Nomor HP atau PIN salah." | |
| 1.3 | Kredensial benar → **Masuk** | Langsung mendarat `/dashboard` (ADMIN) / `/status` (ANGGOTA) | ❌ Temuan #1 → FIXED |

⚠️ Jangan test lockout 5x salah PIN dengan akun admin di awal — terkunci 15 menit dan memblokir sisa QA. Test lockout paling akhir / pakai akun anggota dummy.

## 2. Dashboard Admin

| # | Aksi | Harusnya | Hasil |
|---|---|---|---|
| 2.1 | Lihat SaldoCard | Saldo = total masuk − keluar, format Rp, angka rata (tabular) | |
| 2.2 | Kartu "Belum Bayar" | Angka = anggota aktif belum bayar bulan ini | |
| 2.3 | Refresh halaman | Tetap login (cookie 30 hari sliding), data sama | |
| 2.4 | Cari tombol logout | — | ❌ Temuan #2 |

## 3. Anggota (CRUD)

| # | Aksi | Harusnya | Hasil |
|---|---|---|---|
| 3.1 | Tab **Anggota** → **Tambah Anggota** | Form: nama, no HP, PIN | |
| 3.2 | Isi lengkap (`QA Test` / `089900000001` / PIN `111111`) → Simpan | Muncul di list, badge "Belum Bayar" | |
| 3.3 | Tambah lagi no HP sama | Pesan no HP sudah terdaftar | |
| 3.4 | Edit nama → Simpan | Nama berubah | |
| 3.5 | Nonaktifkan anggota QA | Badge "Nonaktif", opasitas turun, tidak hilang dari list | |
| 3.6 | Coba aktifkan kembali | — | ❌ Temuan #3 |

## 4. Catat Pembayaran

| # | Aksi | Harusnya | Hasil |
|---|---|---|---|
| 4.1 | Tab **Pembayaran** | "QA Test" di atas (belum bayar duluan), periode = bulan ini | |
| 4.2 | Ketik nama di search | List terfilter live | |
| 4.3 | Tap nama → form expand | Prefill Rp 30.000 + tanggal hari ini | |
| 4.4 | Ubah nominal → **Simpan** | Toast "tersimpan" + badge row jadi **Lunas**; toast TIDAK auto-hilang, ada **Input Lagi** | |
| 4.5 | Tap nama yang sudah lunas | Pesan inline "Sudah lunas bulan ini" — bukan form | |
| 4.6 | Geser periode ‹ bulan lalu → catat rapel | Bisa | |

## 5. Pengeluaran

| # | Aksi | Harusnya | Hasil |
|---|---|---|---|
| 5.1 | Tambah pengeluaran (kategori, deskripsi, jumlah, tanggal) → Simpan | Entry muncul, saldo dashboard berkurang | |
| 5.2 | Edit jumlah → Simpan | Berubah | |
| 5.3 | Hapus → konfirmasi | Hilang, saldo kembali | |

## 6. Laporan (Export)

| # | Aksi | Harusnya | Hasil |
|---|---|---|---|
| 6.1 | **Export PDF** | `laporan-kas-YYYY-MM.pdf` ter-download, isi benar | |
| 6.2 | **Export Excel** | `.xlsx` ter-download, 2 sheet (Ringkasan + Transaksi) | |
| 6.3 | Export PDF lagi periode sama | Angka SAMA persis (snapshot beku, FR-23) | |

## 7. Login Anggota (self-service)

| # | Aksi | Harusnya | Hasil |
|---|---|---|---|
| 7.1 | Login anggota QA (`089900000001`/`111111`) → **Status** | Saldo umum + "Iuran Saya" | |
| 7.2 | "Iuran Saya" | Bulan yang dibayar di langkah 4 badge **Lunas** | |
| 7.3 | Coba akses fungsi admin | Ditolak; tidak ada aksi edit di mana pun | |
| 7.4 | Tombol **Keluar** di /status | Logout → /login | ✅ (Keluar hanya ada di /status anggota) |

## 8. Terakhir: Lockout (opsional — mengunci akun 15 menit)

| # | Aksi | Harusnya | Hasil |
|---|---|---|---|
| 8.1 | Login anggota QA, PIN salah 5x | 5× pesan salah | |
| 8.2 | Percobaan ke-6 walau PIN benar | 429: akun terkunci 15 menit | |

---

## Temuan QA (2026-09-01)

### #1 — Login admin tidak langsung ke dashboard (FIXED, 2026-09-01)
Setelah login sukses, `router.push("/")` → root "/" masih halaman stub statis. Admin harus tap Dashboard manual.
**Fix:** `src/app/page.tsx` kini server component redirect by-role: ADMIN → `/dashboard`, ANGGOTA → `/status`, tanpa sesi → `/login`. E2e login spec diperkuat (assert URL landing langsung). Verifikasi: e2e 4/4.

### #2 — Tidak ada tombol logout (FIXED, 2026-09-01 — kasus sebenarnya: ADMIN)
Tombol **Keluar** hanya ada di `/status` (anggota). Halaman admin (dashboard/pembayaran/pengeluaran/anggota/laporan) TIDAK punya logout.
**Fix:** `src/components/ui/LogoutButton.tsx` (reusable, pola persis /status: POST `/api/auth/logout` → `/login`) di header kanan-atas 5 halaman admin. Keputusan desain: header, bukan tab ke-6 BottomNav — 5 tab sudah rapat di 360px; logout frekuensi rendah; konsisten pola /status.

### #3 — Anggota nonaktif tidak bisa diaktifkan kembali (FIXED, 2026-09-01 — opsi A)
Nonaktifkan dulunya satu arah: `POST /api/members/[id]/deactivate` set `statusAktif=false`, `PATCH /api/members/[id]` hanya terima `nama`/`noHp`/`pin`.
**Fix (opsi A, disetujui user):**
- Backend: `statusAktif: true` opsional di `updateMemberSchema` PATCH (`src/app/api/members/[id]/route.ts`) + `UpdateMemberRequest` di `src/lib/types.ts`. `statusAktif: false` **DITOLAK 400** — penonaktifan wajib lewat endpoint deactivate (last-admin guard tidak bisa dilewati via PATCH). Audit UPDATE tercatat (dataLama/dataBaru membawa statusAktif).
- UI: tombol **"Aktifkan Kembali"** di panel aksi row nonaktif pada /anggota — langsung PATCH tanpa konfirmasi (reversible, beda dengan nonaktifkan yang destruktif); toast "aktif kembali" + refresh list (statusBayarBulanIni stale selama nonaktif).
- Test: `tests/integration/members-reactivate.test.ts` (salt `t`) — 3 case: reaktivasi sukses + audit, penolakan `false` 400 + DB tak berubah, gabung `statusAktif+nama`.
**Verifikasi:** vitest 138/138 (27 files), tsc clean, build pass.

---

## Cara mencatat temuan QA berikutnya

Semua temuan QA dicatat langsung di file ini (dibaca otomatis oleh agent di sesi berikutnya — direferensikan AGENTS.md & HANDOFF.md). Template per temuan:

```markdown
### #4 — <judul singkat> (OPEN, <tanggal>)
**Langkah reproduksi:** <baris checklist mana — mis. "4.4" — + apa yang kamu lakukan>
**Harusnya:** <perilaku yang diharapkan>
**Terjadi:** <yang benar-benar terjadi — copy pesan error persis; screenshot ke .agents/screenshots/ kalau visual>
```

Aturan singkat:
- Satu temuan = satu section `### #N`, nomor lanjut dari terakhir (berikutnya #4).
- Status di judul: `OPEN` → agent konfirmasi & verifikasi kode → jadi `CONFIRMED, bug` / `BY DESIGN, bukan bug` / `FIXED <tanggal>`.
- Boleh bahasa bebas/singkat — agent yang merapikan ke format saat triage.
- Alternatif kalau tidak mau buka file: chat saja ke agent dengan format bebas ("QA temuan: ...") — agent yang akan mencatatnya ke sini.
- Riwayat temuan TIDAK dihapus — audit trail QA.
