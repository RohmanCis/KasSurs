"use client";

// =====================================================================
// KasSurs — T-19: Halaman Manajemen Anggota (Admin) (FR-02..FR-05)
// Restyle Neo-Brutalism V2.2 (FASE-3) — perilaku/logika/endpoint TIDAK
// berubah:
// - Fetch SEKALI per periode (GET /api/members?bulan=&tahun=) → search &
//   sorting sepenuhnya client-side (instan).
// - Sorting default: "Belum Bayar duluan" (actionable-first), nonaktif
//   selalu di bawah & dibedakan visual.
// - Tap row → expand in-place: Ubah Data (MemberForm edit) / Nonaktifkan
//   (konfirmasi inline, tangani 403 LAST_ADMIN). Nonaktif: "Aktifkan
//   Kembali" (PATCH { statusAktif: true }, TANPA konfirmasi; QA #3).
// - Toast: migrasi ke sonner (Toast.tsx tidak dipakai lagi di sini).
// - Header bar: PURPLE (mockup tak punya subscreen manajemen anggota;
//   purple = warna badge/label meta-administratif, 3-DESIGN Bagian 2).
// - 401 dari API mana pun → redirect /login (sesi kedaluwarsa).
// =====================================================================

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, MessageCircle, Search, UserPlus } from "lucide-react";
import MemberForm from "@/components/forms/MemberForm";
import BottomNav from "@/components/layout/BottomNav";
import LogoutButton from "@/components/ui/LogoutButton";
import NeoButton from "@/components/ui/NeoButton";
import { cn } from "@/lib/utils";
import { NAMA_BULAN, waReminderUrl } from "@/lib/format";
import type {
  MemberDTO,
  MemberDeactivateErrorResponse,
} from "@/lib/types";

// Panel yang tampil saat row di-expand.
type PanelState = "aksi" | "edit" | "konfirmasi";

function byNama(a: MemberDTO, b: MemberDTO): number {
  return a.nama.localeCompare(b.nama, "id");
}

