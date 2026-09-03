"use client";

// =====================================================================
// KasSurs — Form Catat Pengeluaran (FR-09/10 V1.1 — Neo-Brutalism V2.2)
// - Kategori: HORIZONTAL CHIP PILLS scroll (aktif inverted bg-black
//   text-white) — GANTI native <select> (amendemen FR-09). Chip "+ Baru"
//   membuka input inline kategori custom (POST /api/categories, FR-10).
// - Nominal besar voucher text-2xl font-extrabold tabular-nums; tanggal
//   default hari ini (date-only YYYY-MM-DD, kontrak T-20/T-24).
// - Reset form BUKAN otomatis: parent me-remount via prop `key` saat
//   "Input Lagi" di toast sonner (perilaku lama dipertahankan).
// - Error: validasi client inline (role="alert"); 400/jaringan → onError
//   ke parent (sonner toast, aksi "Perbaiki"/"Coba Lagi").
// - 401 UNAUTHORIZED → delegasi ke parent (redirect /login).
// Props signature TIDAK berubah + onCategoryAdded opsional (aditif).
// =====================================================================

import { useState, type FormEvent } from "react";
import { Calendar, Plus, Save } from "lucide-react";
import NeoButton from "@/components/ui/NeoButton";
import { cn } from "@/lib/utils";
import { formatRibuan, todayISO } from "@/lib/format";
import type {
  CategoryDTO,
  CreateExpenseRequest,
  ExpenseDTO,
} from "@/lib/types";

interface ExpenseFormProps {
  categories: CategoryDTO[];
  onSaved: (dto: ExpenseDTO) => void;
  onUnauthorized: () => void;
  // pesan untuk toast error; retry non-null hanya untuk error jaringan
  // (toast "Coba Lagi" mengirim ulang body yang sama).
  onError: (pesan: string, retry: (() => void) | null) => void;
  // Aditif: kategori custom baru tersimpan → parent update list (FR-10).
  onCategoryAdded?: (dto: CategoryDTO) => void;
}

const labelClass = "mb-1 block text-[10px] font-extrabold uppercase tracking-wider text-black";
const inputNeo =
  "w-full rounded-xl border-2 border-black bg-white p-2.5 text-xs font-bold text-black shadow-neo-sm " +
  "placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-neo-yellow disabled:bg-neo-gray";

// Dot warna kategori (2-col grid) — sinkron token neo (tailwind.config.ts).
// Kategori custom fallback neo-gray #F3F4F6.
const KATEGORI_DOT: Record<string, string> = {
  Konsumsi: "#86EFAC",
  Acara: "#FCA5A5",
  ATK: "#BAE6FD",
  Sumbangan: "#FED7AA",
  "Lain-lain": "#DDD6FE",
};

