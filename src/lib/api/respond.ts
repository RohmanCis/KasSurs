// =====================================================================
// KasSurs — API Handler Kit #1: respond helpers generik
// Satu sumber literal error response (error code / message / status) untuk
// semua route handler. Kontrak HTTP wajib byte-identik (integration tests
// adalah safety net). Literal ada DI SINI sekali — jangan duplikat di route.
// =====================================================================

import { NextResponse } from "next/server";

// 401 — token tidak ada / invalid / expired. Fallback defensif: normalnya
// middleware (T-12) sudah menolak duluan dengan error code sama.
export function unauthorized(): NextResponse {
  return NextResponse.json(
    { error: "UNAUTHORIZED", message: "Belum login atau sesi kedaluwarsa" },
    { status: 401 },
  );
}

// 401 — P2003 FK violation saat tulis audit log: actor (member sesi) sudah
// dihapus manual di DB → sesi tidak valid lagi, bukan 500.
export function sessionMemberGone(): NextResponse {
  return NextResponse.json(
    { error: "UNAUTHORIZED", message: "Sesi merujuk ke anggota yang tidak ada lagi" },
    { status: 401 },
  );
}

// Bentuk minimal hasil .safeParse gagal — menerima ZodError apa pun secara
// struktural (cukup error.issues[].message), tanpa import zod di sini.
export interface ZodFailedResult {
  success: false;
  error: { issues: { message: string }[] };
}

// 400 — body/query gagal validasi Zod: pesan dari issue pertama.
// Call site: `if (!parsed.success) return invalidInput(parsed);`
export function invalidInput(zodResult: ZodFailedResult): NextResponse {
  return NextResponse.json(
    { error: "INVALID_INPUT", message: zodResult.error.issues[0]?.message ?? "Input tidak valid" },
    { status: 400 },
  );
}

// 400 — pesan literal dari route (bukan dari Zod), mis. query bulan/tahun
// tidak valid.
export function badRequest(message: string): NextResponse {
  return NextResponse.json({ error: "INVALID_INPUT", message }, { status: 400 });
}

// 409 — POST /api/reports/regenerate tabrakan dengan perhitungan lain yang
// masih berjalan (transaksi timeout/write conflict, P2028/P2034). Artinya
// data lama TIDAK berubah — minta klien coba lagi (retry-able, bukan gagal).
export function regenerateBusy(): NextResponse {
  return NextResponse.json(
    {
      error: "REGENERATE_BUSY",
      message: "Laporan sedang dihitung ulang. Tunggu sebentar, lalu coba lagi.",
    },
    { status: 409 },
  );
}

// 500 — regenerate gagal karena sebab lain (DB error non-timeout, P2003
// sudah dipetakan 401 di route). Pesan generik: detail DB tidak dibocorkan.
export function regenerateFailed(): NextResponse {
  return NextResponse.json(
    { error: "REGENERATE_FAILED", message: "Gagal menghitung ulang laporan. Coba lagi." },
    { status: 500 },
  );
}

// 503 — GET export PDF/Excel saat transaksi perhitungan snapshot
// timeout/write conflict (P2028/P2034): server sibuk, request ini tidak
// mengubah apa pun → klien boleh ulang.
export function serviceBusy(): NextResponse {
  return NextResponse.json(
    { error: "SERVICE_BUSY", message: "Laporan sedang sibuk. Coba lagi sebentar." },
    { status: 503 },
  );
}

// 500 — GET export gagal karena error DB lain.
export function reportFailed(): NextResponse {
  return NextResponse.json(
    { error: "REPORT_FAILED", message: "Gagal membuat laporan. Coba lagi." },
    { status: 500 },
  );
}
