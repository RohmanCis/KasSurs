# HANDOFF — KasSurs

Handoff untuk agent/session berikutnya. Format: **Keputusan yang masih mengikat → History (ringkas, per tanggal) → Blocker/Issue terbuka**. Detail eksekusi harian ada di git history.

**Status proyek:** T-01 s.d. T-37 + Modul R (UI Neo-Brutalism V2.2) + design-review batch fix + QA manual fix SELESAI. Sisa T-38–T-39 (Deployment). Verifikasi terakhir (2026-09-02): tsc clean, vitest 138/138 (27 files), E2E 10/10 (4 spec, re-run user pasca design fix).

---

## 1. Keputusan yang masih mengikat (jangan dilanggar/diulang)

### Produk / PRD (V1.1 — 2026-09-02)
- **FR-06 Speed-Tap FINAL:** 1-tap tanpa konfirmasi = mode default (trade-off sadar: kecepatan > window undo). Mitigasi salah-tap 3 lapis: undo toast **5 detik** + BATALKAN (tanpa konfirmasi tambahan), badge **BARU 10 menit** (2 lapis: L1 session-memory + L2 join `createdAt` — tanpa perubahan API/schema), drawer edit/hapus (Hapus **wajib konfirmasi destruktif** — beda dari undo). Vibrate: sukses 45ms, undo `[30,40,30]`, long-press 20ms.
- **FR-07:** chip filter + search nama GABUNGAN (bukan salah satu) — keputusan user 2026-09-02.
- **FR-09:** kategori = horizontal chip pills (bukan `<select>`).
- **FR-12:** /pembayaran tetap halaman terpisah dari /dashboard; BottomNav 5 tab.
- **409 ≠ gagal generik:** 409 = settle kartu ke Lunas + badge dari `createdAt` existing + deep-link drawer via `existingPaymentId`; gagal lain = rollback + toast error.
- **Undo toast muncul SETELAH POST 201** (BATALKAN butuh paymentId dari response), paymentId di closure per-toast (bukan state global), sonner default stack.
- Long-press 450ms **hanya kartu Belum**; scroll-safe >10px; kartu LUNAS tap = drawer edit.
- FR-23 snapshot laporan beku; `?regenerate=true` satu-satunya jalan ubah snapshot; TANPA audit log snapshot (keputusan user).
- Semantik periode SPLIT: totalMasuk = accrual (kolom bulan/tahun Payment), totalKeluar = cash-flow (rentang tanggal Expense), saldo = semua-histori (angka otoritatif).
- Roster /pembayaran **fixed bulan berjalan** (switcher periode dibuang FASE-3; rapel lintas bulan via drawer). Konsekuensi diterima: payment cross-month tak ter-edit dari UI setelah undo window (limitasi desain).
- Anggota nonaktif dengan token valid tetap akses selama rutin buka app (sliding session; cabut akses = reset PIN) — keputusan sadar user.
- Session **sliding 30 hari**, re-issue middleware saat sisa < 15 hari.
- Promote ADMIN hanya via database; role default ANGGOTA.
- Member nonaktif BOLEH dicatat payment (rapel) — tidak mengurangi `jumlahBelumBayar` (hanya member aktif).

