import { describe, expect, it } from "vitest";
import {
  evaluateLockout,
  LOCKOUT_WINDOW_MS,
  MAX_FAILED_ATTEMPTS,
} from "@/lib/rate-limit";

const min = (n: number, from: Date) => new Date(from.getTime() + n * 60 * 1000);
const fail = (waktu: Date) => ({ waktu, berhasil: false });
const ok = (waktu: Date) => ({ waktu, berhasil: true });

describe("evaluateLockout", () => {
  const now = new Date("2026-08-31T10:00:00Z");

  it("<5 gagal → tidak locked", () => {
    const r = evaluateLockout(
      [fail(min(-1, now)), fail(min(-2, now)), fail(min(-3, now))],
      now,
    );
    expect(r.locked).toBe(false);
    expect(r.failedCount).toBe(3);
    expect(r.lockedUntil).toBeNull();
  });

  it("≥5 gagal dalam 15 menit → locked", () => {
    const attempts = [...Array(5)].map((_, i) => fail(min(-(i + 1), now)));
    const r = evaluateLockout(attempts, now);
    expect(r.locked).toBe(true);
    expect(r.failedCount).toBe(5);
  });

  it("gagal lama >15 menit tidak dihitung", () => {
    // 4 gagal di luar window + 1 gagal baru → hanya 1 yang dihitung → tidak locked
    const attempts = [
      fail(min(-20, now)),
      fail(min(-19, now)),
      fail(min(-18, now)),
      fail(min(-17, now)),
      fail(min(-1, now)),
    ];
    const r = evaluateLockout(attempts, now);
    expect(r.locked).toBe(false);
    expect(r.failedCount).toBe(1);
  });

  it("5 gagal semuanya di luar window → tidak locked", () => {
    const attempts = [...Array(5)].map((_, i) => fail(min(-(20 + i), now)));
    const r = evaluateLockout(attempts, now);
    expect(r.locked).toBe(false);
    expect(r.failedCount).toBe(0);
  });

  it("sukses terakhir meng-reset rantai gagal", () => {
    // 5 gagal sebelum sukses, 1 sukses terakhir → rantai reset, tidak locked
    const attempts = [
      ok(min(-1, now)),
      ...[...Array(5)].map((_, i) => fail(min(-(i + 2), now))),
    ];
    const r = evaluateLockout(attempts, now);
    expect(r.locked).toBe(false);
    expect(r.failedCount).toBe(0);
  });

  it("lockedUntil = waktu gagal ke-5 (tertua) + 15 menit", () => {
    const attempts = [...Array(5)].map((_, i) => fail(min(-(5 - i), now))); // -5..-1
    const r = evaluateLockout(attempts, now);
    expect(r.locked).toBe(true);
    expect(r.lockedUntil).toEqual(min(10, now)); // -5 + 15 menit
  });

  it("input tidak urut tetap benar (di-sort internal)", () => {
    const attempts = [
      fail(min(-1, now)),
      fail(min(-5, now)),
      fail(min(-3, now)),
      fail(min(-4, now)),
      fail(min(-2, now)),
    ];
    const r = evaluateLockout(attempts, now);
    expect(r.locked).toBe(true);
  });
});
