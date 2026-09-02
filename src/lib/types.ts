// =====================================================================
// KasSurs — API Contract Types (source of truth: .agents/2-TECH-SPEC.md Bagian 3)
// Kontrak wajib dipakai bersama frontend & backend. Jangan tambah/hapus
// field di luar spec tanpa menandai TODO(spec-gap).
//
// Aturan (dari AGENTS.md):
// - Semua field API camelCase (kolom DB snake_case via @map di Prisma).
// - Tanggal selalu ISO 8601 string ("2026-08-30" | "2026-08-30T10:00:00Z"),
//   bukan Date, bukan Unix timestamp.
// - Field denormalized wajib berkomentar eksplisit.
// =====================================================================

// ===== Enum / Union Type =====
// Union role dipakai oleh LoginResponse, MemberDTO, dan skema Prisma (role).
export type Role = "ADMIN" | "ANGGOTA";

// Status bayar anggota untuk query /api/members?bulan=&tahun=.
export type PaymentStatus = "LUNAS" | "BELUM_BAYAR";

// Error code yang mungkin dikembalikan endpoint auth.
// INVALID_INPUT: body request gagal validasi Zod (400) — di luar spec asli
// (N5), ditambahkan agar union mencakup semua error response endpoint auth.
export type LoginErrorCode = "INVALID_CREDENTIALS" | "ACCOUNT_LOCKED" | "INVALID_INPUT";

// Error code khusus conflict pembayaran (constraint unique [memberId, bulan, tahun]).
export type PaymentErrorCode = "ALREADY_PAID";

// Aksi pada AuditLog (append-only, tidak ada endpoint edit/hapus).
export type AuditAction = "CREATE" | "UPDATE" | "DELETE";

// Entitas yang dicatat di AuditLog.
export type AuditEntityType = "Payment" | "Expense" | "Member" | "Category";

// ===== Auth =====
export interface LoginRequest {
  noHp: string;
  pin: string;
}
export interface LoginResponse {
  role: Role;
  memberId: string;
  nama: string;
}
export interface LoginErrorResponse {
  error: LoginErrorCode;
  message: string;
  lockedUntil?: string; // ISO datetime, hanya jika error = ACCOUNT_LOCKED
}

// ===== Member =====
export interface MemberDTO {
  id: string;
  nama: string;
  noHp: string;
  statusAktif: boolean;
  role: Role;
  // hanya terisi jika query ?bulan=&tahun= disertakan:
  statusBayarBulanIni?: PaymentStatus;
}
export interface CreateMemberRequest {
  nama: string;
  noHp: string;
  pin: string; // 4-6 digit, akan di-hash di server
}
export interface UpdateMemberRequest {
  nama?: string;
  noHp?: string;
  pin?: string; // jika diisi, reset PIN
  statusAktif?: boolean; // QA #3 (2026-09-01): reaktivasi anggota nonaktif
}

// Error response endpoint /api/members (T-16, T-17) — pola sama LoginErrorResponse.
// INVALID_INPUT: body/query gagal validasi (400).
// PHONE_ALREADY_REGISTERED: noHp sudah dipakai member lain (409).
// MEMBER_NOT_FOUND: id target PATCH tidak ada (404) — dipakai T-17.
// UNAUTHORIZED: sesi invalid (401) — fallback defensif handler, disamakan
// dengan error code middleware (T-12).
export type MemberErrorCode =
  | "INVALID_INPUT"
  | "PHONE_ALREADY_REGISTERED"
  | "MEMBER_NOT_FOUND"
  | "UNAUTHORIZED";
export interface MemberErrorResponse {
  error: MemberErrorCode;
  message: string;
}

// ===== Payment =====
export interface PaymentDTO {
  id: string;
  memberId: string;
  // denormalized, bukan field asli tabel — untuk kemudahan render list
  memberNama: string;
  bulan: number; // 1-12
  tahun: number;
  jumlah: number;
  tanggalBayar: string; // ISO date
  createdAt: string;
}
export interface CreatePaymentRequest {
  memberId: string;
  bulan: number;
  tahun: number;
  jumlah: number; // default 30000 di frontend, tapi wajib dikirim eksplisit
  tanggalBayar: string; // ISO date
}
export interface PaymentConflictResponse {
  error: PaymentErrorCode;
  message: "Sudah lunas bulan ini";
  existingPaymentId: string;
}

