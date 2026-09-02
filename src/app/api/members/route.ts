// =====================================================================
// KasSurs — T-16: GET & POST /api/members (FR-03, FR-05)
// Source of truth: .agents/2-TECH-SPEC.md (Bagian 3 tabel API + MemberDTO/
// CreateMemberRequest) & .agents/1-PRD.md FR-03/FR-05.
// RBAC: middleware (T-12) sudah menolak non-ADMIN sebelum handler ini —
// handler TIDAK cek role lagi, hanya memastikan session valid untuk
// mengambil actorId (audit log).
//
// Deviasi (disetujui orchestrator): GET mengembalikan SEMUA anggota
// (aktif + nonaktif) dengan field `statusAktif` — UI manajemen anggota
// (T-19) butuh menampilkan status aktif/nonaktif dan MemberDTO.statusAktif
// memang ada di kontrak. Acceptance criteria "list seluruh anggota aktif"
// dimaknai "tanpa pagination/search — sekali fetch"; filter/search dilakukan
// client-side (skala ≤30 anggota, lihat .agents/3-DESIGN.md).
//
// GET ?bulan=&tahun= → statusBayarBulanIni per anggota: SATU query payments
// (where { bulan, tahun }, select memberId) lalu map ke Set — tanpa N+1
// query per anggota.
// =====================================================================

import { z } from "zod";
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashPin } from "@/lib/auth";
import { recordAuditLog } from "@/lib/audit";
import { parseBulanTahunQuery } from "@/lib/validation";
import { getSessionOr401 } from "@/lib/api/session";
import { badRequest, invalidInput } from "@/lib/api/respond";
import {
  memberSnapshot,
  phoneAlreadyRegistered,
  toMemberDTO,
} from "@/lib/dto/member";
import type { MemberDTO, PaymentStatus } from "@/lib/types";

// noHp divalidasi longgar (non-empty) — format bebas, jangan over-validate;
// keunikan dijaga DB (unique) + dicek pre-create (409 pesan jelas).
const createMemberSchema = z.object({
  nama: z.string().trim().min(1, "Nama wajib diisi"),
  noHp: z.string().trim().min(1, "No HP wajib diisi"),
  pin: z.string().regex(/^\d{4,6}$/, "PIN harus 4-6 digit angka"),
});

export async function GET(request: Request) {
  const url = new URL(request.url);

  // Query bulan/tahun harus muncul berpasangan & valid (lib/validation);
  // satu tanpa pasangan atau invalid → 400 (bukan diabaikan diam-diam).
  const periode = parseBulanTahunQuery(url.searchParams);
  if (periode === "INVALID") {
    return badRequest("Query bulan (1-12) dan tahun (4 digit) wajib valid");
  }
  const bulan = periode?.bulan ?? null;
  const tahun = periode?.tahun ?? null;

  // Deviasi: SEMUA anggota (aktif + nonaktif) dikembalikan — lihat header.
  const members = await prisma.member.findMany({ orderBy: { nama: "asc" } });

  let paidIds = new Set<string>();
  if (bulan !== null && tahun !== null) {
    const paid = await prisma.payment.findMany({
      where: { bulan, tahun },
      select: { memberId: true },
    });
    paidIds = new Set(paid.map((p) => p.memberId));
  }

  const dtos: MemberDTO[] = members.map((m) => ({
    ...toMemberDTO(m),
    ...(bulan !== null
      ? { statusBayarBulanIni: (paidIds.has(m.id) ? "LUNAS" : "BELUM_BAYAR") as PaymentStatus }
      : {}),
  }));
  return NextResponse.json(dtos);
}

export async function POST(request: Request) {
  const session = await getSessionOr401();
  if (session instanceof NextResponse) return session;
  const actorId = session.memberId;

  const raw = await request.json().catch(() => null);
  const parsed = createMemberSchema.safeParse(raw);
  if (!parsed.success) return invalidInput(parsed);
  const body = parsed.data;

  // Cek noHp unik dulu (409 pesan jelas) — jaring pengaman P2002 di bawah
  // tetap ada untuk race condition antar request.
  const existing = await prisma.member.findUnique({ where: { noHp: body.noHp } });
  if (existing) return phoneAlreadyRegistered(body.noHp);

  const pinHash = await hashPin(body.pin);
  try {
    // FR-21 atomicity: create member + audit log dalam SATU transaksi
    // (recordAuditLog dengan txClient — pola sama T-15/audit.test.ts).
    const member = await prisma.$transaction(async (tx) => {
      const created = await tx.member.create({
        data: {
          nama: body.nama,
          noHp: body.noHp,
          pinHash,
          // role default ANGGOTA (default skema) — tidak pernah diset dari
          // body; statusAktif default true (default skema).
        },
      });
      await recordAuditLog(actorId, "CREATE", "Member", created.id, null, memberSnapshot(created), tx);
      return created;
    });

    const dto = toMemberDTO(member);
    return NextResponse.json(dto, { status: 201 });
  } catch (err) {
    // Race condition: dua request POST noHp sama dalam waktu bersamaan →
    // constraint unique DB melindungi; tangkap P2002 → 409 sama.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return phoneAlreadyRegistered(body.noHp);
    }
    throw err;
  }
}
