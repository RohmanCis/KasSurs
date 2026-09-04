"use client";

// =====================================================================
// KasSurs — Halaman Catat Pengeluaran (Admin) (FR-09/10 V1.1 — Neo V2.2)
// - Header bar Coral (resep 5.7). Form = ExpenseForm (chip pills +
//   voucher nominal besar). Daftar pengeluaran bulan berjalan di bawah.
// - Toast: sonner (bukan Toast.tsx lama). Sukses = PERSISTEN
//   (duration Infinity) dengan aksi eksplisit "Input Lagi" → remount
//   form via key + fokus kategori. Error 400 → aksi "Perbaiki"; error
//   jaringan → aksi "Coba Lagi" (kirim ulang body sama). Perilaku lama
//   dipertahankan — hanya mekanisme toast yang migrasi.
// - 401 dari API mana pun → redirect /login.
// =====================================================================

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { toast } from "sonner";
import ExpenseForm from "@/components/forms/ExpenseForm";
import BottomNav from "@/components/layout/BottomNav";
import LogoutButton from "@/components/ui/LogoutButton";
import NeoButton from "@/components/ui/NeoButton";
import type { CategoryDTO, ExpenseDTO } from "@/lib/types";
import { NAMA_BULAN, formatRupiah, formatTanggal } from "@/lib/format";

// Gaya tombol aksi toast sonner (Toaster unstyled — styling per-toast).
const NEO_ACTION_STYLE: CSSProperties = {
  background: "#000000",
  color: "#FEF08A",
  border: "2px solid #000000",
  borderRadius: 8,
  fontWeight: 800,
  padding: "4px 10px",
  marginLeft: 8,
  flexShrink: 0,
};

