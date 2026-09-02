"use client";

import { useEffect } from "react";
import NeoButton from "@/components/ui/NeoButton";

// Root error boundary (Next 14 App Router). Neo-Brutalism V2.2:
// kartu border hitam + shadow-neo, token neo.*, press-down via NeoButton.
// error.message TIDAK ditampilkan (bisa bocor info internal) — hanya digest.
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="min-h-screen bg-neo-bg flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm bg-neo-surface border-[3px] border-black rounded-2xl shadow-neo-lg p-6 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl border-[2.5px] border-black bg-neo-coral shadow-neo-sm text-2xl font-bold">
          !
        </div>
        <h1 className="text-2xl font-bold mb-2">Terjadi Kesalahan</h1>
        <p className="text-base mb-6">
          Maaf, aplikasi mengalami gangguan. Coba muat ulang halaman ini.
        </p>
        <NeoButton variant="yellow" size="lg" fullWidth onClick={reset}>
          Muat Ulang
        </NeoButton>
        {error.digest && (
          <p className="mt-4 font-mono text-xs text-slate-500 break-all">
            Kode: {error.digest}
          </p>
        )}
      </div>
    </main>
  );
}
