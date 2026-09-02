// KasSurs — rate limiting login (FR-18): maks 5x salah PIN berturut-turut
// per memberId dalam window 15 menit → lockout. Dicek lewat tabel LoginAttempt
// (bukan in-memory) agar konsisten meski serverless function restart.
import { prisma } from "./prisma";

export const MAX_FAILED_ATTEMPTS = 5;
export const LOCKOUT_WINDOW_MS = 15 * 60 * 1000;

export interface LoginAttemptLike {
  waktu: Date;
  berhasil: boolean;
}

export interface LockoutStatus {
  locked: boolean;
  failedCount: number; // banyaknya gagal berturut-turut yang masih dalam window
  lockedUntil: Date | null; // kapan lockout berakhir; null jika tidak locked
}

/**
 * Pure function — mudah di-unit-test tanpa DB.
 * Menghitung streak percobaan GAGAL berturut-turut (rantai di-reset oleh
 * percobaan sukses terakhir) yang terjadi dalam `windowMs` terakhir dari `now`.
 * Semantik "berturut-turut": hanya percobaan setelah sukses terakhir dihitung.
 */
export function evaluateLockout(
  attempts: LoginAttemptLike[],
  now: Date,
  maxFailed: number = MAX_FAILED_ATTEMPTS,
  windowMs: number = LOCKOUT_WINDOW_MS,
): LockoutStatus {
  const sorted = [...attempts].sort((a, b) => a.waktu.getTime() - b.waktu.getTime());

  // Streak gagal berturut-turut dari percobaan terakhir; sukses terakhir meng-reset rantai.
  const streak: LoginAttemptLike[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (sorted[i].berhasil) break;
    streak.unshift(sorted[i]);
  }

  // Hanya gagal yang masih dalam window 15 menit yang dihitung.
  const cutoff = new Date(now.getTime() - windowMs);
  const inWindow = streak.filter((a) => a.waktu >= cutoff);

  if (inWindow.length < maxFailed) {
    return { locked: false, failedCount: inWindow.length, lockedUntil: null };
  }

  // Lockout berakhir saat jumlah gagal dalam window turun di bawah maxFailed,
  // yaitu windowMs setelah gagal ke-(count - maxFailed + 1) dari urutan tertua.
  const oldestWithinLock = inWindow[inWindow.length - maxFailed];
  return {
    locked: true,
    failedCount: inWindow.length,
    lockedUntil: new Date(oldestWithinLock.waktu.getTime() + windowMs),
  };
}

/** Query wrapper: ambil riwayat LoginAttempt member lalu evaluasi lockout. */
// accepted-risk: TOCTOU window kecil (isLockedOut read → record write
// non-atomic); mitigasi utama = lockout baru aktif setelah ≥5 gagal; skala
// 30 user, DB-level fix (mis. transaction/lock row) tidak sepadan.
export async function isLockedOut(
  memberId: string,
  now: Date = new Date(),
): Promise<LockoutStatus> {
  const attempts = await prisma.loginAttempt.findMany({
    where: { memberId },
    select: { waktu: true, berhasil: true },
    orderBy: { waktu: "asc" },
  });
  return evaluateLockout(attempts, now);
}

/** Catat satu percobaan login (berhasil/salah PIN) — dipakai endpoint login (T-10). */
export async function recordLoginAttempt(memberId: string, berhasil: boolean): Promise<void> {
  await prisma.loginAttempt.create({ data: { memberId, berhasil } });
}
