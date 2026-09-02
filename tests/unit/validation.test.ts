// =====================================================================
// KasSurs — Unit test src/lib/validation.ts (architecture review #4)
// Regression guard gotcha #12: date-only roundtrip menolak "2026-02-30"
// (V8 silent rollover) & datetime; query bulan/tahun berpasangan.
// =====================================================================

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { dateOnly, minimalSatuField, parseBulanTahunQuery } from "@/lib/validation";

describe("dateOnly", () => {
  const schema = z.object({ tanggal: dateOnly("tanggal") });

  it("menerima tanggal kalender valid", () => {
    for (const s of ["2026-09-03", "2024-02-29", "2026-12-31", "2026-01-01"]) {
      expect(schema.safeParse({ tanggal: s }).success).toBe(true);
    }
  });

  it("menolak tanggal kalender invalid — silent rollover V8 (gotcha #12)", () => {
    // Date.parse("2026-02-30") TIDAK NaN — roundtrip wajib menangkap.
    for (const s of ["2026-02-30", "2026-04-31", "2026-13-01", "2026-00-10"]) {
      expect(schema.safeParse({ tanggal: s }).success).toBe(false);
    }
  });

  it("menolak datetime & format bukan YYYY-MM-DD (kontrak date-only)", () => {
    for (const s of [
      "2026-09-03T10:00:00Z",
      "2026-9-3",
      "26-09-03",
      "2026/09/03",
      "",
      "abc",
    ]) {
      expect(schema.safeParse({ tanggal: s }).success).toBe(false);
    }
  });

  it("pesan error memuat nama field (kontrak literal 400)", () => {
    const r = schema.safeParse({ tanggal: "2026-02-30" });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues[0].message).toBe(
        "tanggal harus tanggal ISO (YYYY-MM-DD)",
      );
    }
  });

  it("bisa dipakai opsional (.optional()) untuk skema PATCH", () => {
    const s = z.object({ tanggal: dateOnly("tanggalBayar").optional() });
    expect(s.safeParse({}).success).toBe(true);
    expect(s.safeParse({ tanggal: "2026-09-03" }).success).toBe(true);
    expect(s.safeParse({ tanggal: "2026-02-30" }).success).toBe(false);
  });
});

describe("minimalSatuField", () => {
  const schema = minimalSatuField(
    z.object({
      jumlah: z.number().int().positive().optional(),
      nama: z.string().trim().min(1).optional(),
    }),
  );

  it("body kosong ditolak", () => {
    expect(schema.safeParse({}).success).toBe(false);
  });

  it("minimal satu field diterima", () => {
    expect(schema.safeParse({ jumlah: 30000 }).success).toBe(true);
    expect(schema.safeParse({ nama: "Budi" }).success).toBe(true);
    expect(schema.safeParse({ jumlah: 30000, nama: "Budi" }).success).toBe(true);
  });

  it("field invalid tetap ditolak walau field lain ada", () => {
    expect(schema.safeParse({ jumlah: -1 }).success).toBe(false);
  });
});

describe("parseBulanTahunQuery", () => {
  const q = (s: string) => new URLSearchParams(s);

  it("absen keduanya → null (tanpa filter)", () => {
    expect(parseBulanTahunQuery(q(""))).toBeNull();
  });

  it("berpasangan & valid → objek", () => {
    expect(parseBulanTahunQuery(q("bulan=9&tahun=2026"))).toEqual({
      bulan: 9,
      tahun: 2026,
    });
    expect(parseBulanTahunQuery(q("bulan=12&tahun=1999"))).toEqual({
      bulan: 12,
      tahun: 1999,
    });
    expect(parseBulanTahunQuery(q("bulan=01&tahun=2026"))).toEqual({
      bulan: 1,
      tahun: 2026,
    });
  });

  it("satu tanpa pasangan → INVALID (400, bukan diabaikan)", () => {
    expect(parseBulanTahunQuery(q("bulan=9"))).toBe("INVALID");
    expect(parseBulanTahunQuery(q("tahun=2026"))).toBe("INVALID");
  });

  it("nilai di luar rentang / format salah → INVALID", () => {
    expect(parseBulanTahunQuery(q("bulan=0&tahun=2026"))).toBe("INVALID");
    expect(parseBulanTahunQuery(q("bulan=13&tahun=2026"))).toBe("INVALID");
    expect(parseBulanTahunQuery(q("bulan=9&tahun=26"))).toBe("INVALID");
    expect(parseBulanTahunQuery(q("bulan=abc&tahun=2026"))).toBe("INVALID");
  });
});
