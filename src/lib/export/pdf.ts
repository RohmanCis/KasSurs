// =====================================================================
// KasSurs — Helper Export PDF (T-31)
// jsPDF + jspdf-autotable, portrait A4. Render dari ReportSnapshotPayload
// (FR-23) — angka beku, tidak dihitung ulang di sini.
// =====================================================================
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { ReportSnapshotPayload } from "@/lib/types";
import { NAMA_BULAN } from "@/lib/format";

/** Nominal Rupiah: 30000 → "Rp30.000" (locale id-ID, tanpa desimal). */
function formatRupiah(nomor: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(nomor);
}

/** ISO date "2026-08-30" → "30/08/2026". Tahan input datetime (ambil 10 char pertama). */
function formatTanggal(iso: string): string {
  const [tahun, bulan, tanggal] = iso.slice(0, 10).split("-");
  return `${tanggal}/${bulan}/${tahun}`;
}

/** Nilai finalY tabel terakhir — dipakai untuk posisi konten berikutnya. */
function lastTableY(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
    .finalY;
}

/** /ID PDF deterministik dari identitas snapshot — 32 hex char (syarat setFileId). */
function hashSnapshot(payload: ReportSnapshotPayload): string {
  const sumber = `${payload.periode.tahun}-${payload.periode.bulan}-${payload.dibuatPada}`;
  let hasil = "";
  // 4x FNV-1a 32-bit dengan salt beda → 32 hex char
  for (let r = 0; r < 4; r++) {
    let h = 0x811c9dc5 ^ (r * 0x9e3779b9);
    for (let i = 0; i < sumber.length; i++) {
      h = (h ^ (sumber.charCodeAt(i) + r)) * 0x01000193 >>> 0;
    }
    hasil += h.toString(16).padStart(8, "0");
  }
  return hasil;
}

export function generateReportPdf(payload: ReportSnapshotPayload): Uint8Array {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  // creationDate & /ID dibekukan dari snapshot (FR-23) — re-export periode
  // sama menghasilkan file byte-identikal, bukan timestamp/id acak per render.
  doc.setCreationDate(new Date(payload.dibuatPada));
  doc.setFileId(hashSnapshot(payload));
  const margin = 14;
  const lebar = doc.internal.pageSize.getWidth() - margin * 2;
  const { periode } = payload;
  const namaPeriode = `${NAMA_BULAN[periode.bulan - 1]} ${periode.tahun}`;

  // --- Judul & periode ---
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(`Laporan Kas — ${namaPeriode}`, margin, 20);
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120);
  doc.text(`Periode: ${namaPeriode}`, margin, 26);
  doc.setTextColor(0);

  // --- Tabel ringkasan ---
  const { ringkasan } = payload;
  autoTable(doc, {
    startY: 32,
    margin: { left: margin, right: margin },
    theme: "grid",
    head: [["Ringkasan", "Nilai"]],
    body: [
      ["Total Masuk", formatRupiah(ringkasan.totalMasuk)],
      ["Total Keluar", formatRupiah(ringkasan.totalKeluar)],
      ["Saldo Akhir Periode", formatRupiah(ringkasan.saldoAkhirPeriode)],
      ["Jumlah Lunas", String(ringkasan.jumlahLunas)],
      ["Jumlah Belum Bayar", String(ringkasan.jumlahBelumBayar)],
    ],
    columnStyles: {
      0: { cellWidth: lebar * 0.6 },
      1: { cellWidth: lebar * 0.4, halign: "right" },
    },
    headStyles: { fillColor: [31, 41, 55] },
    styles: { fontSize: 10, cellPadding: 2.5 },
  });
  let y = lastTableY(doc) + 8;

  // --- Tabel Pemasukan ---
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Pemasukan", margin, y);
  y += 5;
  if (payload.detailMasuk.length === 0) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120);
    doc.text("Tidak ada data pemasukan pada periode ini.", margin, y);
    doc.setTextColor(0);
    y += 7;
  } else {
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      theme: "grid",
      head: [["Nama Anggota", "Bulan/Tahun Iuran", "Jumlah", "Tanggal Bayar"]],
      body: payload.detailMasuk.map((m) => [
        m.memberNama,
        `${NAMA_BULAN[m.bulan - 1]} ${m.tahun}`,
        formatRupiah(m.jumlah),
        formatTanggal(m.tanggalBayar),
      ]),
      columnStyles: {
        0: { cellWidth: lebar * 0.34 },
        1: { cellWidth: lebar * 0.26 },
        2: { cellWidth: lebar * 0.22, halign: "right" },
        3: { cellWidth: lebar * 0.18, halign: "center" },
      },
      headStyles: { fillColor: [21, 128, 61] },
      styles: { fontSize: 9, cellPadding: 2 },
    });
    y = lastTableY(doc) + 8;
  }

  // --- Tabel Pengeluaran ---
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("Pengeluaran", margin, y);
  y += 5;
  if (payload.detailKeluar.length === 0) {
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(120);
    doc.text("Tidak ada data pengeluaran pada periode ini.", margin, y);
    doc.setTextColor(0);
  } else {
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      theme: "grid",
      head: [["Kategori", "Deskripsi", "Jumlah", "Tanggal"]],
      body: payload.detailKeluar.map((k) => [
        k.categoryNama,
        k.deskripsi,
        formatRupiah(k.jumlah),
        formatTanggal(k.tanggal),
      ]),
      columnStyles: {
        0: { cellWidth: lebar * 0.22 },
        1: { cellWidth: lebar * 0.4 },
        2: { cellWidth: lebar * 0.2, halign: "right" },
        3: { cellWidth: lebar * 0.18, halign: "center" },
      },
      headStyles: { fillColor: [190, 18, 60] },
      styles: { fontSize: 9, cellPadding: 2 },
    });
  }

  // --- Footer snapshot (halaman terakhir) ---
  doc.setPage(doc.getNumberOfPages());
  const tinggi = doc.internal.pageSize.getHeight();
  doc.setFontSize(8);
  doc.setFont("helvetica", "italic");
  doc.setTextColor(120);
  doc.text(`Dibekukan (snapshot): ${payload.dibuatPada}`, margin, tinggi - 18);
  doc.text(
    "Laporan beku — nilai tidak berubah meski ada transaksi kemudian (FR-23).",
    margin,
    tinggi - 14,
  );

  return new Uint8Array(doc.output("arraybuffer"));
}
