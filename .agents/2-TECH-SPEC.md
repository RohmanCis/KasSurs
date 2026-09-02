# Tech Spec: KasSurs

**Versi:** 1.3 (update post-implementasi Modul 0–3, 2026-09-01)
**Status:** Implemented T-01–T-37 + Modul R (UI V2.2) — sisa T-38–T-39 (Deployment); detail state & gotchas lihat `.agents/HANDOFF.md`
**Lokasi File:** `.agents/2-TECH-SPEC.md`
**Dependensi:** `.agents/1-PRD.md` (wajib dibaca sebelum implementasi)

---

## 📄 BAGIAN 1: Tech Stack & Arsitektur

### Tech Stack
| Layer | Technology | Version |
|-------|------------|---------|
| Frontend | Next.js (App Router) | ^14.2.33 |
| Language | TypeScript | ^5.7.3 |
| Styling | Tailwind CSS | ^3.4.17 |
| State | React Context + Server Components (tanpa state manager eksternal — skala kecil tidak butuh) | - |
| Backend | Next.js API Routes / Route Handlers | 14.x (built-in) |
| Database | PostgreSQL (via Supabase) | 15.x |
| ORM | Prisma | 5.x |
| Auth | Custom (No HP + PIN, bcrypt hash, JWT session cookie) | - |
| Hosting | Vercel (frontend + API) | - |
| DB Hosting | Supabase | Free tier |
| Caching | Tidak digunakan — skala ≤30 user tidak membutuhkan | - |
| Export PDF | jsPDF + jspdf-autotable | latest |
| Export Excel | SheetJS (xlsx) | latest |
| Unit/Integration Test | Vitest | latest |
| E2E/Smoke Test | Playwright (ringan, hanya alur kritikal) | latest |

### Arsitektur Sistem
```
[HP Anggota/Admin — Browser Mobile]
            ↓ HTTPS
   [Next.js Frontend (Vercel)]
            ↓
   [Next.js API Routes (Vercel)] ← JWT session cookie (httpOnly)
            ↓ Prisma ORM
   [Supabase PostgreSQL]
```
Tidak ada file storage terpisah (tidak ada upload file di V1). Tidak ada cache layer terpisah — query langsung ke Postgres, cukup untuk beban 30 user.

### Struktur Folder
Mengikuti konvensi resmi Next.js 14+ App Router:

```
kassurs/
├── .agents/
│   ├── 1-PRD.md
│   ├── 2-TECH-SPEC.md
│   ├── 3-DESIGN.md
│   ├── 3-TASKS.md
│   └── HANDOFF.md
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts                # idempotent — skip admin jika role=ADMIN sudah ada
│   └── migrations/
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   └── login/page.tsx
│   │   ├── (admin)/
│   │   │   ├── dashboard/
│   │   │   │   ├── loading.tsx        # skeleton route-level (FASE 3)
│   │   │   │   └── page.tsx           # RSC (FASE 3)
│   │   │   ├── anggota/page.tsx
│   │   │   ├── pembayaran/page.tsx
│   │   │   ├── pengeluaran/page.tsx
│   │   │   └── laporan/page.tsx
│   │   ├── (member)/
│   │   │   └── status/
│   │   │       ├── loading.tsx        # skeleton route-level (FASE 3)
│   │   │       └── page.tsx           # RSC (FASE 3)
│   │   ├── api/
│   │   │   ├── auth/
│   │   │   │   ├── login/route.ts
│   │   │   │   └── logout/route.ts
│   │   │   ├── members/route.ts
│   │   │   ├── members/[id]/route.ts
│   │   │   ├── members/[id]/deactivate/route.ts
│   │   │   ├── payments/route.ts
│   │   │   ├── payments/[id]/route.ts
│   │   │   ├── expenses/route.ts
│   │   │   ├── expenses/[id]/route.ts
│   │   │   ├── categories/route.ts
│   │   │   ├── dashboard/summary/route.ts
│   │   │   └── reports/
│   │   │       ├── pdf/route.ts
│   │   │       └── excel/route.ts
│   │   ├── error.tsx                  # root error boundary (Neo-Brutalism, reset)
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   ├── not-found.tsx
│   │   └── page.tsx                   # root redirect by-role
│   ├── components/
│   │   ├── ui/                        # NeoButton, LogoutButton, FilterBar
│   │   ├── dashboard/                 # TreasuryHero, MemberCard
│   │   ├── forms/                     # LoginForm, MemberForm, ExpenseForm
│   │   ├── layout/                    # BottomNav
│   │   ├── member/                    # PassbookCard
│   │   └── payments/                  # PaymentRapelDrawer, PaymentEditDrawer
│   ├── lib/
│   │   ├── api/                       # API Handler Kit #1: respond.ts, session.ts (getSessionOr401)
│   │   ├── dto/                       # payment.ts, expense.ts, member.ts, category.ts (DTO + snapshot + error builder)
│   │   ├── export/
│   │   │   ├── pdf.ts
│   │   │   └── excel.ts
│   │   ├── prisma.ts                  # Prisma client singleton
│   │   ├── auth.ts                    # JWT sign/verify, session helper
│   │   ├── rate-limit.ts              # rate limiting login
│   │   ├── audit.ts                   # helper pencatatan audit log
│   │   ├── dashboard.ts               # getDashboardSummary — dipakai RSC + route summary
│   │   ├── report-snapshot.ts         # FR-23 snapshot beku (+ pg_advisory_xact_lock race guard)
│   │   ├── format.ts                  # NAMA_BULAN/formatRupiah/todayISO WIB-safe (deepening #3)
│   │   ├── validation.ts              # dateOnly/minimalSatuField/parseBulanTahunQuery (deepening #4)
│   │   ├── types.ts                   # kontrak API tunggal (26 interface + 12 union type)
│   │   └── utils.ts                   # cn() — clsx + tailwind-merge
│   └── middleware.ts                  # proteksi route berdasarkan role (+ re-issue sliding session)
├── tests/
│   ├── setup-env.ts                   # wiring TEST_DATABASE_URL → test DB Docker 5433
│   ├── unit/                          # Vitest — 9 file: auth, audit, export, format, jwt-confusion, rate-limit, sliding-session, smoke, validation
│   ├── integration/                   # Vitest — 20 file: login, payments(+patch/race/p2003), expenses(+patch/p2003/edge), members(+patch/deactivate/reactivate), dashboard, reports(+race), summary(+race/empty-db), audit, lockout-e2e, race-categories
│   └── e2e/                           # Playwright — 4 spec: login, catat-pembayaran, speed-tap, export-laporan (+ helpers.ts)
├── .env                        # WAJIB ada — Prisma CLI 5 baca .env (bukan .env.local); sinkron dengan .env.local
├── .env.local                  # runtime Next.js — jangan di-commit
├── vitest.config.mts           # harus .mts — .ts gagal ESM-in-CJS di Vitest 4
├── playwright.config.ts
├── next.config.js
└── package.json
```

