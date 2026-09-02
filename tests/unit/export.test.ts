// Unit test — helper export PDF (T-31) & Excel (T-32).
// Murni render bytes dari payload — tanpa DB. Import statis aman:
// pdf.ts/excel.ts hanya import type dari @/lib/types (tanpa prisma).
import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { generateReportPdf } from "@/lib/export/pdf";
import { generateReportExcel } from "@/lib/export/excel";
import type { ReportSnapshotPayload } from "@/lib/types";

const payload: ReportSnapshotPayload = {
  periode: { bulan: 8, tahun: 2026 },
  ringkasan: {
    totalMasuk: 60000,
    totalKeluar: 45000,
    saldoAkhirPeriode: 15000,
    jumlahLunas: 2,
    jumlahBelumBayar: 1,
  },
  detailMasuk: [
    { memberNama: "Budi Santoso", bulan: 8, tahun: 2026, jumlah: 30000, tanggalBayar: "2026-08-03" },
    { memberNama: "Siti Aminah", bulan: 8, tahun: 2026, jumlah: 30000, tanggalBayar: "2026-08-10" },
  ],
  detailKeluar: [
    { categoryNama: "Konsumsi", deskripsi: "Snack rapat bulanan", jumlah: 45000, tanggal: "2026-08-15" },
  ],
  dibuatPada: "2026-08-31T23:59:59Z",
};

describe("helper export (T-31/T-32)", () => {
  it("generateReportPdf — bytes non-empty, header %PDF", () => {
    const pdf = generateReportPdf(payload);
    expect(pdf.byteLength).toBeGreaterThan(0);
    expect(new TextDecoder().decode(pdf.slice(0, 4))).toBe("%PDF");
  });

  it("generateReportExcel — bytes non-empty, header PK", () => {
    const buf = generateReportExcel(payload);
    expect(buf.byteLength).toBeGreaterThan(0);
    expect(new TextDecoder().decode(buf.slice(0, 2))).toBe("PK");
  });

  it("generateReportExcel — roundtrip XLSX.read: baris transaksi sesuai (2 masuk + 1 keluar)", () => {
    const buf = generateReportExcel(payload);
    const wb = XLSX.read(buf, { type: "buffer" });
    // Header + 2 masuk + 1 keluar = 4 baris
    const transaksi = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets["Transaksi"], { header: 1 });
    expect(transaksi.length).toBe(4);
    expect(transaksi[1][0]).toBe("Masuk");
    expect(transaksi[3][0]).toBe("Keluar");
    // Kolom tanggal tetap ISO string, bukan Date
    expect(typeof transaksi[1][5]).toBe("string");
    expect(transaksi[1][5]).toBe("2026-08-03");
    // Sheet Ringkasan ada
    const ringkasan = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets["Ringkasan"], { header: 1 });
    expect(ringkasan.some((row) => row[0] === "Total Masuk" && row[1] === 60000)).toBe(true);
  });
});
