// =====================================================================
// KasSurs — L-01: POST /api/reports/regenerate (FR-23 koreksi + FR-21 audit)
// Source of truth: .agents/1-PRD.md FR-23, .agents/2-TECH-SPEC.md Bagian 4
// "Alur Export Laporan".
//
// Koreksi snapshot dipindah dari `GET /api/reports/pdf?regenerate=true` ke
// endpoint ini karena regenerate MENGUBAH data (menimpa payload beku +
// mencatat audit log) — bukan pembacaan. Jalur GET pdf/excel jadi murni baca
// (param asing termasuk regenerate → 400, lihat report-snapshot.ts).
//
// RBAC: middleware (T-12) menolak ANGGOTA lewat prefix /api/reports
// (ADMIN-only) sebelum handler — handler cukup memastikan sesi valid
// (fallback defensif 401, pola T-24/T-33).
//
// Body: { bulan?: number, tahun?: number } (angka, bukan string). Kosong / {}
// → bulan berjalan WIB. WIB dipakai (bukan UTC seperti default export) karena
// ini aksi user "bulan ini": pukul 00:00-06:59 WIB tanggal 1, UTC masih
// menunjuk bulan sebelumnya.
// Response 200: ringkasan periode hasil hitung ulang — payload penuh tetap
// tersimpan di tabel snapshot (sumber tunggal PDF & Excel, FR-23).
// =====================================================================

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import {
  RegenerateBusyError,
  regenerateBodySchema,
  regenerateSnapshot,
} from "@/lib/report-snapshot";
import { getSessionOr401 } from "@/lib/api/session";
import {
  badRequest,
  invalidInput,
  regenerateBusy,
  regenerateFailed,
  sessionMemberGone,
} from "@/lib/api/respond";
import type { ReportRegenerateResponse } from "@/lib/types";

// WIB = UTC+7 tetap (Indonesia tanpa DST) → geser, lalu baca bagian UTC.
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

export async function POST(request: Request) {
  const session = await getSessionOr401();
  if (session instanceof NextResponse) return session;

  // Body kosong (tanpa body / string kosong) → {} → periode default. JSON
  // rusak → 400: jangan diam-diam regenerate periode default saat klien
  // mengirim body cacat.
  const text = await request.text();
  let raw: unknown = {};
  if (text.trim() !== "") {
    try {
      raw = JSON.parse(text);
    } catch {
      return badRequest("Body request harus JSON valid");
    }
  }
  const parsed = regenerateBodySchema.safeParse(raw);
  if (!parsed.success) return invalidInput(parsed);

  const nowWib = new Date(Date.now() + WIB_OFFSET_MS);
  const bulan = parsed.data.bulan ?? nowWib.getUTCMonth() + 1;
  const tahun = parsed.data.tahun ?? nowWib.getUTCFullYear();

  try {
    // Hitung ulang + timpa payload + audit (satu transaksi + advisory lock
    // per periode) — detail di regenerateSnapshot.
    const payload = await regenerateSnapshot(bulan, tahun, session.memberId);
    const body: ReportRegenerateResponse = {
      periode: payload.periode,
      ringkasan: payload.ringkasan,
      dibuatPada: payload.dibuatPada,
    };
    return NextResponse.json(body);
  } catch (err) {
    // Tx timeout / write conflict (P2028/P2034): payload lama TIDAK berubah
    // (tx rollback) → 409, klien boleh ulang.
    if (err instanceof RegenerateBusyError) return regenerateBusy();
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      // FK violation actorId audit log → member sesi sudah dihapus manual di
      // DB → sesi tidak valid lagi (401, bukan 500; pola T-20).
      return sessionMemberGone();
    }
    // Sebab lain (DB down, constraint baru, bug) → 500 terstruktur + log
    // server-side: pesan ke klien dibuat generik (jangan bocorkan detail DB).
    console.error("regenerate laporan gagal:", err);
    return regenerateFailed();
  }
}
