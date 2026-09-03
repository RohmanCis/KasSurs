# HANDOFF — KasSurs

Handoff untuk agent/session berikutnya. Format: **Keputusan yang masih mengikat → History (ringkas, per tanggal) → Blocker/Issue terbuka**. Detail eksekusi harian ada di git history.

**Status proyek:** T-01 s.d. T-37 + Modul R (UI Neo-Brutalism V2.2) + design-review batch fix + QA manual fix + code review 2-axis + fix batch + **UI polish & perf batch (2026-09-03, lihat bagian "UI Polish & Perf Batch")** SELESAI. Sisa T-38–T-39 (Deployment). Verifikasi terakhir (2026-09-03, pasca review fix batch commit `9568a66`): tsc clean, vitest **161/161** (29 files), build OK, E2E 10/10 (4 spec), curl live: 5 security headers terpasang. Batch UI polish terakhir: tsc clean (verifikasi build/E2E menyusul kalau ada tanda regresi — perubahan murni presentational).

---

## 1. Keputusan yang masih mengikat (jangan dilanggar/diulang)

### Produk / PRD (V1.1 — 2026-09-02)
- **FR-06 Speed-Tap FINAL:** 1-tap tanpa konfirmasi = mode default (trade-off sadar: kecepatan > window undo). Mitigasi salah-tap 3 lapis: undo toast **5 detik** + BATALKAN (tanpa konfirmasi tambahan), badge **BARU 10 menit** (2 lapis: L1 session-memory + L2 join `createdAt` — tanpa perubahan API/schema), drawer edit/hapus (Hapus **wajib konfirmasi destruktif** — beda dari undo). Vibrate: sukses 45ms, undo `[30,40,30]`, long-press 20ms.
- **FR-07:** chip filter + search nama GABUNGAN (bukan salah satu) — keputusan user 2026-09-02.
- **FR-09:** kategori = chip pills (bukan `<select>`) — **amendemen 2026-09-03: grid 2 kolom + color dot** (menggantikan horizontal scroll; detail resep 3-DESIGN §5.10).
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

