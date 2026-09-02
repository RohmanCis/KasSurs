// =====================================================================
// KasSurs — API Handler Kit #1: builder DTO/snapshot/response Member
// Unify duplikat yang tadinya inline per-file:
// - toMemberDTO: members/route.ts + members/[id]/route.ts + deactivate
// - memberSnapshot: 3 file yang sama (audit, FR-21 — TANPA pinHash)
// Sumber literal response: T-16/T-17/T-18 (kontrak types.ts) — JANGAN diubah.
// =====================================================================

import { NextResponse } from "next/server";
import type { Member } from "@prisma/client";
import type { MemberDTO } from "@/lib/types";

// MemberDTO dasar (5 field). statusBayarBulanIni opsional ditambahkan call
// site GET /api/members?bulan=&tahun= (butuh konteks query, tidak di sini).
export function toMemberDTO(m: Member): MemberDTO {
  return {
    id: m.id,
    nama: m.nama,
    noHp: m.noHp,
    statusAktif: m.statusAktif,
    role: m.role,
  };
}

// Snapshot aman untuk audit: TANPA pinHash (hash tidak boleh bocor ke audit
// log) — hanya field identitas + status yang relevan.
export function memberSnapshot(m: Member): Record<string, unknown> {
  return { id: m.id, nama: m.nama, noHp: m.noHp, role: m.role, statusAktif: m.statusAktif };
}

// 404 — member target tidak ada (T-17/T-18, dan memberId payment T-20).
export function memberNotFound(): NextResponse {
  return NextResponse.json(
    { error: "MEMBER_NOT_FOUND", message: "Anggota tidak ditemukan" },
    { status: 404 },
  );
}

// 409 — noHp sudah dipakai member lain (T-16/T-17, pre-check + jaring P2002).
export function phoneAlreadyRegistered(noHp: string): NextResponse {
  return NextResponse.json(
    { error: "PHONE_ALREADY_REGISTERED", message: `No HP ${noHp} sudah terdaftar` },
    { status: 409 },
  );
}

// 403 — target admin satu-satunya admin aktif (FR-04 last-admin lockout).
export function lastAdminLock(): NextResponse {
  return NextResponse.json(
    {
      error: "LAST_ADMIN",
      message:
        "Tidak bisa menonaktifkan admin ini: dia satu-satunya admin aktif. Sistem butuh minimal satu admin aktif agar tidak terkunci permanen.",
    },
    { status: 403 },
  );
}