export default function ExpenseForm({
  categories,
  onSaved,
  onUnauthorized,
  onError,
  onCategoryAdded,
}: ExpenseFormProps) {
  const [categoryId, setCategoryId] = useState("");
  const [deskripsi, setDeskripsi] = useState("");
  const [jumlah, setJumlah] = useState(""); // digit mentah
  const [tanggal, setTanggal] = useState(todayISO());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Kategori custom inline (FR-10)
  const [tambahKategori, setTambahKategori] = useState(false);
  const [namaKategoriBaru, setNamaKategoriBaru] = useState("");
  const [kategoriLoading, setKategoriLoading] = useState(false);

  async function kirim(body: CreateExpenseRequest) {
    setLoading(true);
    try {
      const res = await fetch("/api/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.status === 401) {
        onUnauthorized();
        return;
      }

      if (res.ok) {
        onSaved((await res.json()) as ExpenseDTO);
        return;
      }

      const data = (await res.json()) as { error?: string; message?: string };
      if (res.status === 404 || data.error === "CATEGORY_NOT_FOUND") {
        onError("Kategori tidak ditemukan. Muat ulang halaman ini.", null);
      } else {
        onError(data.message || "Periksa kembali isian form.", null);
      }
    } catch {
      onError(
        "Tidak bisa terhubung ke server. Periksa koneksi, lalu coba lagi.",
        () => kirim(body),
      );
    } finally {
      setLoading(false);
    }
  }

  async function tambahKategoriBaru() {
    const nama = namaKategoriBaru.trim();
    if (!nama) return;
    setKategoriLoading(true);
    try {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nama }),
      });
      if (res.status === 401) {
        onUnauthorized();
        return;
      }
      if (!res.ok) {
        const data = (await res.json()) as { message?: string };
        onError(data.message || "Gagal menambah kategori.", null);
        return;
      }
      const dto = (await res.json()) as CategoryDTO;
      onCategoryAdded?.(dto);
      setCategoryId(dto.id); // langsung terpilih
      setNamaKategoriBaru("");
      setTambahKategori(false);
    } catch {
      onError("Tidak bisa terhubung ke server.", null);
    } finally {
      setKategoriLoading(false);
    }
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!categoryId) {
      return setError("Kategori wajib dipilih.");
    }
    if (!deskripsi.trim()) {
      return setError("Deskripsi wajib diisi.");
    }
    const nominal = parseInt(jumlah, 10);
    if (!jumlah || Number.isNaN(nominal) || nominal <= 0) {
      return setError("Jumlah harus lebih dari 0.");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) {
      return setError("Tanggal wajib diisi.");
    }

    kirim({
      categoryId,
      deskripsi: deskripsi.trim(),
      jumlah: nominal,
      tanggal, // date-only YYYY-MM-DD (kontrak T-24)
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3.5" noValidate>
      {/* Kategori — horizontal chip pills (FR-09 V1.1, mockup 549-558) */}
      <div id="kategori" tabIndex={-1} className="focus:outline-none">
        <span className={labelClass}>Pilih Kategori Pengeluaran</span>
        <div
          role="radiogroup"
          aria-label="Kategori pengeluaran"
          className="grid grid-cols-2 gap-[5px]"
        >
          {categories.map((c) => {
            const aktif = categoryId === c.id;
            const dotColor = KATEGORI_DOT[c.nama] ?? "#F3F4F6";
            return (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={aktif}
                onClick={() => setCategoryId(c.id)}
                disabled={loading}
                data-testid={`chip-kategori-${c.id}`}
                className={cn(
                  "flex items-center gap-1.5 rounded-[10px] border-2 border-black px-2.5 py-1.5 text-[11px] font-bold min-h-[36px] neo-press select-none transition-none",
                  aktif
                    ? "bg-black text-white shadow-none translate-x-[2.5px] translate-y-[2.5px]"
                    : "bg-white text-black shadow-[2.5px_2.5px_0_#000]"
                )}
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full border-[1.5px]"
                  style={{
                    background: aktif ? "#FEF08A" : dotColor,
                    borderColor: aktif ? "#FEF08A" : dotColor,
                  }}
                  aria-hidden="true"
                />
                {c.nama}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setTambahKategori((v) => !v)}
            disabled={loading}
            data-testid="chip-kategori-baru"
            className="col-span-2 flex min-h-[36px] items-center justify-center gap-1.5 rounded-[10px] border-2 border-dashed border-black bg-neo-yellow px-2.5 py-1.5 text-[11px] font-bold text-black shadow-[2.5px_2.5px_0_#000] neo-press select-none"
          >
            <Plus className="h-3 w-3 stroke-[3]" aria-hidden="true" />
            Tambah Kategori Baru
          </button>
        </div>

        {tambahKategori && (
          <div className="mt-2 flex gap-1.5">
            <input
              type="text"
              value={namaKategoriBaru}
              onChange={(e) => setNamaKategoriBaru(e.target.value)}
              placeholder="Nama kategori baru"
              aria-label="Nama kategori baru"
              disabled={kategoriLoading}
              data-testid="input-kategori-baru"
              className={inputNeo}
            />
            <NeoButton
              variant="yellow"
              size="sm"
              onClick={tambahKategoriBaru}
              disabled={kategoriLoading || !namaKategoriBaru.trim()}
              data-testid="simpan-kategori-baru"
              className="shrink-0"
            >
              {kategoriLoading ? "..." : "Tambah"}
            </NeoButton>
          </div>
        )}
      </div>

      {/* Voucher card — mockup baris 561-583 */}
      <div className="space-y-3 rounded-2xl border-[2.5px] border-black bg-white p-3.5 text-black shadow-neo">
        <div>
          <span className="rounded border border-black bg-neo-yellow px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider">
            Nominal Kas Keluar
          </span>
          <div className="mt-1 flex items-center gap-1.5 rounded-xl border-2 border-black bg-neo-coral/20 p-2">
            <span className="text-xl font-extrabold">Rp</span>
            <input
              id="jumlah"
              name="jumlah"
              type="text"
              inputMode="numeric"
              required
              value={formatRibuan(jumlah)}
              onChange={(e) => setJumlah(e.target.value.replace(/\D/g, "").slice(0, 9))}
              placeholder="0"
              disabled={loading}
              data-testid="expense-jumlah"
              className="w-full bg-transparent text-2xl font-extrabold tabular-nums text-black outline-none"
            />
          </div>
        </div>

        <div>
          <label htmlFor="deskripsi" className={labelClass}>
            Deskripsi / Keperluan
          </label>
          <input
            id="deskripsi"
            name="deskripsi"
            type="text"
            required
            value={deskripsi}
            onChange={(e) => setDeskripsi(e.target.value)}
            placeholder="Contoh: Snack rapat bulanan"
            disabled={loading}
            data-testid="expense-deskripsi"
            className={inputNeo}
          />
        </div>

        <div>
          <label htmlFor="tanggal" className={labelClass}>
            Tanggal Bayar
          </label>
          <div className="flex items-center gap-1.5">
            <Calendar className="h-3.5 w-3.5 shrink-0 stroke-[2.5] text-slate-700" aria-hidden="true" />
            <input
              id="tanggal"
              name="tanggal"
              type="date"
              required
              value={tanggal}
              max={todayISO()}
              onChange={(e) => setTanggal(e.target.value)}
              disabled={loading}
              data-testid="expense-tanggal"
              className={`${inputNeo} tabular-nums`}
            />
          </div>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          aria-live="assertive"
          data-testid="expense-error"
          className="rounded-xl border-2 border-black bg-neo-coral px-3 py-2 text-xs font-extrabold text-neo-darkred"
        >
          {error}
        </p>
      )}

      <NeoButton
        type="submit"
        variant="green"
        size="lg"
        fullWidth
        disabled={loading}
        data-testid="expense-submit"
        className="uppercase tracking-wide"
      >
        <span className="flex items-center justify-center gap-2">
          <Save className="h-4 w-4 stroke-[2.5]" aria-hidden="true" />
          {loading ? "Menyimpan..." : "Simpan Pengeluaran"}
        </span>
      </NeoButton>
    </form>
  );
}
