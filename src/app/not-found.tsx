import Link from "next/link";

// Halaman 404 (server component). Di luar layout authenticated — tanpa BottomNav.
// Neo-Brutalism V2.2: kartu border hitam + shadow-neo, token neo.*.
export default function NotFound() {
  return (
    <main className="min-h-screen bg-neo-bg flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm bg-neo-surface border-[3px] border-black rounded-2xl shadow-neo-lg p-6 text-center">
        <p className="text-6xl font-bold mb-2 tracking-tight">404</p>
        <h1 className="text-lg font-bold mb-2">Halaman Tidak Ditemukan</h1>
        <p className="text-base mb-6">
          Halaman yang Anda cari tidak ada atau sudah dipindahkan.
        </p>
        <Link
          href="/"
          className="block w-full border-[2.5px] border-black rounded-xl font-bold text-base px-3.5 py-3.5 bg-neo-yellow text-black shadow-neo neo-press select-none [@media(hover:hover)]:hover:-translate-x-px [@media(hover:hover)]:hover:-translate-y-px"
        >
          Kembali ke Beranda
        </Link>
      </div>
    </main>
  );
}
