"use client";

// =====================================================================
// KasSurs — T-30: FilterBar (FR-13: bulan, tahun, kategori, status —
// bisa dikombinasikan). Murni presentational, controlled penuh.
//
// - Bulan + Tahun selalu tampil (grid 2 kolom di mobile).
// - Kategori: hanya render kalau `categories` DAN `onKategoriChange`
//   diberikan. "Semua kategori" (value "") representable di kontrak
//   (onKategoriChange menerima string) → clearing didukung.
// - Status: hanya render kalau `onStatusChange` diberikan. Kontrak
//   onStatusChange hanya menerima "LUNAS" | "BELUM" (tidak ada nilai
//   "semua") → placeholder disabled "Semua status" dipakai saat status
//   belum di-set (pola placeholder ExpenseForm T-26); clear filter
//   ditangani parent (mis. reset state).
// - Native <select> semua (preseden T-26: item sedikit, native cukup).
// - Label eksplisit + id unik per select (useId — aman jika dipakai
//   lebih dari sekali per halaman).
// =====================================================================

import { useId } from "react";
import type { CategoryDTO } from "@/lib/types";

// Dipindah dari StatusBadge.tsx (dihapus saat cleanup V1.0 — FASE-3 Langkah 4):
// kontrak status filter, kini hidup di sini satu-satunya konsumennya.
export type StatusBadgeStatus = "LUNAS" | "BELUM";

const NAMA_BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

interface FilterBarProps {
  bulan: number; // 1-12
  tahun: number;
  onChange: (f: { bulan: number; tahun: number }) => void;
  categories?: CategoryDTO[];
  kategoriId?: string;
  onKategoriChange?: (id: string) => void;
  status?: StatusBadgeStatus;
  onStatusChange?: (s: StatusBadgeStatus) => void;
  testIdPrefix?: string; // aditif — hook E2E deterministik (FASE-3)
}

export default function FilterBar({
  bulan,
  tahun,
  onChange,
  categories,
  kategoriId,
  onKategoriChange,
  status,
  onStatusChange,
  testIdPrefix,
}: FilterBarProps) {
  const uid = useId();
  const tahunIni = new Date().getFullYear();
  // Range dinamis: tahun lalu .. tahun depan (rapel tahun sebelumnya
  // masih terjangkau; pembayaran masa depan di luar kebutuhan V1).
  const tahunOptions = [tahunIni - 1, tahunIni, tahunIni + 1];

  // Neo-Brutalism V2.2 (resep 5.6 input)
  const selectClass =
    "w-full rounded-xl border-2 border-black bg-white px-3 py-2.5 text-xs font-bold " +
    "text-black shadow-neo-sm focus:outline-none focus:ring-2 focus:ring-neo-yellow";
  const labelClass = "text-[10px] font-extrabold uppercase tracking-wider text-black";

  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="flex flex-col gap-1">
        <label htmlFor={`${uid}-bulan`} className={labelClass}>
          Bulan
        </label>
        <select
          id={`${uid}-bulan`}
          value={bulan}
          onChange={(e) => onChange({ bulan: Number(e.target.value), tahun })}
          data-testid={testIdPrefix ? `${testIdPrefix}-bulan` : undefined}
          className={`${selectClass} bg-neo-yellow`}
        >
          {NAMA_BULAN.map((nama, i) => (
            <option key={i + 1} value={i + 1}>
              {nama}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={`${uid}-tahun`} className={labelClass}>
          Tahun
        </label>
        <select
          id={`${uid}-tahun`}
          value={tahun}
          onChange={(e) => onChange({ bulan, tahun: Number(e.target.value) })}
          data-testid={testIdPrefix ? `${testIdPrefix}-tahun` : undefined}
          className={selectClass}
        >
          {tahunOptions.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {categories && onKategoriChange && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${uid}-kategori`} className={labelClass}>
            Kategori
          </label>
          <select
            id={`${uid}-kategori`}
            value={kategoriId ?? ""}
            onChange={(e) => onKategoriChange(e.target.value)}
            className={selectClass}
          >
            <option value="">Semua kategori</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nama}
              </option>
            ))}
          </select>
        </div>
      )}

      {onStatusChange && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${uid}-status`} className={labelClass}>
            Status
          </label>
          <select
            id={`${uid}-status`}
            value={status ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              if (v) onStatusChange(v as StatusBadgeStatus);
            }}
            className={selectClass}
          >
            <option value="" disabled>
              Semua status
            </option>
            <option value="LUNAS">Lunas</option>
            <option value="BELUM">Belum Bayar</option>
          </select>
        </div>
      )}
    </div>
  );
}
