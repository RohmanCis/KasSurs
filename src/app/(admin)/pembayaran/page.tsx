"use client";

// =====================================================================
// KasSurs — Halaman Speed-Tap Roster (FR-06/07/08 V1.1 — Neo-Brutalism)
// Blueprint: 2-TECH-SPEC.md Bagian 4 "Alur Catat Pembayaran (V1.1)":
//   1. 2 fetch awal: members?bulan&tahun + payments?bulan&tahun →
//      Map<paymentId, PaymentDTO> + Map<memberId, PaymentDTO> (badge L2,
//      tanggalLunas, prefill drawer).
//   2. 1-Tap: optimistic flip → POST (30rb, hari ini) → 201: vibrate(45)
//      + undo toast 5s (BATALKAN closure-scoped) | 409: settle Lunas +
//      badge dari createdAt existing + deep-link drawer | gagal lain:
//      rollback + toast error.
//   3. Long-press → drawer rapel; 409 cross-month → fetch tambahan
//      payments periode body → cari existingPaymentId → drawer edit.
//   4-8. Client check = UX shortcut; server unique constraint otoritatif;
//      undo = DELETE (audit kedua, by design).
//   9. Sonner default = stack — undo toast tidak pakai id global, jadi 2
//      undo simultan (tap A lalu B) sama-sama bisa dibatalkan.
// Badge BARU 2 lapis: L1 state Map<memberId, ts> (optimistic + 201) +
// L2 join createdAt dari payments fetch (<10 menit, selamat refresh).
// 401 dari API mana pun → redirect /login.
// =====================================================================

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { toast } from "sonner";
import { Search } from "lucide-react";
import MemberCard from "@/components/dashboard/MemberCard";
import dynamic from "next/dynamic";
import type { RapelInput } from "@/components/payments/PaymentRapelDrawer";
const PaymentRapelDrawer = dynamic(() => import("@/components/payments/PaymentRapelDrawer"));
const PaymentEditDrawer = dynamic(() => import("@/components/payments/PaymentEditDrawer"));
import BottomNav from "@/components/layout/BottomNav";
import LogoutButton from "@/components/ui/LogoutButton";
import NeoButton from "@/components/ui/NeoButton";
import { cn } from "@/lib/utils";
import {
  formatRupiah,
  formatTanggalSingkat,
  todayISO,
} from "@/lib/format";
import type {
  MemberDTO,
  PaymentConflictResponse,
  PaymentDTO,
  UpdatePaymentRequest,
} from "@/lib/types";

const JUMLAH_DEFAULT = 30000;
const BADGE_BARU_MS = 10 * 60 * 1000; // 10 menit (5.10 mitigasi b)

// Gaya tombol aksi toast sonner (Toaster unstyled — styling per-toast).
// Inverted hitam di atas kuning (mockup in-app toast baris 785-788).
const NEO_ACTION_STYLE: CSSProperties = {
  background: "#FFFFFF",
  color: "#000000",
  border: "2px solid #000000",
  borderRadius: 8,
  fontWeight: 800,
  padding: "4px 10px",
  marginLeft: 8,
  flexShrink: 0,
};

function vibrate(pattern: number | number[]) {
  if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(pattern);
}

