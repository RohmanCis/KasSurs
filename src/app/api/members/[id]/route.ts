// =====================================================================
// KasSurs — T-17: PATCH /api/members/[id] (Update & Reset Akses) (FR-02)
// Source of truth: .agents/2-TECH-SPEC.md (Bagian 3 UpdateMemberRequest &
// MemberDTO) & .agents/1-PRD.md FR-02.
// RBAC: middleware (T-12) sudah menolak non-ADMIN sebelum handler ini —
// handler TIDAK cek role lagi, hanya memastikan session valid untuk
// mengambil actorId (audit log).
//
// Body UpdateMemberRequest: semua field opsional, minimal satu diisi —
// body kosong → 400. noHp baru dicek unik pre-update (409 pesan jelas) +
// jaring P2002 untuk race condition antar request. PIN di-reset → hash
// bcrypt baru ditulis ke pinHash.
//
// Atomicity (FR-21): SELECT (snapshot dataLama) → UPDATE → recordAuditLog
// dalam SATU prisma.$transaction (txClient) — sukses/gagal bersama.
// Snapshot audit TANPA pinHash (hash tidak boleh bocor ke audit log);
// reset PIN cukup ditandai "[reset]" — preseden sama T-16.
// =====================================================================

import { z } from "zod";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashPin, verifySession, SESSION_COOKIE_NAME } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import { minimalSatuField } from "@/lib/validation";
import type { MemberDTO, MemberErrorResponse } from "@/lib/types";

// Validasi field sama T-16 (nama/noHp non-empty, pin 4-6 digit) — semua
// opsional; minimalSatuField menjamin minimal satu field diisi (body {} → 400).
// statusAktif: QA #3 (2026-09-01) — reaktivasi anggota nonaktif (true).
// false DITOLAK di sini: penonaktifan punya logika khusus last-admin
// guard di endpoint deactivate — jangan bisa dilewati via PATCH.
const updateMemberSchema = minimalSatuField(
  z.object({
    nama: z.string().trim().min(1, "Nama wajib diisi").optional(),
    noHp: z.string().trim().min(1, "No HP wajib diisi").optional(),
    pin: z.string().regex(/^\d{4,6}$/, "PIN harus 4-6 digit angka").optional(),
    statusAktif: z.literal(true, { message: "Penonaktifkan anggota lewat tombol Nonaktifkan" }).optional(),
  }),
);

function badRequest(message: string): NextResponse<MemberErrorResponse> {
  return NextResponse.json({ error: "INVALID_INPUT", message }, { status: 400 });
}

function unauthorized(): NextResponse<MemberErrorResponse> {
  // Fallback defensif — normalnya middleware (T-12) sudah menolak duluan.
  // Error code disamakan dengan middleware (UNAUTHORIZED) agar konsisten.
  return NextResponse.json(
    { error: "UNAUTHORIZED", message: "Belum login atau sesi kedaluwarsa" },
    { status: 401 },
  );
}

function phoneConflict(noHp: string): NextResponse<MemberErrorResponse> {
  return NextResponse.json(
    { error: "PHONE_ALREADY_REGISTERED", message: `No HP ${noHp} sudah terdaftar` },
    { status: 409 },
  );
}

function notFound(): NextResponse<MemberErrorResponse> {
  return NextResponse.json(
    { error: "MEMBER_NOT_FOUND", message: "Anggota tidak ditemukan" },
    { status: 404 },
  );
}

// Snapshot aman untuk audit: TANPA pinHash (hash tidak boleh bocor ke audit
// log) — hanya field identitas + status yang relevan (sama T-16).
function memberSnapshot(m: {
  id: string;
  nama: string;
  noHp: string;
  role: string;
  statusAktif: boolean;
}): Record<string, unknown> {
  return { id: m.id, nama: m.nama, noHp: m.noHp, role: m.role, statusAktif: m.statusAktif };
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  if (!token) return unauthorized();
  const session = await verifySession(token);
  if (!session) return unauthorized();
  const actorId = session.memberId;

  const { id } = params;

  const raw = await request.json().catch(() => null);
  const parsed = updateMemberSchema.safeParse(raw);
  if (!parsed.success) {
    return badRequest(parsed.error.issues[0]?.message ?? "Input tidak valid");
  }
  const body = parsed.data;

  try {
    // FR-21 atomicity: cek 404/409 + snapshot + update + audit dalam SATU
    // transaksi — konsisten dan rollback bersama.
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.member.findUnique({ where: { id } });
      if (!existing) return { kind: "not_found" as const };

      // noHp baru sudah dipakai member LAIN → 409 (jaring P2002 di bawah
      // tetap ada untuk race condition antar request).
      if (body.noHp !== undefined) {
        const other = await tx.member.findUnique({ where: { noHp: body.noHp } });
        if (other && other.id !== id) return { kind: "conflict" as const };
      }

      const pinHash = body.pin !== undefined ? await hashPin(body.pin) : undefined;
      const updated = await tx.member.update({
        where: { id },
        data: {
          ...(body.nama !== undefined ? { nama: body.nama } : {}),
          ...(body.noHp !== undefined ? { noHp: body.noHp } : {}),
          ...(pinHash !== undefined ? { pinHash } : {}),
          ...(body.statusAktif !== undefined ? { statusAktif: body.statusAktif } : {}),
        },
      });

      const dataBaru: Record<string, unknown> = memberSnapshot(updated);
      // Pin reset hanya ditandai — hash asli tidak pernah masuk audit log.
      if (body.pin !== undefined) dataBaru.pin = "[reset]";
      await recordAuditLog(actorId, "UPDATE", "Member", id, memberSnapshot(existing), dataBaru, tx);

      return { kind: "ok" as const, member: updated };
    });

    if (result.kind === "not_found") return notFound();
    if (result.kind === "conflict") return phoneConflict(body.noHp!);

    const dto: MemberDTO = {
      id: result.member.id,
      nama: result.member.nama,
      noHp: result.member.noHp,
      statusAktif: result.member.statusAktif,
      role: result.member.role,
    };
    return NextResponse.json(dto, { status: 200 });
  } catch (err) {
    // Race condition: dua request PATCH noHp sama dalam waktu bersamaan →
    // constraint unique DB melindungi; tangkap P2002 → 409 sama.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return phoneConflict(body.noHp ?? "");
    }
    throw err;
  }
}
