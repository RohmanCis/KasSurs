import { TrendingUp, TrendingDown, Users } from "lucide-react";
import { cn } from "@/lib/utils";

// TreasuryHero — kartu saldo hero dashboard bendahara.
// Acuan DOM: mockup kassurs_ui_neobrutalism_final.html baris 433-476.
// Murni presentational (server component OK — tanpa event handler).
export interface TreasuryHeroProps {
  saldo: number;
  totalMasukBulanIni: number;
  totalKeluarBulanIni: number;
  // Progress iuran terkumpul — mockup hero menampilkan progress bar chunky (5.5)
  jumlahLunas: number;
  jumlahAnggota: number;
  labelBulan: string; // mis. "SEP" — parent yang format (NAMA_BULAN_SINGKAT)
  className?: string;
}

const formatRupiah = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

export default function TreasuryHero({
  saldo,
  totalMasukBulanIni,
  totalKeluarBulanIni,
  jumlahLunas,
  jumlahAnggota,
  labelBulan,
  className,
}: TreasuryHeroProps) {
  const persen =
    jumlahAnggota > 0 ? Math.round((jumlahLunas / jumlahAnggota) * 100) : 0;

  return (
    <div
      className={cn(
        "p-4 bg-white border-[2.5px] border-black rounded-2xl shadow-neo space-y-2.5",
        className
      )}
    >
      <div className="flex justify-between items-center">
        <span className="text-[10px] font-extrabold uppercase tracking-wider bg-neo-purple px-2 py-0.5 border border-black rounded shadow-neo-sm">
          TOTAL SALDO KAS AKTIF
        </span>
        <span className="text-[11px] font-bold flex items-center gap-1 text-slate-700">
          <Users className="w-3.5 h-3.5 stroke-[2]" /> {jumlahAnggota} Anggota
        </span>
      </div>

      <div className="text-3xl font-extrabold tracking-tight text-black tabular-nums">
        {formatRupiah.format(saldo)}
      </div>

      {/* Chunky Progress Meter — resep 5.5 */}
      <div>
        <div className="flex justify-between text-[11px] font-bold mb-1">
          <span>Iuran Terkumpul:</span>
          <span className="text-black font-extrabold tabular-nums">
            {jumlahLunas} / {jumlahAnggota} Orang ({persen}%)
          </span>
        </div>
        <div className="w-full h-3.5 bg-neo-gray border-2 border-black rounded-lg overflow-hidden p-0.5">
          <div
            className={cn(
              "h-full bg-neo-green transition-all duration-300 rounded",
              // Border kanan hanya saat terisi — di 0% jadi garis hitam yatim
              persen > 0 && "border-r-2 border-black"
            )}
            style={{ width: `${persen}%` }}
          />
        </div>
      </div>

      {/* In / Out Breakdown */}
      <div className="grid grid-cols-2 gap-2 pt-2 border-t-2 border-black text-[11px] font-bold">
        <div className="p-2 bg-neo-green/30 border-1.5 border-black rounded-xl flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-neo-darkgreen stroke-[2.5] shrink-0" />
          <div>
            <span className="text-[9px] text-slate-700 block uppercase">
              MASUK ({labelBulan})
            </span>
            <span className="text-xs font-extrabold tabular-nums text-neo-darkgreen">
              + {formatRupiah.format(totalMasukBulanIni)}
            </span>
          </div>
        </div>
        <div className="p-2 bg-neo-coral/30 border-1.5 border-black rounded-xl flex items-center gap-2">
          <TrendingDown className="w-4 h-4 text-neo-darkred stroke-[2.5] shrink-0" />
          <div>
            <span className="text-[9px] text-slate-700 block uppercase">
              KELUAR ({labelBulan})
            </span>
            <span className="text-xs font-extrabold tabular-nums text-neo-darkred">
              - {formatRupiah.format(totalKeluarBulanIni)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
