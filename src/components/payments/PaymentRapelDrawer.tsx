"use client";

// =====================================================================
// KasSurs — Drawer Rapel/Kustom (FR-06 mode b, Tech-Spec Bagian 4.3)
// Bottom drawer vaul: form nominal/bulan/tahun/tanggal untuk pembayaran
// non-default. Dibuka via long-press 450ms kartu Belum Bayar (di-gate
// MemberCard). Parent me-remount via key → state form selalu fresh.
// Submit didelegasikan ke parent (POST /api/payments + handling 409
// cross-month ada di page — drawer murni form).
// =====================================================================

import { useState, type FormEvent } from "react";
import { Drawer } from "vaul";
import NeoButton from "@/components/ui/NeoButton";
import { NAMA_BULAN, formatRibuan } from "@/lib/format";
import type { MemberDTO } from "@/lib/types";

export interface RapelInput {
  jumlah: number;
  bulan: number; // 1-12
  tahun: number;
  tanggalBayar: string; // YYYY-MM-DD
}

interface PaymentRapelDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  member: MemberDTO; // wajib non-null saat open (parent gate)
  defaultBulan: number;
  defaultTahun: number;
  defaultTanggal: string; // hari ini YYYY-MM-DD
  submitting: boolean;
  onSubmit: (input: RapelInput) => void;
}

const labelClass = "mb-1 block text-[10px] font-extrabold uppercase tracking-wider text-black";
const inputClass =
  "w-full rounded-xl border-2 border-black bg-white px-3 py-2.5 text-sm font-bold text-black shadow-neo-sm focus:outline-none focus:ring-2 focus:ring-neo-yellow disabled:bg-neo-gray";

export default function PaymentRapelDrawer({
  open,
  onOpenChange,
  member,
  defaultBulan,
  defaultTahun,
  defaultTanggal,
  submitting,
  onSubmit,
}: PaymentRapelDrawerProps) {
  const [jumlahDigit, setJumlahDigit] = useState("30000");
  const [bulan, setBulan] = useState(defaultBulan);
  const [tahun, setTahun] = useState(defaultTahun);
  const [tanggal, setTanggal] = useState(defaultTanggal);
  const [error, setError] = useState<string | null>(null);

  const tahunIni = new Date().getFullYear();
  const tahunOptions = [tahunIni - 1, tahunIni, tahunIni + 1];

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const nominal = parseInt(jumlahDigit, 10);
    if (!jumlahDigit || Number.isNaN(nominal) || nominal <= 0) {
      return setError("Nominal harus lebih dari 0.");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) {
      return setError("Tanggal wajib diisi.");
    }
    onSubmit({ jumlah: nominal, bulan, tahun, tanggalBayar: tanggal });
  }

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Drawer.Content
          data-testid="rapel-drawer"
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[85dvh] w-full max-w-[430px] overflow-y-auto rounded-t-2xl border-x-[3px] border-t-[3px] border-black bg-white p-4 pb-8"
        >
          <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-black" aria-hidden="true" />
          <Drawer.Title className="text-sm font-extrabold uppercase tracking-tight text-black">
            Pembayaran Rapel / Kustom
          </Drawer.Title>
          <p className="mt-0.5 text-xs font-bold text-slate-700">
            {member.nama} — untuk nominal non-default atau periode lain.
          </p>

          <form onSubmit={handleSubmit} className="mt-3 flex flex-col gap-3" noValidate>
            <div>
              <label htmlFor="rapel-nominal" className={labelClass}>
                Nominal
              </label>
              <div className="flex items-center gap-1.5 rounded-xl border-2 border-black bg-neo-yellow/40 p-2">
                <span className="text-lg font-extrabold">Rp</span>
                <input
                  id="rapel-nominal"
                  type="text"
                  inputMode="numeric"
                  required
                  value={formatRibuan(jumlahDigit)}
                  onChange={(e) => setJumlahDigit(e.target.value.replace(/\D/g, "").slice(0, 9))}
                  disabled={submitting}
                  data-testid="rapel-nominal"
                  className="w-full bg-transparent text-2xl font-extrabold tabular-nums text-black outline-none"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="rapel-bulan" className={labelClass}>
                  Bulan Iuran
                </label>
                <select
                  id="rapel-bulan"
                  value={bulan}
                  onChange={(e) => setBulan(Number(e.target.value))}
                  disabled={submitting}
                  data-testid="rapel-bulan"
                  className={inputClass}
                >
                  {NAMA_BULAN.map((n, i) => (
                    <option key={i + 1} value={i + 1}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="rapel-tahun" className={labelClass}>
                  Tahun
                </label>
                <select
                  id="rapel-tahun"
                  value={tahun}
                  onChange={(e) => setTahun(Number(e.target.value))}
                  disabled={submitting}
                  data-testid="rapel-tahun"
                  className={inputClass}
                >
                  {tahunOptions.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="rapel-tanggal" className={labelClass}>
                Tanggal Bayar
              </label>
              <input
                id="rapel-tanggal"
                type="date"
                required
                value={tanggal}
                onChange={(e) => setTanggal(e.target.value)}
                disabled={submitting}
                data-testid="rapel-tanggal"
                className={`${inputClass} tabular-nums`}
              />
            </div>

            {error && (
              <p
                role="alert"
                aria-live="assertive"
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
              disabled={submitting}
              data-testid="rapel-submit"
              className="uppercase tracking-wide"
            >
              {submitting ? "Menyimpan..." : "Simpan Pembayaran"}
            </NeoButton>
          </form>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
