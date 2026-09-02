// =====================================================================
// KasSurs — Unit test src/lib/format.ts (architecture review #3)
// Regression guard utama: todayISO harus date-only LOKAL — bug historis
// (oracle #2): toISOString bergeser sehari di WIB 00:00-06:59.
// =====================================================================

import { describe, expect, it } from "vitest";
import {
  NAMA_BULAN,
  NAMA_BULAN_SINGKAT,
  formatRibuan,
  formatRupiah,
  formatTanggal,
  formatTanggalSingkat,
  todayISO,
} from "@/lib/format";

describe("todayISO", () => {
  it("mengembalikan format YYYY-MM-DD", () => {
    expect(todayISO()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("mengembalikan tanggal LOKAL hari ini (bukan UTC) — guard bug WIB", () => {
    const d = new Date();
    const lokal = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
      d.getDate()
    ).padStart(2, "0")}`;
    // Jika implementasi regressed ke toISOString, test ini gagal ketika
    // dijalankan WIB 00:00-06:59 (UTC masih tanggal sebelumnya).
    expect(todayISO()).toBe(lokal);
  });

  it("pembagian tanggal valid (komponen 1-12/1-31, guard gotcha #12)", () => {
    const [, mm, dd] = todayISO().split("-").map(Number);
    expect(mm).toBeGreaterThanOrEqual(1);
    expect(mm).toBeLessThanOrEqual(12);
    expect(dd).toBeGreaterThanOrEqual(1);
    expect(dd).toBeLessThanOrEqual(31);
  });
});

describe("formatRupiah", () => {
  it("30000 → Rp 30.000 (locale id-ID)", () => {
    expect(formatRupiah(30000)).toBe("Rp 30.000");
  });
  it("0 → Rp 0", () => {
    expect(formatRupiah(0)).toBe("Rp 0");
  });
  it("1500000 → Rp 1.500.000", () => {
    expect(formatRupiah(1500000)).toBe("Rp 1.500.000");
  });
});

describe("formatRibuan", () => {
  it("digit string dikelompokkan per 3 dengan titik", () => {
    expect(formatRibuan("30000")).toBe("30.000");
    expect(formatRibuan("300")).toBe("300");
    expect(formatRibuan("1234567")).toBe("1.234.567");
  });
});

describe("formatTanggal / formatTanggalSingkat", () => {
  it("parse date-only sebagai lokal, bukan UTC", () => {
    // "2026-09-01" — dua varian menerima output id-ID yang valid.
    expect(formatTanggal("2026-09-01")).toMatch(/^1 Sep$/);
    expect(formatTanggalSingkat("2026-09-01")).toMatch(/^01 Sep$/);
  });
  it("tanggal akhir bulan tidak bergeser", () => {
    expect(formatTanggal("2026-12-31")).toMatch(/^31 Des$/);
  });
});

describe("NAMA_BULAN", () => {
  it("12 entri, Januari pertama, Desember terakhir", () => {
    expect(NAMA_BULAN).toHaveLength(12);
    expect(NAMA_BULAN[0]).toBe("Januari");
    expect(NAMA_BULAN[11]).toBe("Desember");
  });
  it("NAMA_BULAN_SINGKAT 12 entri uppercase 3 huruf", () => {
    expect(NAMA_BULAN_SINGKAT).toHaveLength(12);
    for (const n of NAMA_BULAN_SINGKAT) expect(n).toMatch(/^[A-Z]{3}$/);
  });
});
