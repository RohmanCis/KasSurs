"use client";

// =====================================================================
// KasSurs — Drawer Edit/Hapus Pembayaran (FR-08 V1.1)
// Bottom drawer vaul: detail payment + Edit (PATCH, prefill) + Hapus
// (DELETE + konfirmasi destruktif — SENGAJA beda dari undo toast yang
// tanpa konfirmasi, 3-DESIGN 5.10 mitigasi c). Dibuka via tap kartu
// LUNAS atau deep-link dari existingPaymentId (409 ALREADY_PAID).
// PATCH/DELETE didelegasikan ke parent — drawer murni form & konfirmasi.
// Parent me-remount via key=payment.id → state form selalu fresh.
// =====================================================================

import { useState, type FormEvent } from "react";
import { Drawer } from "vaul";
import { Pencil, Trash2 } from "lucide-react";
import NeoButton from "@/components/ui/NeoButton";
import { NAMA_BULAN, formatRibuan, formatRupiah } from "@/lib/format";
import type { PaymentDTO, UpdatePaymentRequest } from "@/lib/types";

interface PaymentEditDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  payment: PaymentDTO; // wajib non-null saat open (parent gate)
  submitting: boolean;
  onPatch: (body: UpdatePaymentRequest) => void;
  onDelete: () => void;
}

type Mode = "detail" | "edit" | "confirm-delete";

const labelClass = "mb-1 block text-[10px] font-extrabold uppercase tracking-wider text-black";
const inputClass =
  "w-full rounded-xl border-2 border-black bg-white px-3 py-2.5 text-sm font-bold text-black shadow-neo-sm focus:outline-none focus:ring-2 focus:ring-neo-yellow disabled:bg-neo-gray";

