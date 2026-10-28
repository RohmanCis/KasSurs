"use client";

// =====================================================================
// KasSurs — Drawer Konfirmasi Hitung Ulang Laporan (FR-23 V2.2)
// Bottom drawer vaul: konfirmasi destruktif sebelum POST
// /api/reports/regenerate — snapshot tersimpan akan DITIMPA hasil hitung
// ulang, jadi aksi ini butuh persetujuan eksplisit (pola sama dengan
// konfirmasi hapus di PaymentEditDrawer 5.10 mitigasi c).
// Drawer murni UI: POST + unduh PDF didelegasikan ke parent (page.tsx).
// Deskripsi WAJIB memuat 3 fakta: laporan tersimpan diganti, file yang
// sudah terunduh tetap angka lama, aksi tercatat di audit log.
// =====================================================================

import { Drawer } from "vaul";
import NeoButton from "@/components/ui/NeoButton";
import { NAMA_BULAN } from "@/lib/format";

interface RegenerateConfirmDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bulan: number; // 1-12
  tahun: number;
  loading: boolean; // POST regenerate sedang jalan
  onConfirm: () => void;
}

export default function RegenerateConfirmDrawer({
  open,
  onOpenChange,
  bulan,
  tahun,
  loading,
  onConfirm,
}: RegenerateConfirmDrawerProps) {
  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Drawer.Content
          data-testid="regenerate-drawer"
          className="fixed inset-x-0 bottom-0 z-50 mx-auto max-h-[85dvh] w-full max-w-[430px] overflow-y-auto rounded-t-2xl border-x-[3px] border-t-[3px] border-black bg-white p-4 pb-8"
        >
          <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-black" aria-hidden="true" />
          <Drawer.Title className="text-sm font-extrabold uppercase tracking-tight text-black">
            Hitung ulang laporan?
          </Drawer.Title>
          <Drawer.Description className="mt-1.5 text-xs font-bold text-slate-700">
            Laporan {NAMA_BULAN[bulan - 1]} {tahun} akan dihitung ulang dari data
            terbaru dan menimpa laporan tersimpan. File yang sudah terunduh
            sebelumnya tetap berisi angka lama. Aksi ini tercatat di audit log.
          </Drawer.Description>

          {/* Label loading berbasis TEKS (bukan warna saja) + size lg =
              tap target ≥44px (3-DESIGN.md resep 5.2). */}
          <div className="mt-3 grid grid-cols-2 gap-2">
            <NeoButton
              variant="white"
              size="lg"
              fullWidth
              onClick={() => onOpenChange(false)}
              disabled={loading}
              data-testid="regenerate-cancel"
            >
              Batal
            </NeoButton>
            <NeoButton
              variant="black"
              size="lg"
              fullWidth
              onClick={onConfirm}
              disabled={loading}
              data-testid="regenerate-confirm"
            >
              {loading ? "Menghitung..." : "Ya, Hitung Ulang & Unduh"}
            </NeoButton>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