export default function AnggotaPage() {
  const router = useRouter();
  const now = new Date();

  const [members, setMembers] = useState<MemberDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [belumDulu, setBelumDulu] = useState(true);
  const [bulan, setBulan] = useState(now.getMonth() + 1); // 1-12
  const [tahun, setTahun] = useState(now.getFullYear());

  const [showCreate, setShowCreate] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [panel, setPanel] = useState<PanelState>("aksi");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; pesan: string } | null>(null);

  const keLogin = useCallback(() => {
    router.replace("/login");
  }, [router]);

  // Sonner — durasi 3s meniru auto-dismiss Toast.tsx lama.
  const tampilkanToast = useCallback((pesan: string) => {
    toast(pesan, { duration: 3000 });
  }, []);

  const muatAnggota = useCallback(
    async (b: number, t: number) => {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await fetch(`/api/members?bulan=${b}&tahun=${t}`);
        if (res.status === 401) {
          keLogin();
          return;
        }
        if (!res.ok) {
          setLoadError("Gagal memuat data anggota. Coba lagi.");
          return;
        }
        setMembers((await res.json()) as MemberDTO[]);
      } catch {
        setLoadError("Tidak bisa terhubung ke server. Periksa koneksi, lalu coba lagi.");
      } finally {
        setLoading(false);
      }
    },
    [keLogin],
  );

  useEffect(() => {
    muatAnggota(bulan, tahun);
  }, [bulan, tahun, muatAnggota]);

  // Filter (client-side) + sorting. Saat searching, urutan status tidak
  // berlaku — hasil murni alfabetis.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hasil = q
      ? members.filter(
          (m) =>
            m.nama.toLowerCase().includes(q) || m.noHp.includes(q),
        )
      : members;

    if (q) return [...hasil].sort(byNama);

    const aktif = hasil.filter((m) => m.statusAktif);
    const nonaktif = hasil.filter((m) => !m.statusAktif).sort(byNama);
    if (!belumDulu) return [...aktif.sort(byNama), ...nonaktif];

    const belum = aktif
      .filter((m) => m.statusBayarBulanIni !== "LUNAS")
      .sort(byNama);
    const lunas = aktif
      .filter((m) => m.statusBayarBulanIni === "LUNAS")
      .sort(byNama);
    return [...belum, ...lunas, ...nonaktif];
  }, [members, query, belumDulu]);

  const ringkasan = useMemo(() => {
    const aktif = members.filter((m) => m.statusAktif);
    const lunas = aktif.filter((m) => m.statusBayarBulanIni === "LUNAS").length;
    return { aktif: aktif.length, lunas };
  }, [members]);

  const isPeriodeIni =
    bulan === now.getMonth() + 1 && tahun === now.getFullYear();

  function geserPeriode(delta: number) {
    const d = new Date(tahun, bulan - 1 + delta, 1);
    setBulan(d.getMonth() + 1);
    setTahun(d.getFullYear());
    tutupPanel();
  }

  function tutupPanel() {
    setExpandedId(null);
    setPanel("aksi");
    setRowError(null);
  }

  function toggleRow(id: string) {
    setRowError(null);
    setPanel("aksi");
    setExpandedId((cur) => (cur === id ? null : id));
  }

  function handleSaved(dto: MemberDTO, mode: "create" | "edit") {
    if (mode === "create") {
      // Anggota baru pasti belum bayar periode berjalan.
      setMembers((cur) => [...cur, { ...dto, statusBayarBulanIni: "BELUM_BAYAR" }]);
      setShowCreate(false);
      tampilkanToast(`${dto.nama} berhasil ditambahkan.`);
    } else {
      // Response PATCH tidak membawa statusBayarBulanIni — pertahankan
      // nilai lama dari state (spread dto tidak menimpa field yang absen).
      setMembers((cur) => cur.map((m) => (m.id === dto.id ? { ...m, ...dto } : m)));
      tutupPanel();
      tampilkanToast(`Data ${dto.nama} berhasil disimpan.`);
    }
  }

  async function handleNonaktifkan(target: MemberDTO) {
    setBusyId(target.id);
    setRowError(null);
    try {
      const res = await fetch(`/api/members/${target.id}/deactivate`, {
        method: "PATCH",
      });
      if (res.status === 401) {
        keLogin();
        return;
      }
      if (res.ok) {
        setMembers((cur) =>
          cur.map((m) => (m.id === target.id ? { ...m, statusAktif: false } : m)),
        );
        tutupPanel();
        tampilkanToast(`${target.nama} dinonaktifkan. Data historisnya tetap tersimpan.`);
        return;
      }
      const data = (await res.json()) as MemberDeactivateErrorResponse;
      // 403 LAST_ADMIN & 404 MEMBER_NOT_FOUND → pesan server sudah jelas.
      setRowError({ id: target.id, pesan: data.message || "Gagal menonaktifkan anggota." });
      setPanel("aksi");
    } catch {
      setRowError({
        id: target.id,
        pesan: "Tidak bisa terhubung ke server. Periksa koneksi, lalu coba lagi.",
      });
      setPanel("aksi");
    } finally {
      setBusyId(null);
    }
  }

  async function handleAktifkan(target: MemberDTO) {
    setBusyId(target.id);
    setRowError(null);
    try {
      const res = await fetch(`/api/members/${target.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statusAktif: true }),
      });
      if (res.status === 401) {
        keLogin();
        return;
      }
      if (res.ok) {
        setMembers((cur) =>
          cur.map((m) => (m.id === target.id ? { ...m, statusAktif: true } : m)),
        );
        tutupPanel();
        tampilkanToast(`${target.nama} aktif kembali.`);
        // Refresh list — statusBayarBulanIni row ini bisa stale selama
        // dia nonaktif (response PATCH tidak membawanya).
        muatAnggota(bulan, tahun);
        return;
      }
      const data = (await res.json()) as MemberDeactivateErrorResponse;
      setRowError({ id: target.id, pesan: data.message || "Gagal mengaktifkan anggota." });
    } catch {
      setRowError({
        id: target.id,
        pesan: "Tidak bisa terhubung ke server. Periksa koneksi, lalu coba lagi.",
      });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="mx-auto w-full max-w-[430px] pb-24 md:max-w-2xl">
      {/* Header bar — resep 5.7; purple = konteks manajemen anggota
          (mockup tak punya subscreen ini; purple = warna meta/label) */}
      <header className="flex items-center justify-between border-b-[2.5px] border-black bg-neo-purple px-4 py-2.5">
        <div>
          <h1 className="text-xs font-extrabold uppercase text-black">Manajemen Anggota</h1>
          <p className="text-xs font-bold tracking-tight text-slate-800">
            Kelola anggota & status bayar mereka.
          </p>
        </div>
        <LogoutButton />
      </header>

      <div className="space-y-3 p-3.5">
        {/* Periode status bayar */}
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => geserPeriode(-1)}
            aria-label="Bulan sebelumnya"
            data-testid="anggota-periode-prev"
            className="flex h-11 w-11 items-center justify-center rounded-xl border-[2.5px] border-black bg-white shadow-neo-sm neo-press neo-press-sm"
          >
            <ChevronLeft className="h-4 w-4 stroke-[3]" aria-hidden="true" />
          </button>
          <p className="text-center text-xs font-extrabold uppercase text-black">
            {NAMA_BULAN[bulan - 1]} <span className="tabular-nums">{tahun}</span>
            {isPeriodeIni && (
              <span className="ml-1.5 rounded border border-black bg-neo-yellow px-1 text-[9px] font-extrabold">
                BULAN INI
              </span>
            )}
          </p>
          <button
            type="button"
            onClick={() => geserPeriode(1)}
            disabled={isPeriodeIni}
            aria-label="Bulan berikutnya"
            data-testid="anggota-periode-next"
            className="flex h-11 w-11 items-center justify-center rounded-xl border-[2.5px] border-black bg-white shadow-neo-sm neo-press neo-press-sm disabled:translate-x-[2px] disabled:translate-y-[2px] disabled:bg-neo-gray disabled:text-slate-400 disabled:shadow-none"
          >
            <ChevronRight className="h-4 w-4 stroke-[3]" aria-hidden="true" />
          </button>
        </div>

        {!loading && !loadError && members.length > 0 && (
          <p className="text-[11px] font-bold text-slate-700">
            <span className="tabular-nums font-extrabold text-black">{ringkasan.lunas}</span>
            {" dari "}
            <span className="tabular-nums font-extrabold text-black">{ringkasan.aktif}</span>
            {" anggota aktif sudah lunas periode ini."}
          </p>
        )}

        {/* Tombol tambah + form tambah (expand in-place) */}
        {showCreate ? (
          <section
            aria-label="Form tambah anggota"
            data-testid="anggota-form-create"
            className="rounded-2xl border-[2.5px] border-black bg-white p-3.5 shadow-neo"
          >
            <h2 className="mb-3 text-xs font-extrabold uppercase tracking-tight text-black">
              Tambah Anggota Baru
            </h2>
            <MemberForm
              mode="create"
              onSaved={handleSaved}
              onCancel={() => setShowCreate(false)}
              onUnauthorized={keLogin}
            />
          </section>
        ) : (
          <NeoButton
            variant="green"
            size="md"
            fullWidth
            onClick={() => {
              tutupPanel();
              setShowCreate(true);
            }}
            data-testid="anggota-tambah-button"
          >
            <span className="flex items-center justify-center gap-1.5">
              <UserPlus className="h-4 w-4 stroke-[2.5]" aria-hidden="true" /> Tambah Anggota
            </span>
          </NeoButton>
        )}

        {/* Search + toggle sorting */}
        <div className="flex items-center gap-1.5">
          <div className="relative min-w-0 flex-1">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 stroke-[3] text-slate-500"
              aria-hidden="true"
            />
            <input
              id="cari"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ketik nama atau nomor HP..."
              aria-label="Cari anggota"
              data-testid="anggota-search"
              className="w-full rounded-xl border-[2.5px] border-black bg-white py-2 pl-8 pr-2 text-xs font-bold text-black shadow-neo-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-neo-yellow"
            />
          </div>
          <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[10px] font-extrabold uppercase text-black">
            <input
              type="checkbox"
              checked={belumDulu}
              onChange={(e) => setBelumDulu(e.target.checked)}
              data-testid="anggota-sort-toggle"
              className="h-4 w-4 accent-black"
            />
            Belum di atas
          </label>
        </div>

        {/* Loading — skeleton border hitam + pulse (5.11) */}
        {loading && (
          <div className="space-y-2" aria-busy="true" aria-label="Memuat daftar anggota">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-xl border-2 border-black bg-neo-gray"
              />
            ))}
          </div>
        )}

        {/* Error load */}
        {loadError && !loading && (
          <div className="rounded-xl border-[2.5px] border-black bg-neo-coral p-3.5 text-center shadow-neo-sm">
            <p role="alert" className="text-xs font-extrabold text-neo-darkred">
              {loadError}
            </p>
            <NeoButton
              variant="white"
              size="md"
              fullWidth
              onClick={() => muatAnggota(bulan, tahun)}
              className="mt-3"
              data-testid="anggota-retry"
            >
              Coba Lagi
            </NeoButton>
          </div>
        )}

        {/* Empty state: belum ada anggota sama sekali */}
        {!loading && !loadError && members.length === 0 && (
          <div className="rounded-xl border-[2.5px] border-black bg-white p-6 text-center shadow-neo-sm">
            <p className="text-sm font-extrabold text-black">Belum ada anggota</p>
            <p className="mt-1 text-[11px] font-bold text-slate-600">
              Tambahkan anggota pertama organisasi kamu lewat tombol di atas.
            </p>
          </div>
        )}

        {/* Empty state: pencarian tanpa hasil */}
        {!loading && !loadError && members.length > 0 && visible.length === 0 && (
          <div className="rounded-xl border-[2.5px] border-black bg-white p-6 text-center shadow-neo-sm">
            <p className="text-sm font-extrabold text-black">Tidak ditemukan</p>
            <p className="mt-1 text-[11px] font-bold text-slate-600">
              Tidak ada anggota yang cocok dengan &ldquo;{query.trim()}&rdquo;.
            </p>
          </div>
        )}

        {/* List anggota — card-per-row neo, tap row untuk expand */}
        {!loading && !loadError && visible.length > 0 && (
          <ul className="space-y-2" data-testid="anggota-list">
            {visible.map((m) => {
              const expanded = expandedId === m.id;
              const lunas = m.statusBayarBulanIni === "LUNAS";
              const showWa = m.statusAktif && !lunas;
              return (
                <li
                  key={m.id}
                  className={cn(
                    // flex-wrap: panel expand (w-full) turun ke baris penuh
                    // di bawah baris tombol-expand + tombol WA yang sejajar.
                    // items-stretch: WA slab mengikuti tinggi row, bukan
                    // mendikte tinggi list.
                    "flex flex-wrap items-stretch rounded-xl border-2 border-black bg-white shadow-neo-sm",
                    !m.statusAktif && "opacity-70"
                  )}
                >
                  <button
                    type="button"
                    onClick={() => toggleRow(m.id)}
                    aria-expanded={expanded}
                    data-testid={`anggota-row-${m.id}`}
                    // Radius kanan mengikuti kehadiran WA slab — tanpa WA,
                    // sudut kanan expander harus menutup kartu rounded-xl.
                    className={cn(
                      "flex min-w-0 flex-1 items-center justify-between gap-3 px-3 py-2.5 text-left neo-press neo-press-sm active:shadow-none focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black",
                      showWa ? "rounded-l-[10px]" : "rounded-[10px]"
                    )}
                  >
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-xs font-extrabold text-black">
                          {m.nama}
                        </span>
                        {m.role === "ADMIN" && (
                          <span className="rounded border border-black bg-neo-yellow px-1.5 py-0.5 text-[9px] font-extrabold uppercase">
                            Admin
                          </span>
                        )}
                        {!m.statusAktif && (
                          <span className="rounded border border-black bg-neo-gray px-1.5 py-0.5 text-[9px] font-extrabold uppercase text-slate-500">
                            Nonaktif
                          </span>
                        )}
                      </span>
                      <span className="block text-[10px] font-bold tabular-nums text-slate-600">
                        {m.noHp}
                      </span>
                    </span>
                    {m.statusAktif && (
                      <span
                        className={cn(
                          "shrink-0 rounded border-1.5 border-black px-1.5 py-0.5 text-[9px] font-extrabold uppercase shadow-neo-sm",
                          lunas ? "bg-neo-green text-black" : "bg-neo-coral text-black"
                        )}
                      >
                        {lunas ? "✓ Lunas" : "Belum Bayar"}
                      </span>
                    )}
                  </button>

                  {/* WA reminder — sibling tombol expand (bukan nested):
                      anchor valid HTML di samping button, bukan di dalamnya.
                      Treatment secondary outline (bg-white + ink darkgreen):
                      solid neo-green dicadangkan untuk status LUNAS, agar
                      hijau tidak bermakna ganda saat scan list. */}
                  {showWa && (
                    <a
                      href={waReminderUrl(m.nama, m.noHp, NAMA_BULAN[bulan - 1], "Rp 30.000")}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Kirim pengingat WhatsApp ke ${m.nama}`}
                      className="flex min-h-[44px] min-w-[44px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-r-[10px] border-l-2 border-black bg-white neo-press neo-press-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black"
                    >
                      <MessageCircle className="h-4 w-4 stroke-[2.5] text-neo-darkgreen" aria-hidden="true" />
                      <span className="text-[8px] font-extrabold uppercase leading-none text-neo-darkgreen">WA</span>
                    </a>
                  )}

                  {/* Panel expand: aksi / form edit / konfirmasi nonaktif */}
                  {expanded && (
                    <div className="w-full border-t-2 border-black px-3 py-3">
                      {rowError?.id === m.id && (
                        <p
                          role="alert"
                          className="mb-3 rounded-xl border-2 border-black bg-neo-coral px-3 py-2 text-xs font-extrabold text-neo-darkred"
                        >
                          {rowError.pesan}
                        </p>
                      )}

                      {panel === "edit" ? (
                        <MemberForm
                          mode="edit"
                          member={m}
                          onSaved={handleSaved}
                          onCancel={tutupPanel}
                          onUnauthorized={keLogin}
                        />
                      ) : panel === "konfirmasi" ? (
                        <div>
                          <p className="text-xs font-extrabold uppercase text-black">
                            Nonaktifkan {m.nama}?
                          </p>
                          <p className="mt-1 text-[11px] font-bold text-slate-700">
                            Dia tidak bisa login lagi, tapi seluruh riwayat pembayarannya
                            tetap tersimpan.
                          </p>
                          <p className="mt-2 rounded-xl border-2 border-black bg-neo-yellow px-3 py-2 text-[11px] font-bold text-black">
                            Catatan: menonaktifkan mencegah login baru, tetapi TIDAK
                            mencabut sesi yang sedang aktif di HP-nya — sesi bisa terus
                            aktif selama app dibuka rutin. Untuk mencabut aksesnya
                            segera, <strong className="font-extrabold">reset PIN</strong>{" "}
                            anggota ini juga.
                          </p>
                          <div className="mt-3 grid grid-cols-2 gap-2">
                            <NeoButton
                              variant="white"
                              size="md"
                              fullWidth
                              onClick={() => setPanel("aksi")}
                              disabled={busyId === m.id}
                              data-testid="anggota-konfirmasi-batal"
                            >
                              Batal
                            </NeoButton>
                            <NeoButton
                              variant="coral"
                              size="md"
                              fullWidth
                              onClick={() => handleNonaktifkan(m)}
                              disabled={busyId === m.id}
                              data-testid="anggota-konfirmasi-nonaktif"
                            >
                              {busyId === m.id ? "Memproses..." : "Ya, Nonaktifkan"}
                            </NeoButton>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-2">
                          <NeoButton
                            variant="yellow"
                            size="md"
                            fullWidth
                            onClick={() => setPanel("edit")}
                            data-testid="anggota-edit-button"
                          >
                            Ubah Data
                          </NeoButton>
                          {m.statusAktif ? (
                            <NeoButton
                              variant="coral"
                              size="md"
                              fullWidth
                              onClick={() => {
                                setRowError(null);
                                setPanel("konfirmasi");
                              }}
                              data-testid="anggota-nonaktifkan-button"
                            >
                              Nonaktifkan
                            </NeoButton>
                          ) : (
                            <NeoButton
                              variant="green"
                              size="md"
                              fullWidth
                              onClick={() => handleAktifkan(m)}
                              disabled={busyId === m.id}
                              data-testid="anggota-reaktivasi-button"
                            >
                              {busyId === m.id ? "Mengaktifkan..." : "Aktifkan Kembali"}
                            </NeoButton>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <BottomNav />
    </main>
  );
}
