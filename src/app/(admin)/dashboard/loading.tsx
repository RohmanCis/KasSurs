// =====================================================================
// KasSurs — Loading skeleton Dashboard (RSC, FASE 3).
// Dipindah dari page client lama (block loading) — tanpa header/BottomNav
// (page render setelah data siap). Padding bawah pb-24 match page.
// Gaya sama: border hitam + pulse (5.11); hero 4 baris ≈ tinggi
// TreasuryHero riil ±230px (FASE 1) + kartu Belum Bayar h-16.
// =====================================================================

export default function DashboardLoading() {
  return (
    <main className="mx-auto w-full max-w-[430px] pb-24 md:max-w-2xl">
      <div className="space-y-3 p-3.5">
        <div className="space-y-3" aria-busy="true" aria-label="Memuat ringkasan kas">
          {/* Skeleton hero ≈ tinggi TreasuryHero riil (struktur 4 baris = hero). */}
          <div className="space-y-2.5 rounded-2xl border-[2.5px] border-black bg-white p-4 shadow-neo">
            <div className="flex items-center justify-between">
              <div className="h-[18px] w-32 animate-pulse rounded bg-neo-gray" />
              <div className="h-3.5 w-16 animate-pulse rounded bg-neo-gray" />
            </div>
            <div className="h-10 w-48 animate-pulse rounded bg-neo-gray" />
            <div className="space-y-2">
              <div className="h-3 w-full animate-pulse rounded bg-neo-gray" />
              <div className="h-4 w-full animate-pulse rounded bg-neo-gray" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="h-[52px] animate-pulse rounded-xl bg-neo-gray" />
              <div className="h-[52px] animate-pulse rounded-xl bg-neo-gray" />
            </div>
          </div>
          <div className="h-16 animate-pulse rounded-xl border-[2.5px] border-black bg-neo-gray" />
        </div>
      </div>
    </main>
  );
}
