// =====================================================================
// KasSurs — Helper Export Excel (T-32)
// SheetJS (xlsx) 0.18.x. 2 sheet: "Ringkasan" + "Transaksi".
// Render dari ReportSnapshotPayload (FR-23) — angka identik dengan PDF (T-31).
// Nama file ditentukan endpoint (T-33), helper hanya return bytes.
// =====================================================================
import * as XLSX from "xlsx";
import type { ReportSnapshotPayload } from "@/lib/types";

// Nama bulan Indonesia — dipakai di judul sheet Ringkasan.
const NAMA_BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

export function generateReportExcel(payload: ReportSnapshotPayload): Buffer {
  const { periode, ringkasan } = payload;
  const namaPeriode = `${NAMA_BULAN[periode.bulan - 1]} ${periode.tahun}`;

  // --- Sheet 1: Ringkasan (periode + 5 angka ringkasan) ---
  const sheetRingkasan = XLSX.utils.aoa_to_sheet([
    ["Laporan Kas", namaPeriode],
    [],
    ["Periode Bulan", periode.bulan],
    ["Periode Tahun", periode.tahun],
    ["Total Masuk", ringkasan.totalMasuk],
    ["Total Keluar", ringkasan.totalKeluar],
    ["Saldo Akhir Periode", ringkasan.saldoAkhirPeriode],
    ["Jumlah Lunas", ringkasan.jumlahLunas],
    ["Jumlah Belum Bayar", ringkasan.jumlahBelumBayar],
    ["Dibekukan (snapshot)", payload.dibuatPada],
  ]);

  // --- Sheet 2: Transaksi (baris gabungan Masuk + Keluar) ---
  // Kolom tanggal pakai ISO string (bukan Date object) — konsisten kontrak API.
  const barisMasuk = payload.detailMasuk.map((m) => [
    "Masuk",
    m.memberNama,
    "Iuran anggota",
    `${m.bulan}/${m.tahun}`,
    m.jumlah,
    m.tanggalBayar,
  ]);
  const barisKeluar = payload.detailKeluar.map((k) => [
    "Keluar",
    k.categoryNama,
    k.deskripsi,
    "", // Bulan Iuran khusus baris Masuk
    k.jumlah,
    k.tanggal,
  ]);
  const sheetTransaksi = XLSX.utils.aoa_to_sheet([
    ["Jenis", "Nama/Kategori", "Deskripsi", "Bulan Iuran", "Jumlah", "Tanggal"],
    ...barisMasuk,
    ...barisKeluar,
  ]);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheetRingkasan, "Ringkasan");
  XLSX.utils.book_append_sheet(wb, sheetTransaksi, "Transaksi");

  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