// Error response non-conflict endpoint /api/payments (T-20) — pola sama
// LoginErrorResponse/MemberErrorResponse. Terpisah dari PaymentErrorCode
// karena "ALREADY_PAID" sudah dipakai PaymentConflictResponse (kontrak wajib).
// INVALID_INPUT: body/query gagal validasi Zod (400).
// MEMBER_NOT_FOUND: memberId di body tidak ditemukan di DB (404).
// UNAUTHORIZED: sesi invalid (401) — fallback defensif handler, disamakan
// dengan error code middleware (T-12).
export type PaymentInputErrorCode = "INVALID_INPUT" | "MEMBER_NOT_FOUND" | "UNAUTHORIZED";
export interface PaymentInputErrorResponse {
  error: PaymentInputErrorCode;
  message: string;
}

// Body PATCH /api/payments/[id] (T-21) — Tech Spec Bagian 3 menunda definisi
// body PATCH Payment ke task ini. Semua field opsional, minimal 1 diisi.
// memberId sengaja TIDAK ada di kontrak: payment tidak boleh pindah tangan
// (bukan use case); kalau dikirim di body → di-strip Zod (object default
// strip unknown keys), tidak diproses.
export interface UpdatePaymentRequest {
  jumlah?: number; // int > 0 — aplikasi layer (rapel/sumbangan bebas nominal)
  tanggalBayar?: string; // ISO date YYYY-MM-DD (keputusan T-20 date-only)
  bulan?: number; // 1-12 — koreksi salah input bulan
  tahun?: number; // 4 digit
}

// Error response PATCH/DELETE /api/payments/[id] (T-21).
// INVALID_INPUT: body gagal validasi / kosong (400).
// PAYMENT_NOT_FOUND: id payment tidak ada di DB (404).
// UNAUTHORIZED: sesi invalid (401) — fallback defensif handler, disamakan
// dengan error code middleware (T-12).
// Catatan: konflik duplikat bulan/tahun memakai PaymentConflictResponse
// (error "ALREADY_PAID" + existingPaymentId) — kontrak EXACT yang sama
// dengan POST (T-20), bukan bentuk response ini.
export type PaymentItemErrorCode = "INVALID_INPUT" | "PAYMENT_NOT_FOUND" | "UNAUTHORIZED";
export interface PaymentItemErrorResponse {
  error: PaymentItemErrorCode;
  message: string;
}

// Respon DELETE /api/payments/[id] sukses (T-21) — 200 + body sederhana,
// bukan 204: UI butuh konfirmasi sukses (toast) + id untuk update state.
export interface DeletePaymentResponse {
  deleted: true;
  id: string;
}

// ===== Expense =====
export interface ExpenseDTO {
  id: string;
  categoryId: string;
  // denormalized, bukan field asli tabel
  categoryNama: string;
  deskripsi: string;
  jumlah: number;
  tanggal: string; // ISO date
  createdAt: string;
}
export interface CreateExpenseRequest {
  categoryId: string;
  deskripsi: string;
  jumlah: number;
  tanggal: string; // ISO date
}
// Body PATCH /api/expenses/[id] (T-25) — semua field opsional, minimal 1
// diisi (dijamin Zod refine di route). Pola UpdatePaymentRequest (T-21).
export interface UpdateExpenseRequest {
  categoryId?: string;
  deskripsi?: string; // trim, min 1
  jumlah?: number; // int > 0 — application layer
  tanggal?: string; // ISO date YYYY-MM-DD (keputusan T-20 date-only)
}

// Error response endpoint /api/expenses (T-24 GET/POST, T-25 PATCH/DELETE).
// INVALID_INPUT: body/query gagal validasi Zod (400).
// EXPENSE_NOT_FOUND: id expense target tidak ada di DB (404, T-25).
// CATEGORY_NOT_FOUND: categoryId di body tidak ditemukan (404).
// UNAUTHORIZED: sesi invalid (401) — fallback defensif handler, disamakan
// dengan error code middleware (T-12).
export type ExpenseErrorCode =
  | "INVALID_INPUT"
  | "EXPENSE_NOT_FOUND"
  | "CATEGORY_NOT_FOUND"
  | "UNAUTHORIZED";
