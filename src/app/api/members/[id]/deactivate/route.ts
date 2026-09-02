// =====================================================================
// KasSurs — T-18: PATCH /api/members/[id]/deactivate (FR-04, FR-21)
// Source of truth: .agents/2-TECH-SPEC.md (Bagian 4 business rules —
// "Anggota nonaktif tidak dihapus datanya, hanya statusAktif=false") &
// .agents/1-PRD.md FR-04 (last-admin lockout).
// RBAC: middleware (T-12) sudah menolak non-ADMIN sebelum handler ini —
// handler hanya memastikan session valid untuk mengambil actorId (audit log).
//
// Soft delete: record TIDAK dihapus — payments & audit historis tetap utuh
// (data historis wajib bertahan, business rule Bagian 4).
//
// Last-admin lockout (FR-04): menonaktifkan admin yang merupakan satu-satunya
// ADMIN aktif → 403 LAST_ADMIN. Cek count admin aktif dilakukan DI DALAM
// prisma.$transaction yang sama dengan update — count + update + audit
// sukses/gagal bersama (FR-21 atomicity).
//
// Keputusan isolasi: interactive transaction Prisma default ReadCommitted —
// ada race window kecil antara count admin aktif & update statusAktif (dua
// request paralel bisa lolos cek bersamaan → nol admin aktif tersisa).
// Diterima by design: skala ≤30 user dengan tipikal satu admin aktif;
// konsekuensi terburuk (lockout admin) dipulihkan manual via DB (seed
// bootstrap T-22 menyediakan jalur). Serializable isolation menambah
// overhead retry/latensi tanpa kebutuhan nyata di skala ini.
//
// Idempotensi: member yang sudah statusAktif=false → 200 tanpa perubahan
// DAN tanpa audit row baru (tidak ada state yang berubah untuk dicatat).
// =====================================================================

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { recordAuditLog } from "@/lib/audit";
import { getSessionOr401 } from "@/lib/api/session";
import { lastAdminLock, memberNotFound, memberSnapshot, toMemberDTO } from "@/lib/dto/member";

export async function PATCH(_request: Request, { params }: { params: { id: string } }) {
  const session = await getSessionOr401();
  if (session instanceof NextResponse) return session;
  const actorId = session.memberId;

  const target = await prisma.member.findUnique({ where: { id: params.id } });
  if (!target) return memberNotFound();

  // Idempoten: sudah nonaktif → 200 tanpa perubahan & tanpa audit (lihat
  // header — tidak ada state berubah, tidak ada yang perlu dicatat).
  if (!target.statusAktif) {
    const dto = toMemberDTO(target);
    return NextResponse.json(dto);
  }

  const dataLama = memberSnapshot(target);

  const result = await prisma.$transaction(async (tx) => {
    // Last-admin lockout: count admin aktif DI DALAM tx yang sama dengan
    // update — atomik terhadap update & audit di bawah (FR-21).
    if (target.role === "ADMIN") {
      const adminAktif = await tx.member.count({
        where: { role: "ADMIN", statusAktif: true },
      });
      if (adminAktif <= 1) return { blocked: true as const };
    }
    const updated = await tx.member.update({
      where: { id: target.id },
      data: { statusAktif: false },
    });
    await recordAuditLog(
      actorId,
      "UPDATE",
      "Member",
      updated.id,
      dataLama,
      memberSnapshot(updated),
      tx,
    );
    return { blocked: false as const, member: updated };
  });

  if (result.blocked) return lastAdminLock();

  const dto = toMemberDTO(result.member);
  return NextResponse.json(dto);
}