### Justifikasi
- **Next.js:** satu codebase untuk frontend+backend (monolith kecil), cocok untuk tim/skala kecil, deploy langsung ke Vercel tanpa konfigurasi server terpisah.
- **Prisma:** type-safe query, migration tooling bawaan, cocok dipasangkan dengan Postgres Supabase.
- **Supabase (Postgres):** free tier cukup untuk data ≤30 user, backup otomatis bawaan, tidak perlu maintain server DB sendiri.
- **Vercel:** deploy otomatis dari Git, free tier cukup untuk trafik skala organisasi kecil.
- **JWT cookie (bukan Supabase Auth bawaan):** Supabase Auth didesain untuk email/OAuth, sedangkan kita pakai No HP + PIN custom — lebih simpel implementasi JWT sendiri daripada memaksakan Supabase Auth untuk pola auth non-standar ini.

---

## 📄 BAGIAN 2: Database Design

### Ringkasan Database
| Item | Detail |
|------|--------|
| Database | PostgreSQL (Supabase) |
| ORM | Prisma |
| Pendekatan | Relational |
| Tools Migrasi | Prisma Migrate |

### Entity Overview

| Entity | Key Fields | Relasi |
|--------|-----------|--------|
| Member | id, nama, no_hp, pin_hash, role, status_aktif | → Payment (1:N), → AuditLog (1:N sebagai actor) |
| Payment | id, member_id, bulan, tahun, jumlah, tanggal_bayar | ← Member |
| Expense | id, category_id, deskripsi, jumlah, tanggal | ← Category |
| Category | id, nama | → Expense (1:N) |
| AuditLog | id, actor_id, aksi, entity_type, entity_id, data_lama, data_baru, timestamp | ← Member (actor) |
| LoginAttempt | id, member_id, waktu, berhasil | ← Member |

### Schema Detail (Prisma)

```prisma
// Catatan: field API camelCase, kolom DB snake_case via @map per-field + @@map per tabel (lihat aturan penamaan Bagian 3).

model Member {
  id           String    @id @default(cuid())
  nama         String
  noHp         String    @unique @map("no_hp")
  pinHash      String    @map("pin_hash")
  role         Role      @default(ANGGOTA)
  statusAktif  Boolean   @default(true) @map("status_aktif")
  createdAt    DateTime  @default(now()) @map("created_at")
  updatedAt    DateTime  @updatedAt @map("updated_at")

  payments     Payment[]
  auditLogs    AuditLog[]     @relation("ActorLogs")
  loginAttempts LoginAttempt[]
  reportSnapshots ReportSnapshot[] @relation("ReportSnapshots")

  @@map("members")
}

enum Role {
  ADMIN
  ANGGOTA
}

model Payment {
  id            String   @id @default(cuid())
  memberId      String   @map("member_id")
  member        Member   @relation(fields: [memberId], references: [id], onDelete: Restrict)
  bulan         Int      // 1-12
  tahun         Int
  jumlah        Int      @default(30000) // editable — boleh beda dari default (rapel, sumbangan lebih), validasi jumlah > 0 dilakukan di application layer (Zod), bukan DB constraint
  tanggalBayar  DateTime @map("tanggal_bayar")
  createdAt     DateTime @default(now()) @map("created_at")
  updatedAt     DateTime @updatedAt @map("updated_at")

  @@unique([memberId, bulan, tahun]) // cegah duplikat pembayaran per bulan
  @@index([bulan, tahun])
  @@map("payments")
}

model Category {
  id        String    @id @default(cuid())
  nama      String    @unique
  isDefault Boolean   @default(false) @map("is_default")
  createdAt DateTime  @default(now()) @map("created_at")

  expenses  Expense[]

  @@map("categories")
}

model Expense {
  id          String   @id @default(cuid())
  categoryId  String   @map("category_id")
  category    Category @relation(fields: [categoryId], references: [id], onDelete: Restrict)
  deskripsi   String
  jumlah      Int
  tanggal     DateTime
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  @@index([tanggal])
  @@map("expenses")
}

model AuditLog {
  id         String    @id @default(cuid())
  actorId    String    @map("actor_id")
  actor      Member    @relation("ActorLogs", fields: [actorId], references: [id], onDelete: Restrict)
  aksi       AuditAction
  entityType String    @map("entity_type") // "Payment" | "Expense" | "Member" | "Category"
  entityId   String    @map("entity_id")
  dataLama   Json?     @map("data_lama")
  dataBaru   Json?     @map("data_baru")
  timestamp  DateTime  @default(now())

  @@index([entityType, entityId])
  @@map("audit_logs")
}

enum AuditAction {
  CREATE
  UPDATE
  DELETE
}

model LoginAttempt {
  id        String   @id @default(cuid())
  memberId  String   @map("member_id")
  member    Member   @relation(fields: [memberId], references: [id], onDelete: Restrict)
  waktu     DateTime @default(now())
  berhasil  Boolean

  @@index([memberId, waktu])
  @@map("login_attempts")
}

// FR-23 — snapshot laporan beku: hasil kalkulasi laporan periode dibekukan saat export pertama
model ReportSnapshot {
  id          String   @id @default(cuid())
  bulan       Int
  tahun       Int
  payload     Json     // ReportSnapshotPayload penuh (ringkasan agregat + detail baris, nama member/kategori ikut beku)
  createdById String   @map("created_by_id")
  createdBy   Member   @relation("ReportSnapshots", fields: [createdById], references: [id], onDelete: Restrict)
  createdAt   DateTime @default(now()) @map("created_at")

  @@unique([bulan, tahun]) // 1 snapshot per periode — re-export periode sama wajib pakai snapshot ini
  @@map("report_snapshots")
}
```