export interface ExpenseErrorResponse {
  error: ExpenseErrorCode;
  message: string;
}

// Respon DELETE /api/expenses/[id] sukses (T-25) — 200 + body sederhana,
// pola DeletePaymentResponse (T-21): UI butuh id untuk update state.
export interface DeleteExpenseResponse {
  deleted: true;
  id: string;
}

// ===== Category =====
export interface CategoryDTO {
  id: string;
  nama: string;
  isDefault: boolean;
}
// Request body POST /api/categories (T-23) — Tech Spec Bagian 3 menunda
// definisi body request Category ke task ini.
export interface CreateCategoryRequest {
  nama: string;
}

// ===== Dashboard =====
export interface DashboardSummaryResponse {
  saldo: number;
  totalMasukBulanIni: number;
  totalKeluarBulanIni: number;
  // hanya terisi untuk role ADMIN:
  jumlahBelumBayar?: number;
}

// ===== Report Snapshot (FR-23 — payload beku saat export pertama periode) =====
// Disimpan sebagai kolom Json ReportSnapshot.payload; PDF (T-31) & Excel (T-32)
// kedua render dari payload ini — angka identik antar format per periode.
export interface ReportSnapshotPayload {
  periode: { bulan: number; tahun: number };
  ringkasan: {
    totalMasuk: number; // accrual: Payment WHERE bulan/tahun = periode (semantik T-27)
    totalKeluar: number; // cash-flow: Expense WHERE tanggal dalam rentang periode (semantik T-27)
    saldoAkhirPeriode: number; // saldo historis cash-flow s.d. AKHIR periode, bukan saldo hari export
    jumlahLunas: number;
    jumlahBelumBayar: number; // dibekukan saat export — admin view saat itu
  };
  detailMasuk: Array<{
    memberNama: string; // denormalized & dibekukan — rename member tidak mengubah laporan lama
    bulan: number;
    tahun: number;
    jumlah: number;
    tanggalBayar: string; // ISO date — rapel (bayar mundur) tetap terlihat kapan uang diterima
  }>;
  detailKeluar: Array<{
    categoryNama: string; // denormalized & dibekukan
    deskripsi: string;
    jumlah: number;
    tanggal: string; // ISO date
  }>;
  dibuatPada: string; // ISO datetime — kapan snapshot dibekukan
}

// Error response endpoint /api/reports/* (T-33).
// INVALID_INPUT: query bulan/tahun gagal validasi (400).
// UNAUTHORIZED: sesi invalid (401) — fallback defensif handler.
// (RBAC ANGGOTA→403 sudah ditangani middleware, sebelum handler.)
export type ReportErrorCode = "INVALID_INPUT" | "UNAUTHORIZED";
export interface ReportErrorResponse {
  error: ReportErrorCode;
  message: string;
}

// ===== Audit Log (internal, tidak diekspos via API publik di V1) =====
export interface AuditLogEntry {
  id: string;
  actorId: string;
  actorNama: string; // denormalized, bukan field asli tabel
  aksi: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  dataLama: Record<string, unknown> | null;
  dataBaru: Record<string, unknown> | null;
  timestamp: string;
}

// ===== Deactivate Member (T-18) — aditif, sengaja TIDAK menggabung
// MemberErrorCode: lane paralel T-17 juga menambah type di file ini, jadi
// union baru didefinisikan terpisah agar tidak ada konflik baris. Bisa
// digabung saat refactor pasca-merge.
// MEMBER_NOT_FOUND: id member tidak ada (404).
// LAST_ADMIN: target admin satu-satunya admin aktif — tolak (403, FR-04).
// UNAUTHORIZED: fallback defensif sesi invalid (401, disamakan dgn middleware).
export type MemberDeactivateErrorCode = "MEMBER_NOT_FOUND" | "LAST_ADMIN" | "UNAUTHORIZED";
export interface MemberDeactivateErrorResponse {
  error: MemberDeactivateErrorCode;
  message: string;
}