export default function PengeluaranPage() {
  const router = useRouter();
  const now = new Date();
  const bulan = now.getMonth() + 1; // 1-12 — list selalu bulan berjalan
  const tahun = now.getFullYear();

  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [loadingKategori, setLoadingKategori] = useState(true);
  const [loadErrorKategori, setLoadErrorKategori] = useState<string | null>(null);

  const [expenses, setExpenses] = useState<ExpenseDTO[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [loadErrorList, setLoadErrorList] = useState<string | null>(null);

  // Naikkan untuk me-remount form (reset penuh) saat "Input Lagi".
  const [formEpoch, setFormEpoch] = useState(0);

  const keLogin = useCallback(() => {
    router.replace("/login");
  }, [router]);

  const muatKategori = useCallback(async () => {
    setLoadingKategori(true);
    setLoadErrorKategori(null);
    try {
      const res = await fetch("/api/categories");
      if (res.status === 401) {
        keLogin();
        return;
      }
      if (!res.ok) {
        setLoadErrorKategori("Gagal memuat kategori. Coba lagi.");
        return;
      }
      setCategories((await res.json()) as CategoryDTO[]);
    } catch {
      setLoadErrorKategori("Tidak bisa terhubung ke server. Periksa koneksi, lalu coba lagi.");
    } finally {
      setLoadingKategori(false);
    }
  }, [keLogin]);

  const muatPengeluaran = useCallback(async () => {
    setLoadingList(true);
    setLoadErrorList(null);
    try {
      const res = await fetch(`/api/expenses?bulan=${bulan}&tahun=${tahun}`);
      if (res.status === 401) {
        keLogin();
        return;
      }
      if (!res.ok) {
        setLoadErrorList("Gagal memuat daftar pengeluaran.");
        return;
      }
      setExpenses((await res.json()) as ExpenseDTO[]);
    } catch {
      setLoadErrorList("Tidak bisa terhubung ke server.");
    } finally {
      setLoadingList(false);
    }
  }, [bulan, tahun, keLogin]);

  useEffect(() => {
    muatKategori();
    muatPengeluaran();
  }, [muatKategori, muatPengeluaran]);

  // "Input Lagi": remount form (reset), fokus ke chip kategori.
  function handleInputLagi() {
    setFormEpoch((e) => e + 1);
    requestAnimationFrame(() => {
      document.getElementById("kategori")?.focus();
    });
  }

  // Sukses → toast sonner 6 detik + refresh list bulan berjalan.
  function handleSaved(dto: ExpenseDTO) {
    toast.success(`"${dto.deskripsi}" (${formatRupiah(dto.jumlah)}) tersimpan.`, {
      duration: 6000,
      action: { label: "Input Lagi", onClick: handleInputLagi },
      actionButtonStyle: NEO_ACTION_STYLE,
    });
    muatPengeluaran();
  }

  function handleError(pesan: string, retry: (() => void) | null) {
    // FASE 2: tutup toast persist lama (sukses/error sebelumnya) dulu —
    // error baru tidak menumpuk di atas toast lama.
    toast.dismiss();
    toast.error(pesan, {
      duration: Infinity,
      action: retry
        ? { label: "Coba Lagi", onClick: retry }
        : {
            label: "Perbaiki",
            onClick: () => {
              requestAnimationFrame(() => {
                document.getElementById("kategori")?.focus();
              });
            },
          },
      actionButtonStyle: NEO_ACTION_STYLE,
    });
  }

  function handleCategoryAdded(dto: CategoryDTO) {
    setCategories((cur) => [...cur, dto]);
  }

  const totalBulanIni = expenses.reduce((sum, e) => sum + e.jumlah, 0);

  return (
    <main className="mx-auto w-full max-w-[430px] pb-24 md:max-w-2xl">
      {/* Header bar — resep 5.7 (pengeluaran = Coral) */}
      <header className="flex items-center justify-between border-b-[2.5px] border-black bg-neo-coral px-4 py-2.5">
        <div>
          <h1 className="text-xs font-extrabold uppercase text-black">Voucher Kas Keluar</h1>
          <p className="text-xs font-bold tracking-tight text-slate-800">
            {NAMA_BULAN[bulan - 1]} {tahun}
          </p>
        </div>
        <LogoutButton />
      </header>

      <div className="space-y-3.5 p-3.5">
        {loadingKategori && (
          <div className="space-y-3" aria-busy="true" aria-label="Memuat form">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-20 animate-pulse rounded-2xl border-[2.5px] border-black bg-neo-gray"
              />
            ))}
          </div>
        )}

        {!loadingKategori && loadErrorKategori && (
          <div className="rounded-xl border-[2.5px] border-black bg-neo-coral p-3.5 shadow-neo-sm">
            <p role="alert" className="text-xs font-extrabold text-neo-darkred">
              {loadErrorKategori}
            </p>
            <NeoButton variant="white" size="md" fullWidth onClick={muatKategori} className="mt-3" data-testid="expense-retry">
              Coba Lagi
            </NeoButton>
          </div>
        )}

        {!loadingKategori && !loadErrorKategori && (
          <ExpenseForm
            key={formEpoch}
            categories={categories}
            onSaved={handleSaved}
            onUnauthorized={keLogin}
            onError={handleError}
            onCategoryAdded={handleCategoryAdded}
          />
        )}

        {/* Riwayat pengeluaran bulan berjalan — mockup baris 590-603 */}
        <section aria-label={`Pengeluaran ${NAMA_BULAN[bulan - 1]} ${tahun}`}>
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <h2 className="text-[10px] font-extrabold uppercase tracking-wider text-black">
              Riwayat Pengeluaran Bulan Ini
            </h2>
            {!loadingList && !loadErrorList && expenses.length > 0 && (
              <p className="text-[10px] font-bold text-slate-700">
                Total{" "}
                <span className="font-extrabold tabular-nums text-black">
                  {formatRupiah(totalBulanIni)}
                </span>
              </p>
            )}
          </div>

          {loadingList && (
            <div className="space-y-2" aria-busy="true" aria-label="Memuat daftar pengeluaran">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="h-14 animate-pulse rounded-xl border-2 border-black bg-neo-gray"
                />
              ))}
            </div>
          )}

          {!loadingList && loadErrorList && (
            <div className="rounded-xl border-2 border-black bg-neo-coral p-3">
              <p role="alert" className="text-xs font-extrabold text-neo-darkred">
                {loadErrorList}
              </p>
              <button
                type="button"
                onClick={muatPengeluaran}
                className="mt-1 text-xs font-extrabold text-black underline underline-offset-2"
              >
                Coba lagi
              </button>
            </div>
          )}

          {!loadingList && !loadErrorList && expenses.length === 0 && (
            <p className="rounded-xl border-2 border-black bg-white p-6 text-center text-xs font-bold text-slate-600 shadow-neo-sm">
              Belum ada pengeluaran tercatat bulan ini.
            </p>
          )}

          {!loadingList && !loadErrorList && expenses.length > 0 && (
            <ul className="space-y-2" data-testid="expense-list">
              {expenses.map((e) => (
                <li
                  key={e.id}
                  className="flex items-start justify-between rounded-xl border-2 border-black bg-white p-2.5 text-xs text-black shadow-neo-sm"
                >
                  <div className="min-w-0">
                    <span className="rounded border border-black bg-neo-purple px-1.5 py-0.5 text-[9px] font-extrabold">
                      {e.categoryNama}
                    </span>
                    <div className="mt-1 truncate text-[11px] font-bold">{e.deskripsi}</div>
                    <div className="text-[9px] font-bold text-slate-500 tabular-nums">
                      {formatTanggal(e.tanggal)} • Dicatat Admin
                    </div>
                  </div>
                  <span className="shrink-0 text-xs font-extrabold tabular-nums text-neo-darkred">
                    - {formatRupiah(e.jumlah)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <BottomNav />
    </main>
  );
}
