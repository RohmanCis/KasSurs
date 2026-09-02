// =====================================================================
// KasSurs — Loading skeleton Status Anggota (RSC, FASE 3).
// Dipindah dari page client lama (block loading) — tanpa header (page
// render setelah data siap). Gaya sama: pulse + tinggi = blok riil
// (kupon ±200px, matriks ±180px — FASE 1).
// =====================================================================

export default function StatusLoading() {
  return (
    <main className="mx-auto w-full max-w-[430px] pb-8 md:max-w-2xl">
      <div className="space-y-3.5 p-3.5">
        <div className="space-y-3.5" aria-busy="true" aria-label="Memuat status pembayaran">
          <div className="h-[200px] animate-pulse rounded-2xl border-[3px] border-black bg-neo-gray" />
          <div className="h-[180px] animate-pulse rounded-2xl border-[2.5px] border-black bg-neo-gray" />
        </div>
      </div>
    </main>
  );
}
