// T-10: POST /api/auth/login — alur: validasi Zod → cari member by noHp →
// cek lockout → verify PIN → catat LoginAttempt → set session cookie.
// Spec: Bagian 4 alur login, Bagian 3 LoginResponse/LoginErrorResponse.
import { z } from "zod";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isLockedOut, recordLoginAttempt } from "@/lib/rate-limit";
import { setSessionCookie, verifyPin } from "@/lib/auth";
import type { LoginErrorResponse, LoginResponse } from "@/lib/types";

// noHp/pin divalidasi longgar (non-empty) — verifikasi sebenarnya dilakukan
// oleh bcrypt; validasi format 4-6 digit PIN hanya di CreateMemberRequest (T-16),
// agar login tidak membocorkan requirement format lewat error message.
const loginSchema = z.object({
  noHp: z.string().trim().min(1, "No HP wajib diisi"),
  pin: z.string().min(1, "PIN wajib diisi"),
});

// Hash bcrypt dari hashPin("dummy") — untuk dummy compare saat member tidak
// ditemukan/nonaktif: biaya bcrypt (~100ms) dibuat setara dengan cabang
// PIN-salah, mencegah timing user-enumeration (N1).
const DUMMY_PIN_HASH =
  "$2b$10$s4yq4GFClMZluTSwfGd2dO0IMe.Ie7c73SwAEB4/IH3dSXvhu.jvC";

function unauthorized(): NextResponse<LoginErrorResponse> {
  // Pesan identik untuk member tidak ditemukan / nonaktif / PIN salah —
  // jangan bocorkan mana yang salah (anti user enumeration).
  return NextResponse.json(
    { error: "INVALID_CREDENTIALS", message: "No HP atau PIN salah" },
    { status: 401 },
  );
}

export async function POST(request: Request) {
  const raw = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "INVALID_INPUT",
        message: parsed.error.issues[0]?.message ?? "Input tidak valid",
      },
      { status: 400 },
    );
  }
  const { noHp, pin } = parsed.data;

  const member = await prisma.member.findUnique({ where: { noHp } });
  // Tidak ditemukan / nonaktif → 401 identik, tanpa mencatat LoginAttempt
  // (tidak ada memberId yang valid untuk rate-limit; akun nonaktif tak
  // perlu dikunci lagi karena memang tak bisa login). Dummy bcrypt compare
  // agar waktu respons setara dengan cabang PIN-salah (N1).
  if (!member || !member.statusAktif) {
    await verifyPin(pin, DUMMY_PIN_HASH);
    return unauthorized();
  }

  const lockout = await isLockedOut(member.id);
  if (lockout.locked) {
    const body: LoginErrorResponse = {
      error: "ACCOUNT_LOCKED",
      message: "Terlalu banyak percobaan gagal. Coba lagi nanti.",
      lockedUntil: lockout.lockedUntil?.toISOString(),
    };
    return NextResponse.json(body, { status: 429 });
  }

  const ok = await verifyPin(pin, member.pinHash);
  await recordLoginAttempt(member.id, ok);

  if (!ok) {
    return unauthorized();
  }

  await setSessionCookie({ memberId: member.id, role: member.role });
  const body: LoginResponse = {
    role: member.role,
    memberId: member.id,
    nama: member.nama,
  };
  return NextResponse.json(body);
}