export default function PaymentEditDrawer({
  open,
  onOpenChange,
  payment,
  submitting,
  onPatch,
  onDelete,
}: PaymentEditDrawerProps) {
  const [mode, setMode] = useState<Mode>("detail");
  const [jumlahDigit, setJumlahDigit] = useState(String(payment.jumlah));
  const [bulan, setBulan] = useState(payment.bulan);
  const [tahun, setTahun] = useState(payment.tahun);
  const [tanggal, setTanggal] = useState(payment.tanggalBayar);
  const [error, setError] = useState<string | null>(null);

  const tahunIni = new Date().getFullYear();
  const tahunOptions = [tahunIni - 1, tahunIni, tahunIni + 1];

  function handleSubmitEdit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const nominal = parseInt(jumlahDigit, 10);
    if (!jumlahDigit || Number.isNaN(nominal) || nominal <= 0) {
      return setError("Nominal harus lebih dari 0.");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) {
      return setError("Tanggal wajib diisi.");
    }
    onPatch({ jumlah: nominal, bulan, tahun, tanggalBayar: tanggal });
  }

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Drawer.Content
          data-testid="edit-drawer"
          aria-describedby={undefined}
          className="fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[85dvh] w-full max-w-[430px] overflow-y-auto rounded-t-2xl border-x-[3px] border-t-[3px] border-black bg-white p-4 pb-8"
        >
          <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-black" aria-hidden="true" />
          <Drawer.Title className="text-sm font-extrabold uppercase tracking-tight text-black">
            Detail Pembayaran
          </Drawer.Title>
          <p className="mt-0.5 text-xs font-bold text-slate-700">{payment.memberNama}</p>

          {/* Ringkasan payment — selalu tampil di semua mode */}
          <div className="mt-3 space-y-1.5 rounded-xl border-2 border-black bg-neo-green/30 p-3 text-xs font-bold text-black">
            <div className="flex justify-between">
              <span>Nominal</span>
              <span className="font-extrabold tabular-nums">{formatRupiah(payment.jumlah)}</span>
            </div>
            <div className="flex justify-between">
              <span>Periode Iuran</span>
              <span className="font-extrabold tabular-nums">
                {NAMA_BULAN[payment.bulan - 1]} {payment.tahun}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Tanggal Bayar</span>
              <span className="font-extrabold tabular-nums">{payment.tanggalBayar}</span>
            </div>
          </div>

          {mode === "detail" && (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <NeoButton
                variant="yellow"
                size="md"
                fullWidth
                onClick={() => setMode("edit")}
                data-testid="edit-open-form"
              >
                <span className="flex items-center justify-center gap-1.5">
                  <Pencil className="h-4 w-4 stroke-[2.5]" aria-hidden="true" /> Edit
                </span>
              </NeoButton>
              <NeoButton
                variant="coral"
                size="md"
                fullWidth
                onClick={() => setMode("confirm-delete")}
                data-testid="edit-delete"
              >
                <span className="flex items-center justify-center gap-1.5">
                  <Trash2 className="h-4 w-4 stroke-[2.5]" aria-hidden="true" /> Hapus
                </span>
              </NeoButton>
            </div>
          )}

          {mode === "edit" && (
            <form onSubmit={handleSubmitEdit} className="mt-3 flex flex-col gap-3" noValidate>
              <div>
                <label htmlFor="edit-nominal" className={labelClass}>
                  Nominal
                </label>
                <div className="flex items-center gap-1.5 rounded-xl border-2 border-black bg-neo-yellow/40 p-2">
                  <span className="text-lg font-extrabold">Rp</span>
                  <input
                    id="edit-nominal"
                    type="text"
                    inputMode="numeric"
                    required
                    value={formatRibuan(jumlahDigit)}
                    onChange={(e) => setJumlahDigit(e.target.value.replace(/\D/g, "").slice(0, 9))}
                    disabled={submitting}
                    data-testid="edit-nominal"
                    className="w-full bg-transparent text-2xl font-extrabold tabular-nums text-black outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="edit-bulan" className={labelClass}>
                    Bulan Iuran
                  </label>
                  <select
                    id="edit-bulan"
                    value={bulan}
                    onChange={(e) => setBulan(Number(e.target.value))}
                    disabled={submitting}
                    data-testid="edit-bulan"
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
                  <label htmlFor="edit-tahun" className={labelClass}>
                    Tahun
                  </label>
                  <select
                    id="edit-tahun"
                    value={tahun}
                    onChange={(e) => setTahun(Number(e.target.value))}
                    disabled={submitting}
                    data-testid="edit-tahun"
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
                <label htmlFor="edit-tanggal" className={labelClass}>
                  Tanggal Bayar
                </label>
                <input
                  id="edit-tanggal"
                  type="date"
                  required
                  value={tanggal}
                  onChange={(e) => setTanggal(e.target.value)}
                  disabled={submitting}
                  data-testid="edit-tanggal"
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

              <div className="grid grid-cols-2 gap-2">
                <NeoButton
                  type="button"
                  variant="white"
                  size="md"
                  fullWidth
                  onClick={() => {
                    setMode("detail");
                    setError(null);
                  }}
                  disabled={submitting}
                >
                  Batal
                </NeoButton>
                <NeoButton
                  type="submit"
                  variant="green"
                  size="md"
                  fullWidth
                  disabled={submitting}
                  data-testid="edit-submit"
                >
                  {submitting ? "Menyimpan..." : "Simpan Perubahan"}
                </NeoButton>
              </div>
            </form>
          )}

          {mode === "confirm-delete" && (
            <div className="mt-3 rounded-xl border-2 border-black bg-neo-coral p-3">
              <p className="text-xs font-extrabold uppercase text-neo-darkred">
                Hapus pembayaran ini?
              </p>
              <p className="mt-1 text-[11px] font-bold text-slate-900">
                {payment.memberNama} kembali berstatus BELUM BAYAR untuk periode
                ini. Aksi tercatat di audit log dan tidak bisa di-undo dari sini.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <NeoButton
                  variant="white"
                  size="md"
                  fullWidth
                  onClick={() => setMode("detail")}
                  disabled={submitting}
                  data-testid="delete-cancel"
                >
                  Batal
                </NeoButton>
                <NeoButton
                  variant="black"
                  size="md"
                  fullWidth
                  onClick={onDelete}
                  disabled={submitting}
                  data-testid="delete-confirm"
                >
                  {submitting ? "Menghapus..." : "Ya, Hapus"}
                </NeoButton>
              </div>
            </div>
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
