import { CheckCircle2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAMA_BULAN_SINGKAT } from "@/lib/format";
import type { PaymentDTO } from "@/lib/types";

// PassbookCard — Buku Kas Digital anggota (subscreen-member).
// Acuan DOM: mockup kassurs_ui_neobrutalism_final.html baris 627-668.
// Satu file dua bagian: kupon status bulan berjalan + matriks iuran 12 bulan.
// Murni presentational (server component OK — tanpa event handler).
export interface PassbookCardProps {
  nama: string;
  statusAktif: boolean; // tampil "(Aktif)"/"(Nonaktif)" — mockup header baris 618
  tahun: number;
  bulanIni: number; // 1-12
  payments: PaymentDTO[]; // payments tahun ts — komponen derive matriks & status
  className?: string;
  "data-testid"?: string; // hook E2E Playwright (FASE-3 Langkah 3)
}

// Varian UPPERCASE — beda dari NAMA_BULAN di lib/format (Title Case),
// sengaja tidak digabung.
const NAMA_BULAN_PANJANG = [
  "JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI",
  "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER",
] as const;

const formatRupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

// "2026-09-01" → "01 Sep 2026" (locale id-ID)
function formatTanggal(isoDate: string): string {
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(isoDate));
}

export default function PassbookCard({
  nama,
  statusAktif,
  tahun,
  bulanIni,
  payments,
  className,
  "data-testid": testId,
}: PassbookCardProps) {
  // Matriks derive: 1 payment unik per (bulan, tahun) — dijamin unique constraint DB
  const paymentPerBulan = new Map<number, PaymentDTO>();
  for (const p of payments) {
    if (p.tahun === tahun && p.bulan >= 1 && p.bulan <= 12) {
      paymentPerBulan.set(p.bulan, p);
    }
  }

  const paymentBulanIni = paymentPerBulan.get(bulanIni);
  const lunasBulanIni = paymentBulanIni !== undefined;
  const jumlahLunasTahunIni = paymentPerBulan.size;
  const namaBulanIni = NAMA_BULAN_PANJANG[bulanIni - 1];

  return (
    <div className={cn("space-y-3.5", className)} data-testid={testId}>
      {/* ===== Kupon besar status bulan berjalan (mockup 628-645) ===== */}
      <div
        className={cn(
          "p-3.5 border-3 border-black rounded-2xl shadow-neo text-black text-center relative overflow-hidden",
          lunasBulanIni ? "bg-neo-green" : "bg-neo-coral"
        )}
      >
        <div className="flex justify-between text-[10px] font-extrabold uppercase mb-1">
          <span>BUKU KAS DIGITAL</span>
          <span className="tabular-nums font-bold">TH. {tahun}</span>
        </div>

        <div className="text-[11px] font-extrabold uppercase">
          {nama} ({statusAktif ? "Aktif" : "Nonaktif"})
        </div>

        <div className="my-2 p-2.5 bg-white border-2 border-black rounded-xl shadow-neo-sm flex items-center justify-center gap-2">
          {lunasBulanIni ? (
            <CheckCircle2 className="w-5 h-5 text-neo-darkgreen stroke-[2.5] shrink-0" />
          ) : (
            <Clock className="w-5 h-5 text-neo-darkred stroke-[2.5] shrink-0" />
          )}
          <div className="text-left">
            <div
              className={cn(
                "text-xs font-extrabold tracking-tight",
                lunasBulanIni ? "text-neo-darkgreen" : "text-neo-darkred"
              )}
            >
              {lunasBulanIni
                ? `✓ STATUS: LUNAS ${namaBulanIni}`
                : `STATUS: BELUM BAYAR ${namaBulanIni}`}
            </div>
            <div className="text-[10px] font-bold text-black mt-0.5 tabular-nums">
              {lunasBulanIni && paymentBulanIni
                ? `${formatRupiah.format(paymentBulanIni.jumlah)} • ${formatTanggal(paymentBulanIni.tanggalBayar)}`
                : "Belum tercatat bulan ini"}
            </div>
          </div>
        </div>

        <p className="text-[10px] font-bold text-slate-800">
          {lunasBulanIni
            ? "Iuran Anda tercatat rapi di sistem kas organisasi."
            : "Segera hubungi bendahara untuk mencatat iuran bulan ini."}
        </p>
      </div>

      {/* ===== Matriks 12 bulan (mockup 648-668) — sub-komponen internal ===== */}
      <div className="p-3.5 bg-white border-[2.5px] border-black rounded-2xl shadow-neo text-black">
        <div className="flex justify-between items-center mb-2.5">
          <span className="text-xs font-extrabold uppercase">
            Matriks Iuran 12 Bulan
          </span>
          <span className="text-[10px] font-extrabold bg-neo-yellow px-1.5 py-0.5 border border-black rounded tabular-nums">
            {jumlahLunasTahunIni}/12 Lunas
          </span>
        </div>

        <div className="grid grid-cols-4 gap-1.5 text-center text-[10px] font-extrabold">
          {NAMA_BULAN_SINGKAT.map((singkat, i) => {
            const bulan = i + 1;
            const payment = paymentPerBulan.get(bulan);
            const lunas = payment !== undefined;
            const bulanBerjalanLunas = lunas && bulan === bulanIni;

            return (
              <div
                key={bulan}
                className={cn(
                  "p-1.5 border-1.5 border-black rounded-lg",
                  bulanBerjalanLunas
                    ? "bg-black text-neo-yellow shadow-neo-sm" // bulan berjalan+lunas: inverted
                    : lunas
                      ? "bg-neo-green shadow-neo-sm"
                      : "bg-neo-gray text-slate-600"
                )}
              >
                {singkat}
                <br />
                {lunas ? (
                  <span className="text-[9px] font-bold tabular-nums">
                    ✓ {Math.round(payment.jumlah / 1000)}k
                  </span>
                ) : (
                  <span className="text-[9px]">-</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
