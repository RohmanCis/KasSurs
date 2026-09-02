"use client";

// =====================================================================
// KasSurs — Halaman Laporan Admin (FR-15/16/17/23 — Neo-Brutalism V2.2)
// - Header bar Orange (resep 5.7). Selector periode = FilterBar (neo).
// - Export PDF/Excel: kartu dual mockup (baris 746-777) — PDF coral,
//   Excel green, ikon di kotak putih + download. Logika fetch → cek
//   res.ok → blob → URL.createObjectURL → a.click() TIDAK berubah
//   (sudah benar; error JSON terdeteksi, blob URL di-revoke).
// - Info banner FR-23 (snapshot dibekukan) bahasa awam.
// =====================================================================

import { useState } from "react";
import { Download, FileText, FileSpreadsheet } from "lucide-react";
import FilterBar from "@/components/ui/FilterBar";
import LogoutButton from "@/components/ui/LogoutButton";
import BottomNav from "@/components/layout/BottomNav";

type Format = "pdf" | "excel";

export default function LaporanPage() {
  const now = new Date();
  const [bulan, setBulan] = useState(now.getMonth() + 1);
  const [tahun, setTahun] = useState(now.getFullYear());
  const [generating, setGenerating] = useState<Format | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  async function handleExport(format: Format) {
    if (generating) return;
    setGenerating(format);
    setExportError(null);
    try {
      const res = await fetch(`/api/reports/${format}?bulan=${bulan}&tahun=${tahun}`);
      if (!res.ok) {
        let message = `Gagal membuat laporan (HTTP ${res.status}).`;
        try {
          const body = (await res.json()) as { message?: string };
          if (body.message) message = body.message;
        } catch {
          // 401 middleware redirect HTML dsb. — pakai fallback.
        }
        setExportError(message);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `laporan-kas-${tahun}-${String(bulan).padStart(2, "0")}.${
        format === "pdf" ? "pdf" : "xlsx"
      }`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setExportError("Koneksi bermasalah — coba lagi.");
    } finally {
      setGenerating(null);
    }
  }

  // Kartu export dual — mockup baris 751-776 (bukan NeoButton: layout
  // 2 kolom ikon+teks, tapi tetap resep neo-btn press-down penuh).
  const exportCardBase =
    "flex w-full items-center justify-between rounded-xl border-[2.5px] border-black p-3 text-left shadow-neo " +
    "transition-all duration-100 select-none active:translate-x-[3.5px] active:translate-y-[3.5px] active:shadow-none " +
    "disabled:translate-x-[3.5px] disabled:translate-y-[3.5px] disabled:bg-neo-gray disabled:shadow-none disabled:cursor-not-allowed";

  return (
    <main className="mx-auto w-full max-w-[430px] pb-24 md:max-w-2xl">
      {/* Header bar — resep 5.7 (laporan = Orange) */}
      <header className="flex items-center justify-between border-b-[2.5px] border-black bg-neo-orange px-4 py-2.5">
        <div>
          <h1 className="text-xs font-extrabold uppercase text-black">Laporan & Unduh</h1>
          <p className="text-xs font-bold tracking-tight text-slate-800">
            Rekap kas per bulan, PDF atau Excel.
          </p>
        </div>
        <LogoutButton />
      </header>

      <div className="space-y-3.5 p-3.5">
        <section
          aria-label="Pilih periode laporan"
          className="rounded-2xl border-[2.5px] border-black bg-white p-3.5 text-black shadow-neo"
        >
          <span className="mb-1.5 block text-[10px] font-extrabold uppercase tracking-wider">
            Pilih Periode Laporan
          </span>
          <FilterBar
            bulan={bulan}
            tahun={tahun}
            onChange={({ bulan: b, tahun: t }) => {
              setBulan(b);
              setTahun(t);
            }}
            testIdPrefix="laporan-periode"
          />
        </section>

        <div
          role="note"
          className="rounded-xl border-2 border-black bg-neo-purple px-3 py-2.5 shadow-neo-sm"
        >
          <p className="text-[11px] font-bold text-black">
            Laporan per periode dibekukan saat export pertama — export ulang
            periode yang sama menghasilkan angka yang sama.
          </p>
        </div>

        <div className="space-y-2.5" aria-busy={generating !== null}>
          <span className="block text-[10px] font-extrabold uppercase tracking-wider text-black">
            Unduh Laporan Cepat (&lt; 1 Menit)
          </span>

          {exportError && (
            <div className="rounded-xl border-2 border-black bg-neo-coral px-3 py-2.5">
              <p role="alert" data-testid="export-error" className="text-xs font-extrabold text-neo-darkred">
                {exportError}
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={() => handleExport("pdf")}
            disabled={generating !== null}
            data-testid="export-pdf-button"
            className={`${exportCardBase} bg-neo-coral text-black`}
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border-2 border-black bg-white">
                <FileText className="h-5 w-5 stroke-[2.5] text-neo-darkred" aria-hidden="true" />
              </div>
              <div>
                <div className="text-xs font-extrabold">
                  {generating === "pdf" ? "MEMBUAT PDF..." : "EXPORT LAPORAN PDF"}
                </div>
                <div className="text-[10px] font-medium text-slate-800">
                  Format resmi rekap kas siap share WA
                </div>
              </div>
            </div>
            <Download className="h-4 w-4 stroke-[2.5]" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => handleExport("excel")}
            disabled={generating !== null}
            data-testid="export-excel-button"
            className={`${exportCardBase} bg-neo-green text-black`}
          >
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border-2 border-black bg-white">
                <FileSpreadsheet className="h-5 w-5 stroke-[2.5] text-neo-darkgreen" aria-hidden="true" />
              </div>
              <div>
                <div className="text-xs font-extrabold">
                  {generating === "excel" ? "MEMBUAT EXCEL..." : "EXPORT DATA EXCEL (.XLSX)"}
                </div>
                <div className="text-[10px] font-medium text-slate-800">
                  Data mentah transaksi untuk backup
                </div>
              </div>
            </div>
            <Download className="h-4 w-4 stroke-[2.5]" aria-hidden="true" />
          </button>
        </div>
      </div>

      <BottomNav />
    </main>
  );
}