### Testing
- Test DB terisolasi: Docker `kassurs-test-db` (port 5433, user postgres, pass kassurs_test). `docker start` dulu. Vitest serial (`fileParallelism: false`), wiring `tests/setup-env.ts`.
- Salt per-file untuk noHp unik: huruf terpakai s.d. `t` (lihat AGENTS.md gotcha #9).
- `summary-race.test.ts` pakai assert **relatif baseline** (turun N / rentang [S−3,S]) — absolute count tidak deterministik di DB shared dengan data sisa E2E (fix 2026-09-02).
- E2E: tombol aksi sonner TIDAK bisa diberi data-testid (limitasi API) — pakai `getByRole("button", { name: "BATALKAN" })`.
- Skip disengaja (YAGNI): expiry badge 10 mnt & undo 5s & in-flight guard & sonner stacking tidak di-E2E (timing-dependent).

### UI (V2.2)
- Token V1.0 (OKLCH/canvas/surface/primary/dst.) SUDAH DIHAPUS dari tailwind.config.ts + globals.css — UI neo-only. Jangan pakai.
- `type StatusBadgeStatus` hidup di `FilterBar.tsx` (dipindah dari StatusBadge.tsx yang dihapus).
- Deviasi desain disetujui: `member-card-{memberId}` testid (bukan nama), export button custom press-down, tanggal pengeluaran editable, PIN box masked, header /anggota purple.
- **Design review batch fix (2026-09-02, semua terverifikasi + E2E re-run 10/10):**
  - MAYOR: MemberCard roster kini keyboard-accessible (`tabIndex={0}` + Enter/Space → onTap + focus-visible ring; long-press tetap eksklusif pointer); BottomNav pakai lucide-react (`Home/Users/Wallet/ArrowDownToLine/FileText`, stroke 2.5) — SVG inline dihapus.
  - MINOR: toast error = `bg-neo-coral` via sonner `classNames` per-status (default/success tetap kuning); header /pembayaran = `bg-neo-green` (warna 5.7 lain sudah terpakai); touch target ≥44px (chip filter, chip kategori, panah periode h-11 w-11, LogoutButton/status `min-h-[44px]`); prefix "+62" login sesuai resep 5.6 (kontrak data tetap `08...`).
  - NIT: dead ternary login dihapus; badge "BCRYPT HASH" `font-mono`; cell passbook kosong `text-slate-600` (AA); border-r progress bar kondisional `persen > 0`; BottomNav `border-t-3` + tab press-down 2px; keyframe `shake` 150ms di banner error login (reduced-motion aman); drawer vaul 200ms via override `[data-vaul-drawer]/[data-vaul-overlay] !important` (vaul 1.1.2 tanpa prop durasi).
  - Catatan arsitektural (bukan issue): `text-slate-*` teks sekunder ~30 titik tanpa token — kandidat `neo-ink-muted` kalau mockup direvisi/dark mode dibahas.
- **QA manual post-review (2026-09-02, 2 bug dari testing user, kedua fixed):**
  - `/anggota` row: ring focus persegi tajam tak selaras saat klik — button row kini `rounded-[10px]` (12px kartu − 2px border) + `focus:` → `focus-visible:` (ring hanya keyboard, tidak flash saat tap). `anggota/page.tsx:436`.
  - `/pembayaran` search: ikon meleset ~7px — efek samping fix m3b (wrapper stretch 44px, input tetap py-1). Input `+h-full`, ikon `left-3 h-4 w-4 stroke-[2.5]`, input `pl-10`. Bonus: touch target search 44px. `pembayaran/page.tsx:491,501`.

---

## 2. History (ringkas)

- **2026-08-30:** Modul 0–6 (T-01–T-34) — setup, auth, member, payment, expense, dashboard, reports (incl. FR-22 bootstrap admin, FR-23 snapshot).
- **2026-09-01:** Modul 7 (T-35–T-37) + QA manual (3 temuan fixed: root redirect by-role, logout admin, reaktivasi anggota) + sliding session + test DB Docker terisolasi (menggantikan skema 1-DB Supabase yang dibatalkan hari sama). Bug race `report-snapshot.ts` fixed (`pg_advisory_xact_lock`).
- **2026-09-02 (FASE-REDESIGN):**
  - **F-1 fondasi:** DESIGN V2.2, deps (lucide-react/sonner/vaul/clsx/tailwind-merge), token neo, font Bricolage+JetBrains Mono, Toaster.
  - **F-2 komponen atomik:** cn(), NeoButton, TreasuryHero, MemberCard (gesture engine pointer-events), PassbookCard.
  - **F-3 (4 langkah, gate user per langkah + 2 oracle review):** PRD V1.1 → integrasi 7 halaman → E2E update+baru → restyle /anggota (keputusan user: restyle dulu, baru cleanup) → cleanup penuh (6 komponen mati dihapus, token V1.0 dibersihkan).
  - **5 bug nyata ditemukan & fixed (semua punya regression guard E2E):** long-press LUNAS mem-block onTap (oracle #1); drawer cross-month 409 tak terbuka + kartu salah flip (E2E); PATCH cross-month→roster tak flip LUNAS (oracle #2); badge BARU tampil di kartu BELUM saat 409 cross-month (oracle #2); `todayISO()` UTC salah hari WIB 00:00–06:59 (oracle #2).
  - Oracle review #1 (PRD) & #2 (pasca-E2E): semua MUST-FIX clear.
  - **Design review pasca-Modul R (agent designer):** 0 CRITICAL; 2 MAYOR + 4 MINOR + 7 NIT ditemukan → SEMUA fixed batch sama hari (detail di bagian UI). E2E re-run user: 10/10. popIn badge BARU sengaja di-skip (opsional by spec §6).
  - **QA manual user:** 2 bug visual (focus ring persegi kartu /anggota, ikon search /pembayaran meleset) → fixed, tsc clean (detail di bagian UI).

---

## 3. Blocker / Issue terbuka

- **T-38–T-39:** Vercel env vars (DATABASE_URL pooler 6543, DIRECT_URL pooler session-mode 5432 — pola gotcha #2, JWT_SECRET, SEED_ADMIN_*) → `prisma migrate deploy` + `prisma db seed` production.
- Known-untested (laten, low risk): upsert `reportSnapshots` race path; P2003 field_name inspection; `verifySession` JWT-only tanpa cek statusAktif DB (trade-off V1 accepted).
- Sisa data E2E di test DB (anggota "E2E...", payment, snapshot) — by design, terisolasi, vitest tetap hijau dengannya.

---

## Kredensial dev

- Admin: `081213024017` / PIN `000000`
- `npm run dev -- -p 3100` → login `/login`