### Index Strategy
- **members.noHp** — unique index, dipakai untuk lookup saat login (query paling sering)
- **payments.[memberId, bulan, tahun]** — unique composite index, mencegah duplikat sekaligus mempercepat query status bayar
- **payments.[bulan, tahun]** — index untuk filter laporan per periode
- **expenses.tanggal** — index untuk filter laporan per periode
- **audit_logs.[entityType, entityId]** — index untuk telusur histori perubahan per record
- **login_attempts.[memberId, waktu]** — index untuk hitung percobaan gagal dalam window waktu (rate limiting)
- **report_snapshots.[bulan, tahun]** — unique composite index, lookup snapshot per periode saat export (FR-23)

### Data Flow
Admin login → sistem catat `LoginAttempt` → jika berhasil, buat session JWT → Admin catat `Payment` untuk anggota tertentu per bulan → sistem otomatis buat `AuditLog` (aksi CREATE) → Dashboard hitung saldo dari agregasi `Payment.jumlah` (masuk) dikurangi `Expense.jumlah` (keluar) → Admin generate laporan (PDF/Excel) berdasarkan filter periode dari `Payment` + `Expense` → Anggota login → lihat `Payment` miliknya sendiri (filter by `memberId`) + ringkasan saldo umum (agregasi tanpa filter member).

---

## 📄 BAGIAN 3: Interface Design

Next.js App Router — kombinasi Server Actions (untuk mutasi dari Server Components) dan Route Handlers (untuk kebutuhan yang perlu dipanggil dari client, seperti export). Berikut daftar API Route Handlers utama:

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/api/auth/login` | Login dengan No HP + PIN | No |
| POST | `/api/auth/logout` | Hapus session cookie | Yes |
| GET | `/api/members?bulan=&tahun=` | Fetch **seluruh** anggota (aktif + nonaktif — UI manajemen butuh lihat anggota nonaktif; bedakan via field `statusAktif` di `MemberDTO`) sekaligus (tanpa parameter search — filter nama dilakukan **client-side**, bukan query berulang ke server); jika `bulan`/`tahun` diisi, sertakan status bayar per anggota agar frontend bisa sorting "Belum Bayar" duluan tanpa request tambahan | Admin |
| POST | `/api/members` | Tambah anggota baru | Admin |
| PATCH | `/api/members/[id]` | Update data anggota (termasuk reset PIN/No HP) | Admin |
| PATCH | `/api/members/[id]/deactivate` | Nonaktifkan anggota. Return `403 Forbidden` jika target adalah role ADMIN dan merupakan satu-satunya ADMIN aktif tersisa | Admin |
| GET | `/api/payments` | List pembayaran (filter: bulan, tahun, memberId) | Admin (semua) / Anggota (hanya diri sendiri) |
| POST | `/api/payments` | Catat pembayaran baru. Return `409 Conflict` dengan pesan "Sudah lunas bulan ini" jika constraint unique `[memberId, bulan, tahun]` terlanggar — tidak auto-redirect ke edit | Admin |
| PATCH | `/api/payments/[id]` | Edit data pembayaran | Admin |
| DELETE | `/api/payments/[id]` | Hapus data pembayaran | Admin |
| GET | `/api/expenses` | List pengeluaran (filter: kategori, periode) | Admin |
| POST | `/api/expenses` | Catat pengeluaran baru | Admin |
| PATCH | `/api/expenses/[id]` | Edit data pengeluaran | Admin |
| DELETE | `/api/expenses/[id]` | Hapus data pengeluaran | Admin |
| GET | `/api/categories` | List kategori pengeluaran — jumlah item kecil (±5-10), ditampilkan sebagai **horizontal chip pills** (scroll horizontal, chip aktif inverted) di form pengeluaran (amendemen V1.1 2026-09-02, PRD FR-09 — menggantikan rencana dropdown native `<select>`; bukan search-select seperti anggota, karena skala item terlalu kecil untuk butuh search) | Admin |
| POST | `/api/categories` | Tambah kategori baru | Admin |
| GET | `/api/dashboard/summary` | Saldo real-time + ringkasan bulan berjalan | Admin (detail) / Anggota (ringkasan umum saja) |
| GET | `/api/reports/pdf?bulan=&tahun=` | Unduh laporan PDF periode. **Snapshot (FR-23):** export pertama periode → hitung live + bekukan ke `ReportSnapshot`; export berikutnya periode sama → render dari snapshot (angka beku). `?regenerate=true` → hitung ulang + timpa snapshot (koreksi eksplisit admin) | Admin |
| GET | `/api/reports/excel?bulan=&tahun=` | Unduh laporan Excel periode — bersumber dari snapshot periode yang sama dengan PDF (satu snapshot, dua format; angka identik) | Admin |

*Detail request/response body ditentukan saat implementasi masing-masing endpoint.*

### API Contract Types (TypeScript)

Definisi tipe ini adalah **kontrak wajib** — dipakai bersama oleh frontend & backend (`src/lib/types.ts`), agar penamaan field konsisten di seluruh endpoint tanpa perlu ditebak ulang per task implementasi.

```typescript
// ===== Auth =====
interface LoginRequest {
  noHp: string;
  pin: string;
}
interface LoginResponse {
  role: "ADMIN" | "ANGGOTA";
  memberId: string;
  nama: string;
}
interface LoginErrorResponse {
  error: "INVALID_CREDENTIALS" | "ACCOUNT_LOCKED" | "INVALID_INPUT"; // INVALID_INPUT = body gagal validasi Zod
  message: string;
  lockedUntil?: string; // ISO datetime, hanya jika error = ACCOUNT_LOCKED
}

