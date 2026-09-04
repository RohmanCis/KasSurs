# HANDOFF — KasSurs

Handoff ramping: **keputusan mengikat → open tasks → issue/tech debt**. Detail eksekusi & history lengkap: git history + AGENTS.md.

**Status proyek:** T-01 s.d. T-37 + Modul R (UI V2.2) + semua batch polish/review/audit SELESAI. Sisa: T-38–T-39 Deployment. Verifikasi terakhir (2026-09-04): tsc clean, build OK, **E2E 10/10** (4 spec), **Vitest 161/161** (29 files, 2026-09-04 — utang verifikasi batch 2026-09-04 LUNAS). Tidak ada utang verifikasi tersisa.

---

## 1. Keputusan yang masih mengikat (jangan dilanggar/diulang)

### Produk / PRD (V1.2)
- **FR-06 Speed-Tap FINAL:** 1-tap tanpa konfirmasi = default. Mitigasi 3 lapis: undo toast 5s + BATALKAN (closure-scoped paymentId), badge BARU 10 mnt (L1 session + L2 `createdAt`), drawer edit/hapus (Hapus wajib konfirmasi). Vibrate: 45ms / `[30,40,30]` / 20ms.
- **FR-07:** chip filter + search nama GABUNGAN. **FR-09:** kategori grid 2-col + color dot. **FR-12:** /pembayaran terpisah /dashboard; BottomNav 5 tab.
- **FR-23:** snapshot laporan beku; `?regenerate=true` satu-satunya jalan ubah; tanpa audit log snapshot.
- **FR-24 (WA reminder):** tombol WA deep-link wa.me **EKSKLUSIF di row /anggota** — jangan re-add ke /pembayaran tanpa arahan user. Solid `neo-green` dicadangkan untuk status LUNAS saja; WA = secondary outline `bg-white`/`neo-darkgreen`.
- **409 ≠ gagal generik:** settle kartu Lunas + badge dari `createdAt` existing + deep-link drawer edit via `existingPaymentId`. Gagal lain = rollback + toast error.
- Long-press 450ms hanya kartu Belum (scroll-safe >10px); kartu LUNAS tap = drawer edit. Rapel tetap long-press + hint — **keyboard path rapel BELUM ada (kandidat follow-up, jangan tambah tanpa arahan)**.
- Semantik periode SPLIT: totalMasuk = accrual (bulan/tahun Payment), totalKeluar = cash-flow (tanggal Expense), saldo = semua-histori.
- Roster /pembayaran fixed bulan berjalan (payment cross-month tak ter-edit dari UI setelah undo window — limitasi desain diterima).
- Anggota nonaktif + token valid tetap akses selama rutin buka app (sliding session; cabut akses = reset PIN). Session sliding 30 hari, re-issue saat sisa < 15 hari.
- Promote ADMIN hanya via database; role default ANGGOTA. Member nonaktif boleh dicatat payment (rapel).

### Arsitektur (hasil refactor — jangan diregres)
- `src/lib/format.ts` = satu sumber NAMA_BULAN/formatRupiah/todayISO (WIB-safe via `wibDateParts()`)/toWaNumber/waReminderUrl. `src/lib/validation.ts` = dateOnly/minimalSatuField/parseBulanTahunQuery. Jangan duplikat ulang di route/komponen.
- `src/lib/api/{respond,session}.ts` + `src/lib/dto/*` = API Handler Kit (11/13 route; login/logout tidak dimigrasi — by design). P2002/P2003 catch tetap di route; RBAC 403 tetap middleware.
- /dashboard + /status = RSC (`src/lib/dashboard.ts`); **JANGAN konversi** pembayaran/anggota/pengeluaran/laporan (stateful berat, ROI buruk).
- UI Neo-Brutalism V2.2: token V1.0 (OKLCH/canvas/surface/primary) SUDAH DIHAPUS — jangan pakai. `neo-press` utility wajib untuk tombol/kartu interaktif. Font Bricolage subset 400/700/800 (max 800 — `font-black` clamp senyap).
- Toast aksi = NEO_ACTION_STYLE putih/hitam (SEMUA halaman, termasuk /pengeluaran — sinkron 2026-09-04).
- **Kandidat #2 useApiData NO-GO permanen** (ROI negatif — 5 alasan kuantitatif, eval 2026-09-03). Re-evaluasi hanya jika: (a) halaman stateful baru gagal RSC + butuh fetch-list client berulang, ATAU (b) duplikasi ≥3 halaman unik.
- **YAGNI ditolak bersama:** pagination, caching/SWR/revalidate, dynamic import jsPDF/xlsx, virtualisasi list, tree-shake manual lucide-react.
- Chip kategori 36px + safe-area-inset-bottom BottomNav = **keputusan sadar user** — jangan "perbaiki" ke 44px / hapus safe-area.

### Testing (protektif)
- Test DB Docker `kassurs-test-db` (5433). `docker start` dulu. Vitest serial, wiring `tests/setup-env.ts`. Salt per-file noHp (huruf terpakai s.d. `t` — file baru pakai huruf berikutnya; detail AGENTS.md gotcha #9).
- **E2E globalSetup purge + timeout 60s (`tests/e2e/global-setup.ts` + `playwright.config.ts`) — JANGAN DIHAPUS.** Tanpa purge, data "E2E ..." menumpuk → roster besar → test drawer timeout (kejadian 2026-09-04: 192+ member → speed-tap #3/#4 gagal full-suite walau hijau solo).
- `summary-race.test.ts` pakai assert relatif baseline (absolute count tidak deterministik).
- Tombol aksi sonner tidak bisa diberi data-testid → `getByRole("button", { name: "BATALKAN" })`.
- Skip disengaja (timing-dependent, YAGNI): expiry badge, undo 5s, in-flight guard, sonner stacking.

---

## 2. Open tasks (urutan)

1. **T-38–T-39 Deployment** — Vercel env vars (`DATABASE_URL` pooler 6543, `DIRECT_URL` session-mode pooler 5432 — pola gotcha #2 AGENTS.md, `JWT_SECRET`, `SEED_ADMIN_*`) → `prisma migrate deploy` + `prisma db seed`. Opsional: `TZ=Asia/Jakarta` di Vercel (todayISO sudah WIB-safe; TZ hanya guard kode baru yang lupa pakai format.ts).

---

## 3. Issue terbuka / Tech debt

- **Keyboard path rapel** /pembayaran belum ada (long-press pointer-only) — kandidat follow-up, menunggu arahan user.
- **Minor visual critique CANCELLED** (tersimpan di snapshot `.impeccable/critique/2026-09-04T00-00-55Z__src-app.md`): kamu/Anda inkonsisten, "Rp 30k" vs "Rp 30.000", `text-[8px]` pill, tabular-nums toast.
- **`text-slate-*` teks sekunder ~30 titik tanpa token** — kandidat `neo-ink-muted` hanya kalau mockup direvisi/dark mode dibahas.
- **Issue laten DITUTUP user 2026-09-03** (trade-off V1, jangan re-open): race upsert `reportSnapshots`, P2003 inspection, `verifySession` tanpa cek `statusAktif`.
- Cookie `sameSite: "strict"` — ganti `"lax"` hanya jika nanti ditambah OAuth callback (catatan future-proofing, bukan bug).

---

## Kredensial dev

- Admin: `081213024017` / PIN `000000`
- `npm run dev -- -p 3100` → login `/login`
