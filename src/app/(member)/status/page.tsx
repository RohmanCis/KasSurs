"use client";

// =====================================================================
// KasSurs — Halaman Status Anggota (View-Only) (FR-14 V1.1 — Neo V2.2)
// - PassbookCard (kupon status bulan berjalan + matriks iuran 12 bulan)
//   — data matriks: GET /api/payments TANPA query (ANGGOTA auto-clamp
//   memberId ke sesi sendiri di server → seluruh histori PRIBADI saja),
//   filter client-side tahun berjalan.
// - Kartu transparansi saldo umum: GET /api/dashboard/summary (response
//   ANGGOTA: tanpa jumlahBelumBayar) — mockup baris 670-680.
// - Header Sky (resep 5.7, mockup baris 615-623) + tombol Keluar.
// TIDAK ada aksi edit/hapus — murni view (scope RBAC tidak berubah).
// =====================================================================

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import PassbookCard from "@/components/member/PassbookCard";
import NeoButton from "@/components/ui/NeoButton";
import type { DashboardSummaryResponse, PaymentDTO } from "@/lib/types";

function formatRupiah(n: number): string {
  return `Rp ${n.toLocaleString("id-ID")}`;
}

export default function StatusPage() {
  const router = useRouter();
  const now = new Date();
  const bulanIni = now.getMonth() + 1;
  const tahunIni = now.getFullYear();

  const [summary, setSummary] = useState<DashboardSummaryResponse | null>(null);
  const [payments, setPayments] = useState<PaymentDTO[]>([]);
  const [nama, setNama] = useState("Anggota");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [logoutLoading, setLogoutLoading] = useState(false);

  const muatSemua = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [resSummary, resPayments] = await Promise.all([
        fetch("/api/dashboard/summary"),
        // TANPA query bulan/tahun → server clamp ke sesi → histori pribadi
        fetch("/api/payments"),
      ]);
      if (resSummary.status === 401 || resPayments.status === 401) {
        router.replace("/login");
        return;
      }
      if (!resSummary.ok || !resPayments.ok) {
        setLoadError("Gagal memuat data. Coba lagi.");
        return;
      }
      setSummary((await resSummary.json()) as DashboardSummaryResponse);
      const ps = (await resPayments.json()) as PaymentDTO[];
      setPayments(ps);
      // Nama dari field denormalized memberNama (PaymentDTO) — tidak ada
      // endpoint profil diri di V1.
      if (ps.length > 0) setNama(ps[0].memberNama);
    } catch {
      setLoadError("Tidak bisa terhubung ke server. Periksa koneksi, lalu coba lagi.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    muatSemua();
  }, [muatSemua]);

  async function handleLogout() {
    setLogoutLoading(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
    }
  }

  return (
    <main className="mx-auto w-full max-w-[430px] pb-8 md:max-w-2xl">
      {/* Header bar — resep 5.7 (passbook = Sky), mockup baris 615-623 */}
      <header className="flex items-center justify-between border-b-[2.5px] border-black bg-neo-sky px-4 py-2.5">
        <div>
          <span className="block text-[10px] font-extrabold uppercase text-black">
            Status Kas Anggota
          </span>
          <span className="text-xs font-extrabold text-black">{nama}</span>
        </div>
        <NeoButton
          variant="white"
          size="sm"
          onClick={handleLogout}
          disabled={logoutLoading}
          data-testid="status-logout"
          className="min-h-[44px] py-2"
        >
          <span className="flex items-center gap-1">
            <LogOut className="h-3.5 w-3.5 stroke-[2.5]" aria-hidden="true" />
            {logoutLoading ? "Keluar..." : "Keluar"}
          </span>
        </NeoButton>
      </header>

      <div className="space-y-3.5 p-3.5">
        {loading && (
          <div className="space-y-3.5" aria-busy="true" aria-label="Memuat status pembayaran">
            <div className="h-40 animate-pulse rounded-2xl border-[3px] border-black bg-neo-gray" />
            <div className="h-32 animate-pulse rounded-2xl border-[2.5px] border-black bg-neo-gray" />
          </div>
        )}

        {!loading && loadError && (
          <div className="rounded-xl border-[2.5px] border-black bg-neo-coral p-3.5 shadow-neo-sm">
            <p role="alert" className="text-xs font-extrabold text-neo-darkred">
              {loadError}
            </p>
            <NeoButton variant="white" size="md" fullWidth onClick={muatSemua} className="mt-3" data-testid="status-retry">
              Coba Lagi
            </NeoButton>
          </div>
        )}

        {!loading && !loadError && summary && (
          <>
            <PassbookCard
              nama={nama}
              statusAktif
              tahun={tahunIni}
              bulanIni={bulanIni}
              payments={payments}
              data-testid="passbook-card"
            />

            {/* Transparansi saldo umum (FR-14) — mockup baris 670-680 */}
            <div
              data-testid="saldo-umum-card"
              className="space-y-1.5 rounded-2xl border-[2.5px] border-black bg-neo-yellow p-3 text-xs font-bold text-black shadow-neo-sm"
            >
              <span className="block text-[10px] font-extrabold uppercase tracking-wider">
                Transparansi Saldo Komunitas
              </span>
              <div className="flex items-center justify-between border-b border-black py-1">
                <span>Total Kas Bersama:</span>
                <span className="text-sm font-extrabold tabular-nums">
                  {formatRupiah(summary.saldo)}
                </span>
              </div>
              <div className="flex justify-between text-[10px] text-slate-800">
                <span>Masuk bulan ini:</span>
                <span className="font-extrabold tabular-nums text-neo-darkgreen">
                  + {formatRupiah(summary.totalMasukBulanIni)}
                </span>
              </div>
              <div className="flex justify-between text-[10px] text-slate-800">
                <span>Keluar bulan ini:</span>
                <span className="font-extrabold tabular-nums text-neo-darkred">
                  - {formatRupiah(summary.totalKeluarBulanIni)}
                </span>
              </div>
            </div>

            <p className="text-center text-[10px] font-bold text-slate-600">
              Kalau status belum berubah setelah kamu membayar, hubungi bendahara.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
