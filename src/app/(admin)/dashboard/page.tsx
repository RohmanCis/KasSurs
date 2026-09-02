"use client";

// =====================================================================
// KasSurs — Dashboard Admin (FR-12 V1.1 — Neo-Brutalism V2.2)
// - 2 fetch saat buka: GET /api/dashboard/summary (saldo + masuk/keluar
//   + jumlahBelumBayar admin) DAN GET /api/members?bulan=&tahun= (hitung
//   jumlahAnggota & jumlahLunas client-side untuk progress TreasuryHero).
// - Ringkas by design: TreasuryHero + kartu "Belum Bayar N" (link ke
//   /pembayaran) + shortcut. Roster lengkap TIDAK diduplikat di sini —
//   ada di /pembayaran (BottomNav 5 tab).
// - Header bar Yellow (resep 5.7) + LogoutButton.
// - Loading: skeleton border hitam + pulse (5.11). 401 → /login.
// =====================================================================

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ChevronRight, Receipt, FileSpreadsheet, Zap } from "lucide-react";
import TreasuryHero from "@/components/dashboard/TreasuryHero";
import BottomNav from "@/components/layout/BottomNav";
import LogoutButton from "@/components/ui/LogoutButton";
import NeoButton from "@/components/ui/NeoButton";
import type { DashboardSummaryResponse, MemberDTO } from "@/lib/types";

const NAMA_BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];
const NAMA_BULAN_SINGKAT = [
  "JAN", "FEB", "MAR", "APR", "MEI", "JUN",
  "JUL", "AGU", "SEP", "OKT", "NOV", "DES",
];