// ===== Member =====
interface MemberDTO {
  id: string;
  nama: string;
  noHp: string;
  statusAktif: boolean;
  role: "ADMIN" | "ANGGOTA";
  // hanya terisi jika query ?bulan=&tahun= disertakan:
  statusBayarBulanIni?: "LUNAS" | "BELUM_BAYAR";
}
interface CreateMemberRequest {
  nama: string;
  noHp: string;
  pin: string; // 4-6 digit, akan di-hash di server
}
interface UpdateMemberRequest {
  nama?: string;
  noHp?: string;
  pin?: string; // jika diisi, reset PIN
}

// ===== Payment =====
interface PaymentDTO {
  id: string;
  memberId: string;
  memberNama: string; // denormalized untuk kemudahan render list
  bulan: number; // 1-12
  tahun: number;
  jumlah: number;
  tanggalBayar: string; // ISO date
  createdAt: string;
}
interface CreatePaymentRequest {
  memberId: string;
  bulan: number;
  tahun: number;
  jumlah: number; // default 30000 di frontend, tapi wajib dikirim eksplisit
  tanggalBayar: string; // ISO date
}
interface PaymentConflictResponse {
  error: "ALREADY_PAID";
  message: "Sudah lunas bulan ini";
  existingPaymentId: string;
}

// ===== Expense =====
interface ExpenseDTO {
  id: string;
  categoryId: string;
  categoryNama: string; // denormalized
  deskripsi: string;
  jumlah: number;
  tanggal: string; // ISO date
  createdAt: string;
}
interface CreateExpenseRequest {
  categoryId: string;
  deskripsi: string;
  jumlah: number;
  tanggal: string; // ISO date
}

// ===== Category =====
interface CategoryDTO {
  id: string;
  nama: string;
  isDefault: boolean;
}

// ===== Dashboard =====
interface DashboardSummaryResponse {
  saldo: number;
  totalMasukBulanIni: number;
  totalKeluarBulanIni: number;
  // hanya terisi untuk role ADMIN:
  jumlahBelumBayar?: number;
  // FASE 1 (2026-09-03, additive — dashboard tidak lagi fetch /api/members):
  jumlahAnggotaAktif: number;  // member statusAktif=true
  jumlahLunas: number;          // jumlah anggota AKTIF yang lunas bulan berjalan
}

// ===== Report Snapshot (FR-23 — payload beku saat export pertama periode) =====
interface ReportSnapshotPayload {
  periode: { bulan: number; tahun: number };
  ringkasan: {
    totalMasuk: number;        // accrual: Payment WHERE bulan/tahun = periode (semantik T-27)
    totalKeluar: number;       // cash-flow: Expense WHERE tanggal dalam rentang periode (semantik T-27)
    saldoAkhirPeriode: number; // saldo historis cash-flow s.d. akhir periode (bukan saldo hari ini)
    jumlahLunas: number;
    jumlahBelumBayar: number;  // dibekukan saat export — admin view saat itu
  };
  detailMasuk: Array<{
    memberNama: string;  // denormalized & dibekukan — rename/deactivate member tidak mengubah laporan lama
    bulan: number;
    tahun: number;
    jumlah: number;
    tanggalBayar: string; // ISO date — rapel (bayar mundur) tetap terlihat kapan uangnya diterima
  }>;
  detailKeluar: Array<{
    categoryNama: string; // denormalized & dibekukan
    deskripsi: string;
    jumlah: number;
    tanggal: string; // ISO date
  }>;
  dibuatPada: string; // ISO datetime — kapan snapshot dibekukan
}

