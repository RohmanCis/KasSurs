// =====================================================================
// KasSurs — Halaman Status Anggota (View-Only) (FR-14 V1.1 — Neo V2.2)
// Server Component (FASE 3, 2026-09-03) — tanpa fetch client:
// - PassbookCard (kupon status bulan berjalan + matriks iuran 12 bulan):
//   payments histori PRIBADI di-query inline (memberId = session.memberId),
//   bukan lewat GET /api/payments.
// - Kartu transparansi saldo umum: getDashboardSummary(session) (response
//   ANGGOTA: tanpa jumlahBelumBayar) + baris "Sudah bayar bulan ini"
//   (fix MINOR 1) — mockup baris 670-680.
// - Header Sky (resep 5.7, mockup baris 615-623) + LogoutButton (keluar).
// TIDAK ada aksi edit/hapus — murni view (scope RBAC tidak berubah).
// =====================================================================

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import PassbookCard from "@/components/member/PassbookCard";
import LogoutButton from "@/components/ui/LogoutButton";
import { prisma } from "@/lib/prisma";
import { getDashboardSummary } from "@/lib/dashboard";
import { verifySession, SESSION_COOKIE_NAME } from "@/lib/auth";
import { wibDateParts, formatRupiah } from "@/lib/format";
import type { PaymentDTO } from "@/lib/types";

export default async function StatusPage() {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySession(token) : null;
  if (!session) redirect("/login");
  if (session.role !== "ANGGOTA") redirect("/dashboard");

  const { tahun, bulan } = wibDateParts();

  const [summary, paymentsRaw, member] = await Promise.all([
    getDashboardSummary(session),
    // Histori pribadi — inline query (bukan /api/payments): server sudah
    // pegang session, tidak perlu round-trip HTTP ke diri sendiri.
    prisma.payment.findMany({
      where: { memberId: session.memberId },
      include: { member: { select: { nama: true } } },
      orderBy: [{ tahun: "desc" }, { bulan: "desc" }],
    }),
    // Profil diri (nama + statusAktif) — anggota nonaktif dgn session valid
    // tetap akses (sliding session), jadi status harus dari DB, bukan hardcode.
    prisma.member.findUnique({
      where: { id: session.memberId },
      select: { nama: true, statusAktif: true },
    }),
  ]);

  // Serialisasi PaymentDTO inline — mapping persis toPaymentDTO
  // (src/app/api/payments/route.ts). memberNama denormalized (bukan field
  // asli tabel). // ponytail: unify toPaymentDTO ke lib saat API Handler Kit #1.
  const payments: PaymentDTO[] = paymentsRaw.map((p) => ({
    id: p.id,
    memberId: p.memberId,
    memberNama: p.member.nama, // denormalized — bukan field asli tabel
    bulan: p.bulan,
    tahun: p.tahun,
    jumlah: p.jumlah,
    tanggalBayar: p.tanggalBayar.toISOString().slice(0, 10),
    createdAt: p.createdAt.toISOString(),
  }));

  // Nama + status dari DB (member) — fallback "Anggota" utk member record
  // hilang (edge: session valid, member dihapus fisik — tidak terjadi via UI).
  const nama = member?.nama ?? "Anggota";

  return (
    <main className="mx-auto w-full max-w-[430px] pb-8 md:max-w-2xl">
      {/* Header bar — resep 5.7 (passbook = Sky), mockup baris 615-623 */}
      <header className="flex items-center justify-between border-b-[2.5px] border-black bg-neo-sky px-4 py-2.5">
        <div>
          <span className="block text-[10px] font-extrabold uppercase text-black">
            Status Kas Anggota
          </span>
          <span className="text-xs font-extrabold text-black">{nama}</span>
        </div>
        <LogoutButton testId="status-logout" />
      </header>

      <div className="space-y-3.5 p-3.5">
        <PassbookCard
          nama={nama}
          statusAktif={member?.statusAktif ?? true}
          tahun={tahun}
          bulanIni={bulan}
          payments={payments}
          data-testid="passbook-card"
        />

        {/* Transparansi saldo umum (FR-14) — mockup baris 670-680 */}
        <div
          data-testid="saldo-umum-card"
          className="space-y-1.5 rounded-2xl border-[2.5px] border-black bg-neo-yellow p-3 text-xs font-bold text-black shadow-neo-sm"
        >
          <span className="block text-[10px] font-extrabold uppercase tracking-wider">
            Transparansi Saldo Komunitas
          </span>
          <div className="flex items-center justify-between border-b border-black py-1">
            <span>Total Kas Bersama:</span>
            <span className="text-sm font-extrabold tabular-nums">
              {formatRupiah(summary.saldo)}
            </span>
          </div>
          <div className="flex justify-between text-[10px] text-slate-800">
            <span>Masuk bulan ini:</span>
            <span className="font-extrabold tabular-nums text-neo-darkgreen">
              + {formatRupiah(summary.totalMasukBulanIni)}
            </span>
          </div>
          <div className="flex justify-between text-[10px] text-slate-800">
            <span>Sudah bayar bulan ini:</span>
            <span className="font-extrabold tabular-nums">
              {summary.jumlahLunas} dari {summary.jumlahAnggotaAktif} anggota
            </span>
          </div>
          <div className="flex justify-between text-[10px] text-slate-800">
            <span>Keluar bulan ini:</span>
            <span className="font-extrabold tabular-nums text-neo-darkred">
              - {formatRupiah(summary.totalKeluarBulanIni)}
            </span>
          </div>
        </div>

        <p className="text-center text-[10px] font-bold text-slate-600">
          Kalau status belum berubah setelah kamu membayar, hubungi bendahara.
        </p>
      </div>
    </main>
  );
}