export default function DashboardPage() {
  const router = useRouter();
  const now = new Date();
  const bulan = now.getMonth() + 1;
  const tahun = now.getFullYear();

  const [summary, setSummary] = useState<DashboardSummaryResponse | null>(null);
  const [jumlahAnggota, setJumlahAnggota] = useState(0);
  const [jumlahLunas, setJumlahLunas] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const muatSemua = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [resSummary, resMembers] = await Promise.all([
        fetch("/api/dashboard/summary"),
        fetch(`/api/members?bulan=${bulan}&tahun=${tahun}`),
      ]);
      if (resSummary.status === 401 || resMembers.status === 401) {
        router.replace("/login");
        return;
      }
      if (!resSummary.ok || !resMembers.ok) {
        setLoadError("Gagal memuat ringkasan kas. Coba lagi.");
        return;
      }
      setSummary((await resSummary.json()) as DashboardSummaryResponse);
      const members = (await resMembers.json()) as MemberDTO[];
      const aktif = members.filter((m) => m.statusAktif);
      setJumlahAnggota(aktif.length);
      setJumlahLunas(aktif.filter((m) => m.statusBayarBulanIni === "LUNAS").length);
    } catch {
      setLoadError("Tidak bisa terhubung ke server. Periksa koneksi, lalu coba lagi.");
    } finally {
      setLoading(false);
    }
  }, [router, bulan, tahun]);

  useEffect(() => {
    muatSemua();
  }, [muatSemua]);

  return (
    <main className="mx-auto w-full max-w-[430px] pb-24 md:max-w-2xl">
      {/* Header bar — resep 5.7 (dashboard = Yellow) */}
      <header className="flex items-center justify-between border-b-[2.5px] border-black bg-neo-yellow px-4 py-2.5">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full border border-black bg-neo-green" />
            <h1 className="text-xs font-extrabold uppercase text-black">Bendahara Aktif</h1>
          </div>
          <p className="text-xs font-bold tracking-tight text-slate-800">
            Periode: {NAMA_BULAN[bulan - 1]} {tahun}
          </p>
        </div>
        <LogoutButton />
      </header>

      <div className="space-y-3 p-3.5">
        {loading && (
          <div className="space-y-3" aria-busy="true" aria-label="Memuat ringkasan kas">
            <div className="space-y-2.5 rounded-2xl border-[2.5px] border-black bg-white p-4 shadow-neo">
              <div className="h-4 w-32 animate-pulse rounded bg-neo-gray" />
              <div className="h-9 w-48 animate-pulse rounded bg-neo-gray" />
              <div className="h-3.5 w-full animate-pulse rounded-lg bg-neo-gray" />
            </div>
            <div className="h-16 animate-pulse rounded-xl border-[2.5px] border-black bg-neo-gray" />
          </div>
        )}

        {!loading && loadError && (
          <div className="rounded-xl border-[2.5px] border-black bg-neo-coral p-3.5 shadow-neo-sm">
            <p role="alert" className="text-xs font-extrabold text-neo-darkred">
              {loadError}
            </p>
            <NeoButton
              variant="white"
              size="md"
              fullWidth
              onClick={muatSemua}
              className="mt-3"
              data-testid="dashboard-retry"
            >
              Coba Lagi
            </NeoButton>
          </div>
        )}

        {!loading && !loadError && summary && (
          <>
            <TreasuryHero
              saldo={summary.saldo}
              totalMasukBulanIni={summary.totalMasukBulanIni}
              totalKeluarBulanIni={summary.totalKeluarBulanIni}
              jumlahLunas={jumlahLunas}
              jumlahAnggota={jumlahAnggota}
              labelBulan={NAMA_BULAN_SINGKAT[bulan - 1]}
              className="w-full"
            />

            {/* Admin-only — field optional di kontrak; render defensif */}
            {summary.jumlahBelumBayar !== undefined && (
              <Link
                href="/pembayaran"
                data-testid="card-belum-bayar"
                className="flex items-center justify-between gap-3 rounded-xl border-[2.5px] border-black bg-neo-coral px-3.5 py-3 shadow-neo transition-all duration-100 active:translate-x-[3.5px] active:translate-y-[3.5px] active:shadow-none"
              >
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-black">
                    Belum Bayar {NAMA_BULAN[bulan - 1]}
                  </p>
                  <p className="text-sm font-bold text-black">
                    <span className="text-xl font-extrabold tabular-nums text-neo-darkred">
                      {summary.jumlahBelumBayar}
                    </span>{" "}
                    anggota perlu ditagih
                  </p>
                </div>
                <span className="flex items-center gap-1 text-[10px] font-extrabold uppercase text-black">
                  Catat <ChevronRight className="h-4 w-4 stroke-[3]" aria-hidden="true" />
                </span>
              </Link>
            )}

            {/* Entry point cepat — roster lengkap di /pembayaran */}
            <div className="grid grid-cols-3 gap-2 pt-1">
              <Link href="/pembayaran" data-testid="link-catat-pembayaran" className="block">
                <NeoButton variant="green" size="sm" fullWidth className="h-full py-2.5 text-[11px] font-extrabold">
                  <span className="flex items-center justify-center gap-1">
                    <Zap className="h-4 w-4 stroke-[2.5]" aria-hidden="true" /> Speed-Tap
                  </span>
                </NeoButton>
              </Link>
              <Link href="/pengeluaran" data-testid="link-catat-pengeluaran" className="block">
                <NeoButton variant="coral" size="sm" fullWidth className="h-full py-2.5 text-[11px] font-extrabold">
                  <span className="flex items-center justify-center gap-1">
                    <Receipt className="h-4 w-4 stroke-[2.5]" aria-hidden="true" /> Keluar
                  </span>
                </NeoButton>
              </Link>
              <Link href="/laporan" data-testid="link-laporan" className="block">
                <NeoButton variant="sky" size="sm" fullWidth className="h-full py-2.5 text-[11px] font-extrabold">
                  <span className="flex items-center justify-center gap-1">
                    <FileSpreadsheet className="h-4 w-4 stroke-[2.5]" aria-hidden="true" /> Laporan
                  </span>
                </NeoButton>
              </Link>
            </div>
          </>
        )}
      </div>

      <BottomNav />
    </main>
  );
}