// ===== Audit Log (internal, tidak diekspos via API publik di V1) =====
interface AuditLogEntry {
  id: string;
  actorId: string;
  actorNama: string;
  aksi: "CREATE" | "UPDATE" | "DELETE";
  entityType: "Payment" | "Expense" | "Member" | "Category";
  entityId: string;
  dataLama: Record<string, unknown> | null;
  dataBaru: Record<string, unknown> | null;
  timestamp: string;
}
```

**Aturan penamaan (untuk konsistensi antar-task implementasi):**
- Semua field pakai `camelCase` (bukan `snake_case`) di level API — konsisten dengan konvensi TypeScript/JavaScript, meski kolom database pakai `snake_case` via `@map` di Prisma.
- Tanggal selalu dikirim sebagai ISO 8601 string (`"2026-08-30"` atau `"2026-08-30T10:00:00Z"`), tidak pernah sebagai timestamp Unix atau format lain.
- Field yang di-*denormalize* untuk kemudahan render (misal `memberNama` di `PaymentDTO`) harus disebut eksplisit di komentar seperti di atas — supaya jelas ini bukan field asli dari tabel, agar tidak bingung saat lihat schema Prisma vs response API.

**Status implementasi kontrak:** `src/lib/types.ts` sudah terpasang (26 interface + 12 union type). Body request PATCH/DELETE untuk Payment/Expense serta error response per-domain (union error code + responsenya) juga sudah didefinisikan — semua di `types.ts` tunggal, jangan duplikat per endpoint.

---

## 📄 BAGIAN 4: Alur Logika & Business Rules

**Alur Login:**
1. User input No HP + PIN di form login.
2. Sistem cek apakah akun sedang lockout (5x gagal dalam 15 menit terakhir via tabel `LoginAttempt`).
3. Jika lockout aktif → tolak, tampilkan pesan coba lagi nanti.
4. Jika tidak lockout → verifikasi PIN dengan `bcrypt.compare()` terhadap `pinHash`.
5. Jika salah → catat `LoginAttempt(berhasil=false)`, tampilkan error.
6. Jika benar → catat `LoginAttempt(berhasil=true)`, generate JWT (payload: memberId, role), set sebagai httpOnly cookie dengan expiry 30 hari.
7. Redirect: role ADMIN → `/dashboard`, role ANGGOTA → `/status`.

**Alur Sliding Session (amendemen 2026-09-01 — mengubah perilaku T-08/T-12 dari fixed-expiry):**
1. Session adalah **sliding**: masa berlaku token di-reset ke 30 hari dari titik request terakhir yang lolos autentikasi — bukan dihitung sekali saat login.
2. Mekanisme: **middleware (`src/middleware.ts`) me-re-issue JWT baru** (payload sama: memberId, role; `exp` baru = now + 30 hari) dan set ulang cookie pada response — satu titik sentralisasi, TIDAK per-endpoint.
3. **Ambang refresh (bukan tiap request):** re-issue hanya jika sisa masa berlaku token < 15 hari (setengah TTL). Request dengan sisa ≥ 15 hari tidak menyentuh cookie — menghindari sign JWT + `Set-Cookie` di setiap response (churn cookie tanpa manfaat; HMAC sign murah tapi tetap pointless di request yang token-nya masih panjang).
4. Semua path yang lolos middleware (API maupun halaman non-API) memicu refresh — asalkan request membawa cookie valid dan sisa < 15 hari. `/api/auth/*`, `/login`, dan aset statis tidak (tidak ada token tervalidasi di sana).
5. Konsekuensi yang diterima: token anggota nonaktif (soft-deactivated) efektif tidak terbatas selama pemegangnya terus membuka app (verifySession tetap JWT-only tanpa cek `statusAktif` DB — tradeoff V1, keputusan user 2026-09-01).
6. Kunci token tetap satu (`JWT_SECRET`, HS256) — token lama & baru sama-sama valid sampai expiry-nya masing-masing (stateless, tanpa blacklist; sudah begitu juga sebelum amendemen).

**Alur Catat Pembayaran (V1.1 — Speed-Tap, amendemen 2026-09-02; menggantikan alur search-select V1.0):**
1. Halaman roster membuka dengan **2 fetch awal**: `GET /api/members?bulan=&tahun=` (seluruh anggota + status bayar bulan berjalan, sorting "Belum Bayar duluan" client-side) DAN `GET /api/payments?bulan=&tahun=` (semua payment bulan itu — sumber L2 badge "BARU" via `createdAt`, dan sumber prefill drawer edit/hapus: parent build `Map<paymentId, PaymentDTO>`).
2. **Mode (a) 1-Tap Speed-Tap (default):** tap kartu "Belum Bayar" → optimistic flip ke Lunas → POST `/api/payments` (Rp30.000, tanggal hari ini) di background. Sukses 201 → `vibrate(45)` + undo toast 5 detik dengan BATALKAN (paymentId dari response, closure scoped). **Gagal dibedakan:** `409 ALREADY_PAID` → kartu settle ke Lunas (truth server) + badge dari `createdAt` payment existing + deep-link drawer via `existingPaymentId` (TIDAK rollback); gagal lain → rollback kartu ke Belum + toast error.
3. **Mode (b) Drawer rapel/kustom:** long-press 450ms kartu "Belum Bayar" (scroll-safe >10px, `vibrate(20)`) → drawer form prefill (Rp30.000, bulan/tahun berjalan, tanggal hari ini) → POST sama. **Catatan cross-month 409:** jika drawer meng-POST bulan ≠ bulan roster dan kena 409, data existing payment tidak ada di fetch roster → client lakukan fetch tambahan `GET /api/payments?bulan=<body.bulan>&tahun=<body.tahun>` lalu cari by `existingPaymentId` untuk prefill drawer.
4. Client cek dulu (data di memory) apakah anggota sudah punya record bulan/tahun tersebut — UX shortcut tanpa round-trip.
5. Server **tetap** validasi ulang via constraint unique `[memberId, bulan, tahun]` — client check bukan pengganti validasi server (data bisa berubah antara fetch awal dan submit, mis. 2 tab admin).
6. Jika constraint terlanggar di server → `409 Conflict` + `existingPaymentId` — tidak ada auto-redirect; UI memakai `existingPaymentId` untuk deep-link drawer edit/hapus.
7. Jika lolos → simpan record `Payment`; sistem buat `AuditLog` (aksi=CREATE). **Undo (BATALKAN di toast) = `DELETE /api/payments/{id}` → `AuditLog` kedua (aksi=DELETE)** — dua entri audit per salah-tap cycle, by design (FR-21 tetap berlaku untuk undo).
8. Dashboard & status anggota ter-update otomatis (query real-time, bukan cache).
9. **Sonner toast config:** undo toast harus **stack** (bukan replace) — dua undo simultan (tap A lalu B dalam 5s) keduanya harus tetap bisa dibatalkan.

**Alur Edit/Hapus Data (Payment/Expense) — Audit Trail Wajib:**
1. Admin buka record yang ingin diubah.
2. Sistem ambil snapshot data lama sebelum update.
3. Admin submit perubahan → sistem update record.
4. Sistem buat `AuditLog` (aksi=UPDATE/DELETE, dataLama=snapshot sebelum, dataBaru=snapshot sesudah, actor=admin yang login, timestamp=now).
5. AuditLog bersifat append-only — tidak ada endpoint untuk edit/hapus AuditLog itu sendiri.

**Alur Dashboard Anggota (View-Only):**
1. Anggota login → sistem ambil `memberId` dari JWT session.
2. Query `Payment` di-filter `WHERE memberId = session.memberId` → tampilkan status Lunas/Belum per bulan.
3. Query ringkasan saldo umum: `SUM(Payment.jumlah) - SUM(Expense.jumlah)` tanpa filter member — semua anggota bisa lihat angka ini.
4. Middleware (`src/middleware.ts`) memastikan role ANGGOTA tidak bisa mengakses route/endpoint admin (`/api/members`, `/api/expenses`, dll.) sama sekali — return 403 jika dicoba.

**Alur Export Laporan (dengan Snapshot — FR-23):**
1. Admin pilih periode (bulan + tahun) di halaman Laporan (V1: bulan/tahun; rentang tanggal di luar scope V1).
2. Admin klik "Export PDF" atau "Export Excel" → request `GET /api/reports/pdf?bulan=&tahun=` (atau `/excel`).
3. Server cek `ReportSnapshot` untuk `[bulan, tahun]`:
   - **Sudah ada** → render file langsung dari `payload` snapshot (angka beku, tidak dihitung ulang — inilah yang menjamin laporan yang sudah dibagikan tidak berubah diam-diam meski ada rapel/koreksi kemudian).
   - **Belum ada** → hitung dari data live dengan semantik T-27 (totalMasuk accrual via `Payment.bulan/tahun`; totalKeluar cash-flow via rentang `Expense.tanggal`; saldoAkhirPeriode = saldo historis cash-flow s.d. akhir periode), simpan snapshot + `createdBy`, lalu render.
4. `?regenerate=true` → hitung ulang dari data live & timpa snapshot periode itu (upsert) — aksi eksplisit admin untuk koreksi salah input; satu-satunya cara nilai snapshot berubah.
5. Default periode jika tidak dipilih: bulan berjalan.
6. PDF & Excel untuk periode yang sama selalu bersumber dari satu snapshot → angka identik antar format.

### Business Rules (dari PRD)
- Kas bulanan Rp30.000/anggota, ditagih tiap tanggal 1.
- 1 anggota hanya boleh punya 1 record pembayaran lunas per bulan per tahun (constraint unique di DB).
- Anggota nonaktif tidak dihapus datanya — hanya diubah `statusAktif=false`, tetap muncul di data historis/audit.
- Maksimal 5x salah PIN berturut-turut → lockout 15 menit.
- PIN selalu di-hash (bcrypt) — tidak pernah ada endpoint yang mengembalikan PIN plaintext.
- Setiap create/update/delete pada `Payment` dan `Expense` **wajib** tercatat di `AuditLog` (append-only).
- Laporan per periode dibekukan pada export pertama (`ReportSnapshot`, unique `[bulan, tahun]`) — re-export periode sama mengembalikan snapshot yang sama, nilai tidak berubah diam-diam (FR-23). Hitung ulang hanya via `?regenerate=true` (ekspresit admin, upsert). Snapshot membekukan **hasil** kalkulasi semantik T-27, tidak mengubah cara hitungnya.
- Anggota: akses read-only, hanya bisa lihat data pembayaran miliknya sendiri + ringkasan saldo umum organisasi. Tidak ada akses create/update/delete sama sekali.
- Session login sliding: token berlaku 30 hari dari request terakhir yang lolos autentikasi (re-issue middleware, ambang refresh sisa < 15 hari — lihat Bagian 4 Alur Sliding Session; amendemen 2026-09-01).

---

## 📄 BAGIAN 5: Keamanan, Performa, & Deployment

### Keamanan
- PIN di-hash dengan **bcrypt** (salt rounds minimal 10) — tidak pernah disimpan/dikembalikan sebagai plaintext.
- JWT disimpan sebagai **httpOnly, secure, sameSite=strict cookie** — mencegah akses via JavaScript (XSS) dan CSRF.
- **Sliding session via middleware** (amendemen 2026-09-01): token di-re-issue dengan `exp` baru (now + 30 hari) saat request tervalidasi dengan sisa masa berlaku < 15 hari; cookie di-set pada response middleware (`NextResponse.cookies.set`) — `signSession` murni mengembalikan token, set cookie terpisah untuk route handler (login) vs middleware. Konsekuensi diterima: token anggota nonaktif tetap valid selama pemegangnya aktif membuka app.
- Rate limiting login: maksimal 5x gagal berturut-turut per `memberId` dalam 15 menit → lockout, dicek lewat tabel `LoginAttempt` (bukan in-memory, agar konsisten meski serverless function restart).
- **Role-based access control** di level middleware (`src/middleware.ts`) — cek role dari JWT payload sebelum request sampai ke handler; anggota yang mencoba akses endpoint admin langsung ditolak (403) sebelum query database dijalankan.
- Validasi input di setiap API route (misal dengan Zod) — cegah data tidak valid masuk ke database (No HP kosong, jumlah negatif, dll.).
- **Audit log append-only** — tidak ada endpoint DELETE/PATCH untuk tabel `audit_logs`, memastikan jejak perubahan data keuangan tidak bisa dimanipulasi.
- HTTPS wajib — otomatis disediakan oleh Vercel untuk semua deployment.
- Security headers di `next.config.js` (FASE 1, 2026-09-03; X-DNS-Prefetch-Control dihapus 2026-09-03 karena no-op di HTTP/2): `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, HSTS, `Referrer-Policy`, `Permissions-Policy` + `poweredByHeader: false` + `reactStrictMode: true`. **CSP sengaja tidak disertakan** (butuh nonce — kompleksitas tak sebanding untuk V1).
- Environment variable (`DATABASE_URL`, `JWT_SECRET`) disimpan di Vercel Environment Variables, tidak pernah di-commit ke repo.

### Performa
- Next.js App Router dengan Server Components untuk halaman yang tidak butuh interaktivitas tinggi (misal halaman status anggota) — mengurangi JS yang dikirim ke client, penting untuk pengguna mobile data.
- Prisma connection pooling via Supabase (gunakan Supabase connection pooler URL, bukan direct connection) — penting karena Vercel serverless function bisa spawn banyak koneksi singkat.
- Index database sudah didesain di Bagian 2 untuk query yang sering dipakai (login by noHp, filter payment by bulan/tahun, filter expense by tanggal).
- Tidak perlu caching layer terpisah — skala 30 user, query langsung ke Postgres sudah cukup cepat (<500ms).

### Deployment
- **Vercel**: auto-deploy dari branch `main` di GitHub, preview deployment otomatis untuk setiap PR.
- **Supabase**: database migration dijalankan manual via `npx prisma migrate deploy` saat deploy (atau via CI step), bukan auto-migrate on boot (hindari race condition di serverless).
- **Environment Variables** yang dibutuhkan: `DATABASE_URL` (Supabase pooler connection string, port 6543 transaction-mode), `DIRECT_URL` (untuk Prisma migrate), `JWT_SECRET`, `SEED_ADMIN_PHONE`, `SEED_ADMIN_PIN`.
- **Direct host Supabase IPv6-only** pada mesin dev — host `db.*.supabase.co` tidak resolve. Workaround terbukti: `DIRECT_URL` pakai **session-mode pooler port 5432** (user `postgres.<ref>`). Samakan pola ini di Vercel env vars saat deployment.
- **Dua file env di dev:** Prisma CLI 5 baca `.env`, Next.js runtime baca `.env.local` — keduanya wajib ada dan wajib sinkron (`.env` ter-cover .gitignore).
- Test DB terisolasi: Docker `kassurs-test-db` (`postgres:17-alpine`, port 5433, user postgres, pass kassurs_test) — wajib start sebelum test (`docker start kassurs-test-db`). Wiring: `tests/setup-env.ts` override `TEST_DATABASE_URL`; E2E ikut pakai DB ini via `DATABASE_URL` override di `webServer` `playwright.config.ts` (port 3100, `reuseExistingServer: false` — dev DB tidak tersentuh).
- Tidak perlu Sentry/monitoring eksternal di V1 — skala kecil, cukup andalkan Vercel built-in logs untuk debugging awal. Bisa ditambah nanti jika dibutuhkan.

### Strategi Testing

Testing di V1 dibatasi ke **alur kritikal saja** — tidak menargetkan 100% coverage, sesuai prinsip anti-over-engineering untuk skala 30 user. Prioritas: mencegah regresi pada business rule yang sensitif (uang & keamanan), bukan menguji setiap kemungkinan UI state.

**Unit Test (Vitest) — wajib untuk:**
- Logika validasi PIN/hash (bcrypt wrapper)
- Kalkulasi saldo (`SUM(Payment) - SUM(Expense)`)
- Business rule constraint (jumlah > 0, deteksi duplikat payment per bulan)
- Rate-limiting logic (hitung 5x gagal dalam window 15 menit)

**Integration Test (Vitest + test database terpisah) — wajib untuk:**
- `POST /api/payments` — termasuk skenario `409 Conflict` saat sudah lunas
- `POST /api/auth/login` — termasuk skenario lockout setelah 5x gagal
- Audit log — pastikan setiap create/update/delete pada Payment/Expense benar-benar menghasilkan entry di `AuditLog`
- RBAC middleware — pastikan role ANGGOTA ditolak (403) saat akses endpoint admin

**E2E/Smoke Test (Playwright) — dibatasi 3 alur paling kritikal, bukan seluruh UI:**
1. Login (admin & anggota) → sampai ke dashboard masing-masing
2. Catat pembayaran end-to-end (pilih anggota → submit → verifikasi status berubah jadi Lunas)
3. Export laporan (PDF & Excel) → verifikasi file ter-generate tanpa error

**Tidak masuk scope testing otomatis V1:** visual regression testing, cross-browser testing matrix, load testing — semua ini over-engineering untuk skala 30 user; verifikasi manual sudah cukup jika dibutuhkan.

**Command:**
```bash
npm run test          # Vitest — unit + integration
npm run test:e2e      # Playwright — smoke test (chromium ter-installed; webServer sendiri port 3100 + DATABASE_URL override ke test DB 5433 — dev DB tidak tersentuh)
```

**Gotcha testing (temuan implementasi M0+M1):**
- `vitest.config` harus berekstensi **`.mts`** — `.ts` gagal ESM-in-CJS di Vitest 4.
- tsconfig `target: es5` → tidak ada top-level await di test; pakai `beforeAll` + dynamic import (pattern ada di `tests/integration/login.test.ts`).
- Test lockout `LoginAttempt`: `deleteMany` riwayat member dulu sebelum scenario — insert historis langsung ke DB bisa salah urutan kronologis vs attempt sukses dari test lain.
- Utang test terjadwal T-35 (dari review M1): unit test alg-confusion JWT (`alg=none` + RS256-dengan-HS-secret → expect null), integration test 5x POST PIN salah nyata → POST ke-6 expect 429, unit test `lockedUntil` untuk >5 failure.



```bash
# Clone & install
git clone <repo-url> kassurs
cd kassurs
npm install

# Setup environment
cp .env.example .env.local
cp .env.local .env    # Prisma CLI 5 baca .env, bukan .env.local — dua-duanya wajib sinkron
# isi DATABASE_URL, DIRECT_URL, JWT_SECRET
# isi SEED_ADMIN_PHONE, SEED_ADMIN_PIN (untuk akun admin pertama — lihat FR-22)

# Setup database
npx prisma migrate dev
npx prisma db seed   # seed kategori default + 1 akun admin awal dari env var
                      # idempotent: skip pembuatan admin jika sudah ada role=ADMIN di DB

# Jalankan development server
npm run dev
```

**Catatan keamanan bootstrap:** `SEED_ADMIN_PHONE`/`SEED_ADMIN_PIN` hanya dipakai sekali saat seed pertama, tidak pernah dibaca ulang setelah akun admin ada di database. Admin disarankan mengganti PIN lewat fitur reset (FR-02) segera setelah login pertama kali — bukan pengecekan wajib di sistem (soft recommendation, bukan hard gate di V1).

**🎉 Tech Spec selesai!**

---

## 🔄 Status
Versi 1.6 — di-update sesuai keputusan user 2026-09-01 sebelum Modul 6: **FR-23 Snapshot Laporan (laporan beku)** — tabel `report_snapshots` (payload `ReportSnapshotPayload` penuh: ringkasan + detail baris), 1 snapshot per `[bulan, tahun]`, dibuat saat export pertama, re-export periode sama render dari snapshot, `?regenerate=true` untuk koreksi; PDF & Excel bersumber satu snapshot; periode V1 bulan/tahun (rentang tanggal keluar dari V1). Semantik T-27 tidak berubah (accrual masuk / cash-flow keluar / saldo historis) — snapshot membekukan hasilnya. Perlu migration baru (`npx prisma migrate dev`).

Versi 1.5 — di-update sesuai temuan implementasi Modul 5 (T-01–T-30 selesai: 92/92 test pass, build pass). Delta Modul 5: `GET /api/dashboard/summary` role-differentiated di handler (ANGGOTA sengaja lolos middleware — FR-14), `saldo`/`totalMasukBulanIni`/`totalKeluarBulanIni` agregat organisasi-wide identik lintas role, `jumlahBelumBayar` admin-only via field omission; semantik periode split — Payment accrual (kolom `bulan`/`tahun`) vs Expense cash-flow (rentang `tanggal`), `saldo` semua-histori otoritatif (oracle-approved, dipaksakan schema); BottomNav 4 tab menggantikan back-link manual; komponen reusable DataTable/FilterBar/StatusBadge (T-30) terpasang, konsumen pertama T-34. *(Catatan 2026-09-03: DataTable & StatusBadge kemudian DIHAPUS saat FASE-REDESIGN-3 cleanup — type `StatusBadgeStatus` dipindah ke FilterBar.tsx; BottomNav kini 5 tab.)* Progress terkini: `.agents/HANDOFF.md`.

**Langkah berikutnya:** T-38–T-39 Deployment (Vercel env vars + `prisma migrate deploy` + `prisma db seed`) — detail di `.agents/HANDOFF.md` §4.