### FASE 3 — Server Component Refactor (2026-09-03) — DIEKSEKUSI & ORACLE-VERIFIED
Blueprint oleh oracle (temuan KRITIS di plan: `todayISO()`/display bulan pakai local-time server Vercel=UTC → regredi WIB; mitigasi `wibDateParts()`). Eksekusi fixer + verification review oracle: **8 poin CLEAN, 0 KRITIS/MAYOR**, verdict "FASE 3 SELESAI & TERVERIFIKASI".
- `src/lib/format.ts`: +`wibDateParts()` (UTC+7 manual, server-safe) — DISPLAY bulan/tahun RSC; `getDashboardSummary` TETAP UTC (konsisten storage).
- `src/lib/dashboard.ts` (BARU): `getDashboardSummary(session)` — ekstrak bulat 6-query + role-gate dari route summary (kontrak identik); route jadi thin handler.
- `src/app/(admin)/dashboard/page.tsx` + `src/app/(member)/status/page.tsx`: client → RSC (fetch server via lib/prisma langsung, BUKAN HTTP loop). Role guard baru symmetric: ANGGOTA di /dashboard → /status, ADMIN di /status → /dashboard (mirror root). Status page: query inline payments pribadi + `toPaymentDTO` inline (ponytail: unify saat Kit #1). Markup identik.
- `loading.tsx` route-level baru di kedua route group (skeleton match konten riil; skeleton/error internal dihapus — no double-skeleton). Error RSC → root `error.tsx`.
- `LogoutButton`: +prop `testId` (status pakai `status-logout`, default tak berubah).
- Pasca-review, 2 NIT pre-existing difix: `statusAktif` kini dari DB (`member.findUnique` dalam Promise.all — nonaktif tampil benar), nama anggota dari record member (bukan derive payments).
- `/dashboard` & `/status` kini ƒ dynamic (expected — authenticated RSC baca cookie). Sliding session middleware tetap berlaku utk RSC payload fetch.
- E2E 9/10 + flake pass 2× (cold-compile). Smoke live: data ter-stream di HTML pertama. YANG TIDAK dikonversi (mengikat): pembayaran/anggota/pengeluaran/laporan — stateful berat, ROI buruk.

### FASE 1 + FASE 2 + error.tsx — DIEKSEKUSI & QA-VERIFIED (2026-09-03, sesudah plan disetujui)
**FASE 1 Quick Wins ✅:** S2 field `jumlahAnggotaAktif`+`jumlahLunas` di `DashboardSummaryResponse` (additive, `jumlahBelumBayar` tetap admin-only; query `sudahBayarBulanIni` keluar gate admin — aggregate org-wide, FR-14, aman); dashboard hapus fetch `/api/members` (−1 RTT); font subset Bricolage `["400","700","800"]` (class medium/semibold→bold, black→extrabold); skeleton match (dashboard 4-baris ±230px, status kupon 200px/matriks 180px); 5 security headers + `poweredByHeader:false` + `reactStrictMode:true` di `next.config.js` (terverifikasi live via curl). M1 pengeluaran = no-op (fetch sudah paralel). Deviasi tercatat: `dashboard.test.ts` assert exact-key diupdate utk field baru (kontrak additive).
**FASE 2 Mechanical Polish ✅:** `transition-all` → scoped 13 titik (+pengecualian benar: TreasuryHero `transition-[width]`, not-found `transition-[transform,box-shadow]`); hover di-gate `[@media(hover:hover)]:hover:` (NeoButton/MemberCard/BottomNav — 0 raw hover tersisa); `React.memo(MemberCard)` + 9 handler useCallback (dep array diverifikasi oracle akurat; efektif utk search/chip, in-flight tap re-render semua = trade-off diterima); `toast.dismiss()` sebelum toast.error pengeluaran; `.tabular` mati dihapus; PIN box `h-11`.
**error.tsx + not-found.tsx ✅:** root-level, Neo-Brutalism, `reset()` via NeoButton, digest ditampilkan (bukan `error.message`), 404 live terverifikasi. `global-error.tsx` sengaja skip.
**QA (oracle verification-planning, 6 klaim C1–C6) — SEMUA CLEAN, verdict "LULUS FASE 3":** 0 KRITIS/MAYOR. E2E re-run 10/10 ×2 (run pertama 1 flake cold-compile gotcha #4, bukan regresi). 2 MINOR sudah fixed: (1) status page kini render "X dari Y anggota sudah bayar bulan ini" di kartu transparansi (FR-14), (2) test ANGGOTA lock `toHaveProperty("jumlahLunas"/"jumlahAnggotaAktif")`. 1 NIT diterima: opacity isPending instant toggle (trade-off repaint, disengaja).
**File berubah FASE 1–2+QA:** `src/lib/types.ts`, `src/app/api/dashboard/summary/route.ts`, `src/app/(admin)/dashboard/page.tsx`, `src/app/(member)/status/page.tsx`, `src/app/(admin)/pembayaran/page.tsx`, `src/app/(admin)/laporan/page.tsx`, `src/app/(admin)/anggota/page.tsx`, `src/app/(auth)/login/page.tsx`, `src/app/layout.tsx`, `next.config.js`, `src/app/globals.css`, `src/components/ui/NeoButton.tsx`, `src/components/dashboard/MemberCard.tsx`, `src/components/layout/BottomNav.tsx`, `src/components/dashboard/TreasuryHero.tsx`, `src/components/forms/LoginForm.tsx`, `src/components/forms/ExpenseForm.tsx`, `src/app/error.tsx` (baru), `src/app/not-found.tsx` (baru), `tests/integration/dashboard.test.ts`.

### UI Polish & Perf Batch (2026-09-03) — DIEKSEKUSI
Batch perubahan user-initiated (6 file), murni presentational + 1 config perf; kontrak API/logic tidak berubah:
- **`next.config.js`:** +`experimental.optimizePackageImports: ["lucide-react"]` (barrel-optimization otomatis Next — BUKAN tree-shake manual yang sempat ditolak YAGNI; 1 baris config, tidak mengubah import).
- **`src/components/ui/FilterBar.tsx`:** select `appearance-none` + chevron SVG overlay `SelectWrapper` (panah native tidak konsisten antar browser). Amendemen 3-DESIGN §5.6.
- **`src/components/forms/ExpenseForm.tsx`:** kategori horizontal scroll pills → **grid 2-col + color dot** per kategori (map `KATEGORI_DOT`, custom fallback `#F3F4F6`); chip aktif dot kuning; tombol "Tambah Kategori Baru" `col-span-2`. Amendemen FR-09 + 3-DESIGN §5.10. Chip `min-h-[36px]` (turun dari 44px — catat di §7 3-DESIGN).
- **`src/components/layout/BottomNav.tsx`:** `h-16` fixed → `py-2` auto-height. **`pb-[env(safe-area-inset-bottom)]` dihapus lalu DIRESTORE keputusan user 2026-09-03** (fix terpisah pasca batch — tanpa safe-area, tab nempel home-indicator iOS; env() = 0 di perangkat tanpa notch, zero dampak lain). Chip kategori `min-h-[36px]` (turun dari 44px) = **keputusan sadar user untuk UX lebih enak** — bukan kelalaian, jangan "perbaiki" ke 44px tanpa arahan user.
- **`src/app/(admin)/dashboard/page.tsx`:** kartu "Belum Bayar N" — angka `font-mono text-2xl` (generic mono stack), label `text-neo-darkred`, `text-base font-extrabold`.
- **`src/app/(admin)/pembayaran/page.tsx`:** PaymentRapelDrawer + PaymentEditDrawer via `next/dynamic` (code-split drawer dari initial bundle roster; type-only import `RapelInput` tetap static).
- Verifikasi: tsc clean. E2E tidak re-run (perubahan presentational; testid & perilaku interaksi tidak disentuh — `bottom-nav`, chip, drawer testid tetap).

### Code Review 2-Axis + Fix Batch (2026-09-03, commit `be3d299` + `9568a66`) — SELESAI
Review menyeluruh diff `db3e822` → working tree (FASE 1-3 + deepening #3/#4 + Kit #1) via 2 sub-agent paralel (Standards axis + Spec axis). Hasil: Standards 0 hard violation (4 MINOR + 2 NIT smell); Spec 0 KRITIS/0 MAYOR, 0 scope creep, semua item plan terverifikasi terimplementasi.
- **Fixed:** (1) `todayISO()` kini delegasi `wibDateParts()` — sebelumnya local-time methods, latent trap kalau dipakai RSC/Vercel TZ=UTC (klaim "WIB terkunci" kini benar di client & server); (2) komentar `formatTanggal` misleading dikoreksi; (3) plugin Tailwind `.neo-press`/`-md`(2.5px)/`-sm`(2px) default 3.5px — konsolidasi blob press-down duplikat 13 site di 9 file (offset eksak dipertahankan; deviasi: MemberCard duration 120→100ms konsisten site lain); (4) `alreadyPaid(existingPaymentId)` param wajib (hapus conditional spread YAGNI); (5) hapus header no-op `X-DNS-Prefetch-Control: "on"` — kini 5 security headers.
- **No-action (tervalidasi recon):** varian `formatTanggal`/rupiah PassbookCard & pdf.ts = keputusan "sengaja tidak digabung" (output beda — temuan reviewer INVALID); query inline status page = by design RSC (hindari self-RTT); impedance service/DTO flat-vs-nested = trade-off diterima; format.ts 56 baris = YAGNI split.
- **Verifikasi penuh:** tsc clean, vitest 161/161, build OK, E2E 10/10, curl.exe -I live 5 header.

### Mobile Performance QA (2026-09-03) — PLAN DISETUJUI
Review 3 lane paralel (explorer recon + oracle arsitektur/logic + designer mobile UX). Konsensus: **0 KRITIS**. Arsitektur mayoritas sudah benar untuk skala 30 user. EKSEKUSI FASE 1–3 MENUNGGU KEPUTUSAN USER — jangan jalankan otomatis.

**SUDAH dieksekusi (satu-satunya, keputusan user 2026-09-03):**
- **JetBrains Mono DIHAPUS dari project** (~25KB woff2, hanya dipakai 1x badge "Bcrypt Hash"): import + variable dihapus dari `src/app/layout.tsx`, badge `LoginForm.tsx:187` kini `tabular-nums` (bukan `font-mono`), `tailwind.config.ts` fontFamily.mono → generic `ui-monospace/SFMono/Menlo/monospace`. Perlu verify tsc + build + visual badge login.

**Audit lanjutan (2026-09-03, diminta user — laporan, bukan eksekusi):**
- **Font weight audit (PERF):** grep 150 pemakaian class weight di src/ — `font-extrabold` 90x, `font-bold` 49x, `font-black` 8x (6 kode + 2 komentar, **clamp senyap ke 800**, tidak pernah render 900), `font-medium` 2x (`laporan/page.tsx:138,161`), `font-semibold` 1x (`login/page.tsx:23`), `font-normal` 0 eksplisit (tapi 400 = default body, wajib ada). Kesimpulan: weight yang benar-benar dirender hanya **400/700/800** → subset 3 weight terkonfirmasi data (memperkuat FASE 1.3 di bawah). Disertai 3 perubahan class (medium/semibold → bold).
- **Cookie session audit (SECURITY — VERIFIED CLEAN, tidak ada perubahan):** `sessionCookieOptions()` (`auth.ts:85-95`) = `httpOnly: true` (unconditional), `secure: NODE_ENV === "production"` (benar — Vercel selalu production; dev localhost HTTP tetap jalan), `sameSite: "strict"` (sesuai AGENTS.md). Satu sumber opsi dipakai login route (`auth.ts:103`) + middleware refresh (`middleware.ts:45`) — tidak mungkin drift atribut. **Future-proofing note:** kalau nanti ditambah OAuth callback, strict akan blokir cookie pada navigasi cross-site masuk → ganti `"lax"` (1 baris, terpusat). V1 tanpa OAuth — bukan bug. Minor opsional: `clearSessionCookie()` pakai `cookies().delete()` (fungsional benar; alternatif eksplisit `set(name, "", {...opts, maxAge: 0})` — prioritas rendah).
- **loading.tsx audit (PERF — confirmed 0 file):** tidak ada loading.tsx/streaming route-level di seluruh app. **Namun standalone = YAGNI saat ini**: semua halaman data full-client + prerender → skeleton internal sudah di HTML awal (first paint instan), dan BottomNav pakai Link prefetch → loading.tsx nyaris tak pernah terlihat. Loading.tsx hanya bernilai PASCA FASE 3 (server component fetch → loading.tsx = streaming skeleton server-work). **Keputusan: pindahkan loading.tsx ke dalam scope FASE 3** (bukan quick win terpisah), dengan guard: hapus skeleton internal page yang dimigrasi agar tidak double-skeleton.
- **error.tsx audit (RESILIENCE/UX — confirmed 0 file):** tidak ada `error.tsx`, `global-error.tsx`, maupun `not-found.tsx` di seluruh src/. Nuance: klaim "error tampil blank" hanya benar sebagian — (1) error FETCH sudah tertangani manual per halaman (try/catch + toast.error + rowError state, terverifikasi audit optimistic update), (2) yang tidak tertangani = error RENDER murni (komponen throw) → fallback generik Next tanpa branding/BottomNav/tombol retry, membingungkan user pemula; risiko naik PASCA FASE 3 (server component throw butuh error boundary). **Verifikasi optimistic Speed-Tap (2026-09-03, diminta user): ADA & clean** — `pembayaran/page.tsx:307-330`: flip LUNAS sebelum fetch + badge BARU + vibrate 45ms; guard double-tap `pendingIds` (line 309); semua jalur response tertangani (201 → undo toast, 409 → settleConflict bukan rollback, error/network → rollback `tandaiBelum`). Rapel drawer & PATCH/DELETE sengaja tidak optimistic (benar — konteks form, bukan speed-tap).
- **Plan tambahan hasil audit (kandidat FASE 2 baru):** tambah `src/app/error.tsx` root-level SATU file (~30 baris, resep Neo-Brutalism: kartu border hitam + shadow-neo + tombol "Muat Ulang" via `reset()`) — cukup root-level, tidak perlu per route group. `not-found.tsx` nice-to-have kecil. `global-error.tsx` opsional (sangat jarang). Ini resilience/UX (bukan perf murni) tapi prasyarat mulus FASE 3.

### Architecture Deepening (2026-09-03) — kandidat #3 & #4 DIEKSEKUSI
Review arsitektur 4 kandidat (laporan HTML temp dir; vocabulary: module/interface/depth/seam/leverage/locality). Top recommendation: #3 → #4 → #1 alur berkelanjutan, #2 ditunda pasca FASE-3. **#3 & #4 selesai dieksekusi** (verifikasi: tsc clean, vitest **161/161** / 29 files — naik dari 138/27):

- **#3 Format & Date Module — `src/lib/format.ts`**: satu sumber `NAMA_BULAN`, `NAMA_BULAN_SINGKAT`, `todayISO()` (invariant WIB terkunci 1 tempat, bug historis oracle #2), `formatRupiah`, `formatRibuan`, `formatTanggal`, `formatTanggalSingkat`. Duplikat dihapus di 11 file konsumen (formatRupiah ×4, NAMA_BULAN ×8, todayISO ×2, formatRibuan ×3, dst). **Sengaja TIDAK digabung** (output beda, dikomentari): PassbookCard varian uppercase + "01 Sep 2026" + Intl currency; pdf.ts DD/MM/YYYY + Intl currency. Unit test `tests/unit/format.test.ts` (11 test) — termasuk guard WIB: test gagal otomatis jika todayISO regressed ke toISOString DAN dijalankan WIB 00:00-06:59.
- **#4 Zod Validation Module — `src/lib/validation.ts`**: `dateOnly(fieldName)` (roundtrip guard gotcha #12 — factory karena pesan 400 literal kontrak per-nama-field), `minimalSatuField(schema)` (body {} → 400), `parseBulanTahunQuery(searchParams)` (berpasangan atau INVALID). Duplikat dihapus di 6 route handler: date-only refine ×4, minimal-satu-field ×3, query bulan/tahun ×3. Unit test `tests/unit/validation.test.ts` (12 test): "2026-02-30" ditolak, datetime ditolak, query satuan → INVALID.
- **Insight proses:** roundtrip test `new Date("...T00:00:00").toISOString()` SALAH di WIB (parse lokal → mundur sehari via toISOString) — roundtrip gotcha #12 hanya valid untuk date-only (parse UTC). Dua kali tertangkap oleh test suite sendiri.
- **Sisa kandidat arsitektur:** #2 useApiData hook (menunggu evaluasi ulang ROI — konsumen tinggal pembayaran/anggota/pengeluaran/laporan yang client-side).

### Architecture Deepening #1 — API Handler Kit (2026-09-03) — DIEKSEKUSI
Blueprint oracle + eksekusi fixer. Verifikasi: tsc clean, vitest **161/161** (29 files), build OK. Kontrak HTTP byte-identik (integration test hijau tanpa perubahan test).
- **Modul baru:** `src/lib/api/respond.ts` (`unauthorized`/`sessionMemberGone`/`invalidInput(zodResult)`/`badRequest(message)` — literal message dipin compile-time), `src/lib/api/session.ts` (`getSessionOr401(): Promise<VerifiedSession | NextResponse>`, narrowing call site via `instanceof NextResponse`), `src/lib/dto/{payment,expense,member,category}.ts` (DTO mapper + snapshot + domain error builder per domain — locality: kontrak penuh per domain).
- **Migrasi:** 11 dari 13 route (auth/login + auth/logout tidak dimigrasi; middleware tidak disentuh) + `status/page.tsx` RSC (serialisasi inline + komentar ponytail dihapus → `toPaymentDTO`). ±450 baris boilerplate lokal dihapus (helper unauthorized ×11, prolog cookie ×15, DTO/snapshot dup, dst).
- **Desain mengikat:** P2002/P2003 catch TETAP di route (recovery beda per-route — payments re-query `existingPaymentId`); RBAC 403 tetap middleware; members GET tetap tanpa prolog; login 401 beda semantik tak dipaksa ke helper; `toMemberDTO` 5-field dasar, GET members spread `statusBayarBulanIni`; `alreadyPaid` spread pakai `!== undefined` (call site race kirim `?? ""` — truthiness akan hapus field).
- **Deviasi kecil fixer (disetujui):** +helper `badRequest(message)` untuk 400 literal non-Zod (query periode); `invalidInput` tipe struktural `ZodFailedResult` tanpa import zod; branch string di `toPaymentDTO`/`toExpenseDTO` dihapus (tipe Prisma sudah Date-only).

### Kandidat #2 useApiData hook — NO-GO (2026-09-03, oracle ROI eval — MENGUNCI, jangan re-evaluasi ringan)
Verdict: **tidak dieksekusi, YAGNI**. 5 alasan kuantitatif:
1. Hanya 2 dari 4 halaman fit pola fetch-list generik ≥80% — pembayaran EXCLUDED (2-endpoint paralel + 2 Map + optimistic Speed-Tap + 409 cross-month fetch = hook butuh config-object), laporan EXCLUDED (blob-download, bukan list-fetch). Instance fit: anggota (1) + pengeluaran (2) = 3 instance di 2 halaman.
2. Net baris NEGATIF: eliminasi ~40 baris riil vs biaya ~75-90 baris (hook+tipe+test+3 page edit).
3. Variasi antar-instance bukan duplikasi murni: anggota butuh refetch imperatif pasca-reaktivasi; pengeluaran 2 resource independen 2 set loading/error. Hook = escape hatch, bukan eliminasi.
4. Tren arsitektur melawan: dashboard+status kini RSC; arah proyek server-fetch untuk read-heavy — hook client makin tidak relevan.
5. SWR/React Query sudah DITOLAK (YAGNI §112) — hook custom = SWR-lite, alasan tolak sama berlaku.
**Re-evaluasi hanya jika:** (a) ≥1 halaman stateful baru gagal konversi RSC + butuh fetch-list client berulang, ATAU (b) duplikasi naik ≥3 halaman unik. Duplikasi fetch boilerplate di 4 halaman = trade-off sadar diterima.

**Plan FASE 1 — Quick Wins (~1 jam, zero risk):**
- S2: expose `jumlahAnggotaAktif` + `jumlahLunas` di `DashboardSummaryResponse` (`types.ts` + `api/dashboard/summary/route.ts` — data sudah di-query, 0 query baru); hapus fetch `/api/members` di `dashboard/page.tsx:50-66`. −1 RTT tiap buka dashboard.
- M1: `pengeluaran/page.tsx:117-120` fetch kategori+pengeluaran serial → `Promise.all`. −1 RTT.
- Font subset Bricolage `["400","700","800"]` (weight 500 hanya 2x meta text, 600 hanya 1x — snap ke 700 tanpa rusak hierarki; sesuaikan class terkait). −25-30KB.
- Skeleton match tinggi konten riil: `dashboard/page.tsx:97-103` (hero ~230px), `status/page.tsx:110-111` (kupon ~200px, matriks ~180px). Pola acuan: /pembayaran sudah persis (`h-[72px]` = MemberCard). CLS turun.
- Security headers `next.config.js`: 5 header (X-Frame-Options DENY, nosniff, HSTS, Referrer-Policy, Permissions-Policy; X-DNS-Prefetch-Control dihapus 2026-09-03 — no-op di HTTP/2) + `poweredByHeader: false` + `reactStrictMode: true`. Plan sudah dibahas user (security naik, perf netral). CSP sengaja TIDAK disertakan (butuh nonce, kompleksitas tak sebanding).

**Plan FASE 2 — Mechanical Polish (~1 jam):**
- Scope `transition-all` → `transition-[transform,box-shadow,background-color,color]`: `NeoButton.tsx:74`, `MemberCard.tsx:128`, `BottomNav.tsx:65`, `pembayaran/page.tsx:141,469,480`, `ExpenseForm.tsx:190`. Visual identik, repaint turun (box-shadow repaint per frame saat press-down).
- Sticky hover touch: `NeoButton.tsx:76`, `MemberCard.tsx:132` → bungkus `[@media(hover:hover)]:hover:...`.
- M2: `React.memo(MemberCard)` + `useCallback` handleTap/handleLongPress (`pembayaran/page.tsx` inline arrow per render → 30 kartu re-render per tap).
- Toast `pengeluaran/page.tsx:133,142`: `toast.dismiss()` sebelum toast baru (persisten by design, tapi jangan menumpuk).
- Cleanup: hapus `.tabular` mati (`globals.css:11-13`), `font-black`→`font-extrabold` 6 lokasi (`BottomNav.tsx:67`, `anggota/page.tsx:270,444,449,461`, `MemberCard.tsx:143` — Bricolage max 800, clamp senyap).
- PIN box `h-10`→`h-11` (`LoginForm.tsx:212`) — touch target ≥44px (3-DESIGN §7).

**Plan FASE 3 — Server Component Refactor (menengah, 1-2 jam):**
- HANYA `dashboard/page.tsx` + `status/page.tsx` → server component (fetch di server, baca session cookie via `verifySession`), area interaktif jadi client island (LogoutButton, dll), skeleton internal → `loading.tsx` route-level (hati-hati double-skeleton). Gain: data ter-stream di HTML pertama (TTFB), terasa signifikan di 3G.
- **JANGAN konversi** `pembayaran`/`anggota`/`pengeluaran` — stateful berat (optimistic UI, drawer, search), ROI buruk.

**YAGNI — DITOLAK BERSAMA (konsensus 3 lane, jangan dilakukan):** pagination endpoint (30 anggota, ≤360 payment), caching layer/SWR/revalidate, dynamic import jsPDF/xlsx (sudah server-only, verified tidak bocor ke client bundle), virtualisasi list 30 item, optimasi middleware TTFB (jose HS256 ~1ms, sudah tepat), tree-shake manual lucide-react.

**Verifikasi per fase:** F1+F2 = tsc clean + vitest 138/138 + build + `curl.exe -I` cek header; F3 = + e2e 10/10 + smoke mobile viewport; F2.1-2.2 = review visual singkat (identitas Neo-Brutalism tidak berubah).

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
- **2026-09-03:** Git init + push GitHub (RohmanCis/KasSurs, commit `db3e822`, 131 file). Mobile performance QA 3-lane (explorer+oracle+designer): 0 kritis, plan FASE 1-3 disusun & dicatat di bagian Keputusan — eksekusi ditunda menunggu user. JetBrains Mono dihapus dari project. Architecture review 4 kandidat deepening (laporan HTML temp dir) → **kandidat #3 (format.ts) + #4 (validation.ts) dieksekusi hari sama**: 17 file refactor, +2 modul lib, +23 unit test (2 file baru), vitest 138→**161/161**, tsc clean, kontrak literal utuh (integration test hijau). Detail di bagian Keputusan "Architecture Deepening". **API Handler Kit #1 dieksekusi hari sama** (blueprint oracle + fixer; 11/13 route migrasi, ±450 baris boilerplate dihapus, kontrak byte-identik; tsc clean, vitest 161/161, build OK). **Audit dokumen 3-lane** (AGENTS/HANDOFF/PRD/TECH-SPEC/DESIGN/TASKS/QA-MANUAL/REPORT-CLIENT vs kode): 0 pelanggaran spec oleh kode, 0 dead-ref berbahaya; semua temuan stale-doc difix batch (28 edit + LOW 5 edit). **Kandidat #2 useApiData NO-GO** (ROI eval oracle — lihat bagian Keputusan). **Code review menyeluruh 2-axis** (Standards+Spec, diff `db3e822`→HEAD+working-tree, 2 oracle paralel): 0 hard violation/0 kritis; fix batch dieksekusi — commit `be3d299` (deepening #3/#4 + Kit #1 + todayISO WIB-safe) & `9568a66` (neo-press utility 13 site, alreadyPaid param wajib, hapus header no-op); verifikasi penuh tsc/vitest 161/build/E2E 10/curl. 3 issue laten lama DITUTUP keputusan user (lihat §3). **UI polish & perf batch** (user-initiated, 6 file: optimizePackageImports lucide-react, FilterBar chevron overlay, kategori pengeluaran grid 2-col + color dot — amendemen FR-09, BottomNav py-2 tanpa safe-area, kartu Belum Bayar font-mono, dynamic import drawer pembayaran; tsc clean; detail di bagian "UI Polish & Perf Batch").

---

## 3. Blocker / Issue terbuka

- **T-38–T-39:** Vercel env vars (DATABASE_URL pooler 6543, DIRECT_URL pooler session-mode 5432 — pola gotcha #2, JWT_SECRET, SEED_ADMIN_*) → `prisma migrate deploy` + `prisma db seed` production.
- Sisa data E2E di test DB (anggota "E2E...", payment, snapshot) — by design, terisolasi, vitest tetap hijau dengannya.
- Issue laten (race upsert `reportSnapshots`, P2003 inspection, `verifySession` tanpa cek `statusAktif`) — DITUTUP keputusan user 2026-09-03: tidak di-test/diperbaiki, diterima sebagai trade-off V1.

## 4. Next session — sisa pekerjaan (urutan)

Sisa satu item (FASE 1, 2, error.tsx, FASE 3, deepening #3/#4, API Handler Kit #1, code review 2-axis + fix batch SELESAI; kandidat #2 NO-GO — detail di bagian Keputusan):
1. **T-38–T-39 Deployment** (Vercel env vars + `prisma migrate deploy` + `prisma db seed`). Catatan T-38: `TZ=Asia/Jakarta` di Vercel opsional — `todayISO()` sudah WIB-safe (deepening #3); TZ hanya menjaga default `Date` lokal server bila ada kode baru yang lupa pakai `format.ts`.

---

## Kredensial dev

- Admin: `081213024017` / PIN `000000`
- `npm run dev -- -p 3100` → login `/login`
