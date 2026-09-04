// =====================================================================
// KasSurs — Format & Date module (architecture review #3, 2026-09-03)
// Satu sumber untuk util format/tanggal yang sebelumnya disalin antar
// file (todayISO ×2, formatRupiah ×4, NAMA_BULAN ×6, formatRibuan ×3).
// Murni fungsi — aman dipakai client & server (tanpa import React).
// =====================================================================

export const NAMA_BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
] as const;

export const NAMA_BULAN_SINGKAT = [
  "JAN", "FEB", "MAR", "APR", "MEI", "JUN",
  "JUL", "AGU", "SEP", "OKT", "NOV", "DES",
] as const;

// Hari ini date-only WIB (bukan toISOString: UTC bisa bergeser sehari
// di WIB 00:00-06:59 — bug historis oracle #2). Kontrak tetap YYYY-MM-DD.
// WIB-safe di client & server (delegasi wibDateParts — Vercel TZ=UTC aman).
export function todayISO(): string {
  const { tahun, bulan, tanggal } = wibDateParts();
  return `${tahun}-${String(bulan).padStart(2, "0")}-${String(tanggal).padStart(2, "0")}`;
}

// 30000 → "Rp 30.000" (locale id-ID). Varian Intl currency (NBSP, dipakai
// PassbookCard/pdf.ts) SENGAJA tidak digabung — output beda, jangan samakan.
export function formatRupiah(n: number): string {
  return `Rp ${n.toLocaleString("id-ID")}`;
}

// "30000" → "30.000" — grouping ribuan untuk input nominal (digit string).
export function formatRibuan(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

// "2026-09-01" → "1 Sep" (list ringkas; tahun ada di header periode).
// ponytail: parse `T00:00:00` lokal — benar di browser (client-only saat ini);
// kalau dipakai di server (TZ=UTC) tetap aman karena offset 0, tapi jadikan
// eksplisit kalau muncul kebutuhan server-side.
export function formatTanggal(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "short" }).format(d);
}

// Varian 2-digit ("05 Agu") — dipakai roster /pembayaran (tanggalLunas).
export function formatTanggalSingkat(iso: string): string {
  return new Intl.DateTimeFormat("id-ID", { day: "2-digit", month: "short" }).format(
    new Date(`${iso}T00:00:00`)
  );
}

// WIB (UTC+7) — server-safe (Vercel TZ=UTC; local methods return UTC).
// Dipakai RSC dashboard/status utk display bulan/tahun + todayISO().
export function wibDateParts(): { tahun: number; bulan: number; tanggal: number } {
  const wib = new Date(Date.now() + 7 * 60 * 60 * 1000);
  return { tahun: wib.getUTCFullYear(), bulan: wib.getUTCMonth() + 1, tanggal: wib.getUTCDate() };
}

// "08123..." → "628123..." — format internasional WhatsApp (wa.me).
export function toWaNumber(noHp: string): string {
  const digits = noHp.replace(/\D/g, "");
  if (digits.startsWith("0")) return "62" + digits.slice(1);
  if (digits.startsWith("62")) return digits;
  return "62" + digits;
}

export function waReminderUrl(nama: string, noHp: string, bulan: string, nominal: string): string {
  const nomor = toWaNumber(noHp);
  const pesan = encodeURIComponent(
    `Halo ${nama}, pengingat iuran kas bulan ${bulan} sebesar ${nominal} ya. Terima kasih 🙏`
  );
  return `https://wa.me/${nomor}?text=${pesan}`;
}