export default function PembayaranPage() {
  const router = useRouter();
  const now = new Date();
  const bulan = now.getMonth() + 1; // roster = bulan berjalan (fixed)
  const tahun = now.getFullYear();

  const [members, setMembers] = useState<MemberDTO[]>([]);
  const [paymentsByMember, setPaymentsByMember] = useState<Map<string, PaymentDTO>>(new Map());
  const [paymentsById, setPaymentsById] = useState<Map<string, PaymentDTO>>(new Map());
  const [baruAt, setBaruAt] = useState<Map<string, number>>(new Map()); // L1 badge BARU
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set()); // in-flight guard
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [filter, setFilter] = useState<"semua" | "belum">("semua");
  const [search, setSearch] = useState("");

  const [rapelMemberId, setRapelMemberId] = useState<string | null>(null);
  const [editPaymentId, setEditPaymentId] = useState<string | null>(null);
  const [rapelSubmitting, setRapelSubmitting] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);

  const keLogin = useCallback(() => router.replace("/login"), [router]);

  // ===== Fetch awal (langkah 1) =====
  const muatSemua = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [resMembers, resPayments] = await Promise.all([
        fetch(`/api/members?bulan=${bulan}&tahun=${tahun}`),
        fetch(`/api/payments?bulan=${bulan}&tahun=${tahun}`),
      ]);
      if (resMembers.status === 401 || resPayments.status === 401) {
        keLogin();
        return;
      }
      if (!resMembers.ok || !resPayments.ok) {
        setLoadError("Gagal memuat roster. Coba lagi.");
        return;
      }
      const ms = (await resMembers.json()) as MemberDTO[];
      const ps = (await resPayments.json()) as PaymentDTO[];
      setMembers(ms);
      setPaymentsByMember(new Map(ps.map((p) => [p.memberId, p])));
      setPaymentsById(new Map(ps.map((p) => [p.id, p])));
    } catch {
      setLoadError("Tidak bisa terhubung ke server. Periksa koneksi, lalu coba lagi.");
    } finally {
      setLoading(false);
    }
  }, [bulan, tahun, keLogin]);

  useEffect(() => {
    muatSemua();
  }, [muatSemua]);

  // ===== State helpers =====
  // Flip kartu roster ke LUNAS hanya jika payment (jika ada) milik periode
  // roster. 409 cross-month: existing milik bulan lain → kartu bulan berjalan
  // TETAP Belum (fix bug e2e test 4: kartu salah flip LUNAS).
  const tandaiLunas = useCallback(
    (memberId: string, payment?: PaymentDTO) => {
      const periodeRoster = !payment || (payment.bulan === bulan && payment.tahun === tahun);
      if (periodeRoster) {
        setMembers((cur) =>
          cur.map((m) => (m.id === memberId ? { ...m, statusBayarBulanIni: "LUNAS" } : m))
        );
      }
      if (payment) {
        // paymentsById SELALU diisi (cross-month pun) — sumber lookup drawer edit
        // (deep-link 409 butuh data ada di map, walau bukan periode roster).
        setPaymentsById((cur) => new Map(cur).set(payment.id, payment));
        if (periodeRoster) {
          setPaymentsByMember((cur) => new Map(cur).set(memberId, payment));
        }
      }
    },
    [bulan, tahun]
  );

  const tandaiBelum = useCallback((memberId: string) => {
    setMembers((cur) =>
      cur.map((m) => (m.id === memberId ? { ...m, statusBayarBulanIni: "BELUM_BAYAR" } : m))
    );
    setPaymentsByMember((cur) => {
      const next = new Map(cur);
      next.delete(memberId);
      return next;
    });
    setBaruAt((cur) => {
      const next = new Map(cur);
      next.delete(memberId);
      return next;
    });
  }, []);

  const tandaiPending = useCallback((memberId: string, pending: boolean) => {
    setPendingIds((cur) => {
      const next = new Set(cur);
      if (pending) next.add(memberId);
      else next.delete(memberId);
      return next;
    });
  }, []);

  const undoPayment = useCallback(
    async (dto: PaymentDTO) => {
      try {
        const res = await fetch(`/api/payments/${dto.id}`, { method: "DELETE" });
        if (res.status === 401) {
          keLogin();
          return;
        }
        if (!res.ok) {
          toast.error("Gagal membatalkan. Buka kartu Lunas untuk hapus manual.", {
            actionButtonStyle: NEO_ACTION_STYLE,
          });
          return;
        }
        tandaiBelum(dto.memberId);
        setPaymentsById((cur) => {
          const next = new Map(cur);
          next.delete(dto.id);
          return next;
        });
        vibrate([30, 40, 30]); // pola undo dibedakan (5.10 d)
        toast(`Pembayaran ${dto.memberNama} dibatalkan`);
      } catch {
        toast.error("Tidak bisa terhubung ke server.");
      }
    },
    [keLogin, tandaiBelum]
  );

  // Undo toast 5 detik — paymentId di CLOSURE (non-blocking scoped undo,
  // 5.10 protocol): undo hanya berlaku untuk payment toast ini.
  const tampilkanUndoToast = useCallback(
    (dto: PaymentDTO) => {
      toast(`✓ ${dto.memberNama} Lunas (${formatRupiah(dto.jumlah)})`, {
        duration: 5000,
        action: {
          label: "BATALKAN",
          onClick: () => undoPayment(dto),
        },
        actionButtonStyle: NEO_ACTION_STYLE,
      });
    },
    [undoPayment]
  );

  // 409: truth server = sudah lunas. Settle kartu ke Lunas (TIDAK rollback),
  // badge dari createdAt payment existing, deep-link drawer edit.
  const settleConflict = useCallback(
    async (member: MemberDTO, existingPaymentId: string, b: number, t: number) => {
      try {
        const res = await fetch(`/api/payments?bulan=${b}&tahun=${t}`);
        if (res.status === 401) {
          keLogin();
          return;
        }
        if (res.ok) {
          const ps = (await res.json()) as PaymentDTO[];
          const existing = ps.find((p) => p.id === existingPaymentId);
          if (existing) {
            tandaiLunas(member.id, existing);
            // Badge BARU mengikuti usia createdAt ASLI (bukan "sekarang") —
            // payment lama (>10 mnt) tidak dapat badge palsu. DAN hanya untuk
            // payment periode roster (oracle #2 fix: badge di kartu BELUM pada
            // 409 cross-month membingungkan — kartu tidak flip, badge jangan tampil).
            if (existing.bulan === bulan && existing.tahun === tahun) {
              setBaruAt((cur) => new Map(cur).set(member.id, Date.parse(existing.createdAt)));
            }
            setEditPaymentId(existing.id);
          }
        }
      } catch {
        // Abaikan — kartu sudah settle Lunas; drawer gagal terbuka tidak fatal.
      }
      toast("Sudah lunas bulan ini — membuka detail pembayaran.", {
        actionButtonStyle: NEO_ACTION_STYLE,
      });
    },
    [bulan, tahun, keLogin, tandaiLunas]
  );

  // ===== POST shared (speed-tap & rapel) =====
  const kirimPembayaran = useCallback(
    async (member: MemberDTO, input: RapelInput, sumber: "tap" | "rapel") => {
      const periodeRoster = input.bulan === bulan && input.tahun === tahun;
      try {
        const res = await fetch("/api/payments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ memberId: member.id, ...input }),
        });
        if (res.status === 401) {
          keLogin();
          return;
        }

        if (res.status === 201) {
          const dto = (await res.json()) as PaymentDTO;
          if (periodeRoster) {
            tandaiLunas(member.id, dto);
            setBaruAt((cur) => new Map(cur).set(member.id, Date.now()));
          }
          vibrate(45);
          tampilkanUndoToast(dto);
          if (sumber === "rapel") setRapelMemberId(null);
          return;
        }

        if (res.status === 409) {
          const data = (await res.json()) as PaymentConflictResponse;
          if (sumber === "rapel") setRapelMemberId(null);
          // Cross-month: data existing tidak ada di fetch roster → settleConflict
          // melakukan fetch tambahan periode body (langkah 3 tech spec).
          await settleConflict(member, data.existingPaymentId, input.bulan, input.tahun);
          return;
        }

        // Gagal lain → rollback (speed-tap sudah optimistic flip)
        if (sumber === "tap" && periodeRoster) tandaiBelum(member.id);
        const data = (await res.json().catch(() => null)) as { message?: string } | null;
        toast.error(data?.message || "Gagal menyimpan pembayaran. Coba lagi.");
      } catch {
        if (sumber === "tap" && periodeRoster) tandaiBelum(member.id);
        toast.error("Tidak bisa terhubung ke server. Periksa koneksi, lalu coba lagi.");
      }
    },
    [bulan, tahun, keLogin, tandaiBelum, tandaiLunas, tampilkanUndoToast, settleConflict]
  );

  // ===== Tap kartu (mode a + buka drawer edit) =====
  // useCallback (FASE 2) — handler stabil agar React.memo(MemberCard) efektif:
  // pencarian/filter tidak me-re-render kartu yang props-nya tak berubah.
  const handleTap = useCallback(
    async (memberId: string) => {
      const member = members.find((m) => m.id === memberId);
      if (!member || pendingIds.has(memberId)) return; // in-flight: silent ignore

      if (member.statusBayarBulanIni === "LUNAS") {
        const p = paymentsByMember.get(memberId);
        if (p) setEditPaymentId(p.id);
        return;
      }

      // 1-Tap Speed-Tap: optimistic flip SEBELUM response
      tandaiPending(memberId, true);
      tandaiLunas(memberId);
      setBaruAt((cur) => new Map(cur).set(memberId, Date.now()));
      try {
        await kirimPembayaran(
          member,
          { jumlah: JUMLAH_DEFAULT, bulan, tahun, tanggalBayar: todayISO() },
          "tap"
        );
      } finally {
        tandaiPending(memberId, false);
      }
    },
    [bulan, tahun, members, pendingIds, paymentsByMember, kirimPembayaran, tandaiLunas, tandaiPending]
  );

  // Long-press → rapel drawer. Setter state stabil → callback sekali buat.
  const bukaRapel = useCallback((memberId: string) => {
    setRapelMemberId(memberId);
  }, []);

  // ===== Rapel drawer submit (mode b) =====
  async function handleRapelSubmit(input: RapelInput) {
    const member = members.find((m) => m.id === rapelMemberId);
    if (!member) return;
    setRapelSubmitting(true);
    try {
      await kirimPembayaran(member, input, "rapel");
    } finally {
      setRapelSubmitting(false);
    }
  }

  // ===== Drawer edit/hapus =====
  async function handlePatch(id: string, body: UpdatePaymentRequest) {
    const lama = paymentsById.get(id);
    setEditSubmitting(true);
    try {
      const res = await fetch(`/api/payments/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.status === 401) {
        keLogin();
        return;
      }
      if (res.status === 409) {
        toast.error("Sudah ada pembayaran lain untuk periode itu.");
        return;
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { message?: string } | null;
        toast.error(data?.message || "Gagal menyimpan perubahan.");
        return;
      }
      const dto = (await res.json()) as PaymentDTO;
      // Periode pindah bulan → kartu roster bulan ini kembali Belum
      if (lama && (lama.bulan !== dto.bulan || lama.tahun !== dto.tahun)) {
        if (lama.bulan === bulan && lama.tahun === tahun) tandaiBelum(dto.memberId);
        // PATCH cross-month → roster month: kartu flip LUNAS (oracle #2 fix —
        // sebelumnya arah masuk roster bocor: kartu tetap Belum).
        if (dto.bulan === bulan && dto.tahun === tahun) tandaiLunas(dto.memberId, dto);
      } else if (dto.bulan === bulan && dto.tahun === tahun) {
        // PATCH TIDAK menghapus badge BARU (createdAt tidak berubah, 5.10 b)
        setPaymentsByMember((cur) => new Map(cur).set(dto.memberId, dto));
      }
      setPaymentsById((cur) => new Map(cur).set(dto.id, dto));
      setEditPaymentId(null);
      toast("Perubahan pembayaran tersimpan.");
    } catch {
      toast.error("Tidak bisa terhubung ke server.");
    } finally {
      setEditSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    const payment = paymentsById.get(id);
    setEditSubmitting(true);
    try {
      const res = await fetch(`/api/payments/${id}`, { method: "DELETE" });
      if (res.status === 401) {
        keLogin();
        return;
      }
      if (!res.ok) {
        toast.error("Gagal menghapus pembayaran.");
        return;
      }
      if (payment && payment.bulan === bulan && payment.tahun === tahun) {
        tandaiBelum(payment.memberId);
      }
      setPaymentsById((cur) => {
        const next = new Map(cur);
        next.delete(id);
        return next;
      });
      setEditPaymentId(null);
      toast(`Pembayaran ${payment?.memberNama ?? "anggota"} dihapus.`);
    } catch {
      toast.error("Tidak bisa terhubung ke server.");
    } finally {
      setEditSubmitting(false);
    }
  }

  // ===== Badge BARU 2 lapis =====
  function isBaru(memberId: string): boolean {
    const l1 = baruAt.get(memberId);
    if (l1 !== undefined) return Date.now() - l1 < BADGE_BARU_MS;
    const p = paymentsByMember.get(memberId);
    return p !== undefined && Date.now() - Date.parse(p.createdAt) < BADGE_BARU_MS;
  }

  // ===== Filter chip + search GABUNGAN (FR-07) — search menghormati chip =====
  const aktif = useMemo(() => members.filter((m) => m.statusAktif), [members]);
  const jumlahBelum = aktif.filter((m) => m.statusBayarBulanIni !== "LUNAS").length;

  const tampil = useMemo(() => {
    let list = filter === "belum" ? aktif.filter((m) => m.statusBayarBulanIni !== "LUNAS") : aktif;
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((m) => m.nama.toLowerCase().includes(q));
    // Belum Bayar selalu di atas (FR-07), alfabetis dalam grup
    return [...list].sort((a, b) => {
      const la = a.statusBayarBulanIni === "LUNAS" ? 1 : 0;
      const lb = b.statusBayarBulanIni === "LUNAS" ? 1 : 0;
      if (la !== lb) return la - lb;
      return a.nama.localeCompare(b.nama, "id");
    });
  }, [aktif, filter, search]);

  const rapelMember = rapelMemberId ? members.find((m) => m.id === rapelMemberId) : null;
  const editPayment = editPaymentId ? paymentsById.get(editPaymentId) : null;

  return (
    <main className="mx-auto w-full max-w-[430px] pb-24 md:max-w-2xl">
      {/* Header bar — resep 5.7. Green = konteks kas masuk/aksi utama
          (Bagian 2 token table); yellow/coral/purple/orange/sky sudah
          dipakai halaman lain — green menghindari bentrok dashboard. */}
      <header className="flex items-center justify-between border-b-[2.5px] border-black bg-neo-green px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <h1 className="text-xs font-extrabold uppercase text-black">Speed-Tap Roster</h1>
          <span className="rounded border border-black bg-neo-yellow px-1.5 text-[9px] font-bold">
            1-Tap
          </span>
        </div>
        <LogoutButton />
      </header>

      <div className="space-y-3 p-3.5">
        {/* Chip filter + search GABUNGAN (FR-07 — keputusan user FINAL) */}
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => setFilter("semua")}
            data-testid="chip-filter-semua"
            className={cn(
              "inline-flex min-h-[44px] items-center rounded-xl border-[2.5px] border-black px-2.5 py-1 text-[10px] shadow-neo neo-press select-none",
              filter === "semua" ? "bg-black font-extrabold text-white" : "bg-white font-bold text-black"
            )}
          >
            Semua ({aktif.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter("belum")}
            data-testid="chip-filter-belum"
            className={cn(
              "inline-flex min-h-[44px] items-center rounded-xl border-[2.5px] border-black px-2.5 py-1 text-[10px] shadow-neo neo-press select-none",
              filter === "belum" ? "bg-black font-extrabold text-white" : "bg-neo-coral font-bold text-black"
            )}
          >
            Belum ({jumlahBelum})
          </button>
          <div className="relative min-w-0 flex-1">
            {/* Ikon center terhadap WRAPPER — maka input wajib h-full
                (wrapper stretch setinggi chip min-h-[44px]; tanpa h-full
                input nempel di atas dan ikon tampak meleset turun) */}
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 stroke-[2.5] text-slate-500"
              aria-hidden="true"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari nama..."
              aria-label="Cari nama anggota"
              data-testid="search-anggota"
              className="h-full w-full rounded-xl border-[2.5px] border-black bg-white py-1 pl-10 pr-2 text-xs font-bold text-black shadow-neo-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-neo-yellow"
            />
          </div>
        </div>

        {loading && (
          <div className="grid grid-cols-2 gap-2" aria-busy="true" aria-label="Memuat roster">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-[72px] animate-pulse rounded-[14px] border-[2.5px] border-black bg-neo-gray"
              />
            ))}
          </div>
        )}

        {!loading && loadError && (
          <div className="rounded-xl border-[2.5px] border-black bg-neo-coral p-3.5 shadow-neo-sm">
            <p role="alert" className="text-xs font-extrabold text-neo-darkred">
              {loadError}
            </p>
            <NeoButton variant="white" size="md" fullWidth onClick={muatSemua} className="mt-3" data-testid="roster-retry">
              Coba Lagi
            </NeoButton>
          </div>
        )}

        {!loading && !loadError && tampil.length === 0 && (
          <p className="rounded-xl border-[2.5px] border-black bg-white p-6 text-center text-xs font-bold text-slate-600 shadow-neo-sm">
            {search.trim()
              ? `Tidak ada anggota cocok dengan "${search.trim()}".`
              : filter === "belum"
                ? "Semua anggota aktif sudah lunas bulan ini."
                : "Belum ada anggota aktif."}
          </p>
        )}

        {!loading && !loadError && tampil.length > 0 && (
          <div className="grid grid-cols-2 gap-2" data-testid="roster-grid">
            {tampil.map((m) => {
              const lunas = m.statusBayarBulanIni === "LUNAS";
              const payment = paymentsByMember.get(m.id);
              return (
                <MemberCard
                  key={m.id}
                  member={m}
                  isNew={isBaru(m.id)}
                  isPending={pendingIds.has(m.id)}
                  tanggalLunas={lunas && payment ? formatTanggalSingkat(payment.tanggalBayar) : undefined}
                  jumlahTampil={
                    lunas && payment ? `Rp ${Math.round(payment.jumlah / 1000)}k` : "Rp 30k"
                  }
                  onTap={handleTap}
                  onLongPress={bukaRapel}
                  data-testid={`member-card-${m.id}`}
                />
              );
            })}
          </div>
        )}

        <p className="pt-1 text-center text-xs font-bold text-slate-700">
          Tap = catat lunas Rp 30k · Tahan ½ detik = rapel/nominal lain · Tap kartu hijau = edit/hapus
        </p>
      </div>

      {rapelMember && (
        <PaymentRapelDrawer
          key={rapelMember.id}
          open
          onOpenChange={(open) => {
            if (!open) setRapelMemberId(null);
          }}
          member={rapelMember}
          defaultBulan={bulan}
          defaultTahun={tahun}
          defaultTanggal={todayISO()}
          submitting={rapelSubmitting}
          onSubmit={handleRapelSubmit}
        />
      )}

      {editPayment && (
        <PaymentEditDrawer
          key={editPayment.id}
          open
          onOpenChange={(open) => {
            if (!open) setEditPaymentId(null);
          }}
          payment={editPayment}
          submitting={editSubmitting}
          onPatch={(body) => handlePatch(editPayment.id, body)}
          onDelete={() => handleDelete(editPayment.id)}
        />
      )}

      <BottomNav />
    </main>
  );
}
