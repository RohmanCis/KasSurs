// =====================================================================
// KasSurs — Dashboard Admin (FR-12 V1.1 — Neo-Brutalism V2.2)
// Server Component (FASE 3, 2026-09-03) — tidak ada fetch client:
// summary dihitung server-side via getDashboardSummary(session) (data
// sdh tersedia di RSC, tidak perlu endpoint lagi utk render pertama).
// - Auth: session cookie di-verify di server; tanpa sesi → /login;
//   role ANGGOTA → /status (mirror pola root page).
// - Ringkas by design: TreasuryHero + kartu "Belum Bayar N" (link ke
//   /pembayaran) + shortcut. Roster lengkap TIDAK diduplikat di sini —
//   ada di /pembayaran (BottomNav 5 tab).
// - Header bar Yellow (resep 5.7) + LogoutButton.
// - Periode display = WIB (wibDateParts — server Vercel TZ=UTC, tanpa ini
//   tgl 1 WIB 00:00-06:59 tampil bulan lalu).
// =====================================================================

import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ChevronRight, Receipt, FileSpreadsheet, Zap } from "lucide-react";
import TreasuryHero from "@/components/dashboard/TreasuryHero";
import BottomNav from "@/components/layout/BottomNav";
import LogoutButton from "@/components/ui/LogoutButton";
import NeoButton from "@/components/ui/NeoButton";
import { getDashboardSummary } from "@/lib/dashboard";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth";
import { wibDateParts, NAMA_BULAN, NAMA_BULAN_SINGKAT } from "@/lib/format";

export default async function DashboardPage() {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySession(token) : null;
  if (!session) redirect("/login");
  if (session.role !== "ADMIN") redirect("/status");

  const { tahun, bulan } = wibDateParts();
  const summary = await getDashboardSummary(session);

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
        <TreasuryHero
          saldo={summary.saldo}
          totalMasukBulanIni={summary.totalMasukBulanIni}
          totalKeluarBulanIni={summary.totalKeluarBulanIni}
          jumlahLunas={summary.jumlahLunas}
          jumlahAnggota={summary.jumlahAnggotaAktif}
          labelBulan={NAMA_BULAN_SINGKAT[bulan - 1]}
          className="w-full"
        />

        {/* Admin-only — field optional di kontrak; render defensif */}
        {summary.jumlahBelumBayar !== undefined && (
          <Link
            href="/pembayaran"
            data-testid="card-belum-bayar"
            className="flex items-center justify-between gap-3 rounded-xl border-[2.5px] border-black bg-neo-coral px-3.5 py-3 shadow-neo transition-[transform,box-shadow,background-color,color] duration-100 active:translate-x-[3.5px] active:translate-y-[3.5px] active:shadow-none"
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
      </div>

      <BottomNav />
    </main>
  );
}
