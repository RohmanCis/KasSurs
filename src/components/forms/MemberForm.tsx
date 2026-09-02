"use client";

// =====================================================================
// KasSurs — T-19: Form Tambah/Edit Anggota (FR-02, FR-03)
// Mode "create": nama + noHp + PIN (wajib, 4-6 digit).
// Mode "edit": nama + noHp + PIN baru opsional (kosong = tidak diubah) —
// hanya field berubah yang dikirim (UpdateMemberRequest, minimal satu).
// Error server inline (MemberErrorResponse):
//   409 PHONE_ALREADY_REGISTERED → "No HP sudah terdaftar..."
//   400 INVALID_INPUT            → pesan validasi server
//   401 UNAUTHORIZED             → delegasi ke parent (redirect /login)
// =====================================================================

import { useState, type FormEvent } from "react";
import NeoButton from "@/components/ui/NeoButton";
import type {
  CreateMemberRequest,
  MemberDTO,
  MemberErrorResponse,
  UpdateMemberRequest,
} from "@/lib/types";

interface MemberFormProps {
  mode: "create" | "edit";
  member?: MemberDTO; // wajib diisi jika mode = "edit"
  onSaved: (member: MemberDTO, mode: "create" | "edit") => void;
  onCancel: () => void;
  onUnauthorized: () => void;
}

const PIN_REGEX = /^\d{4,6}$/;

export default function MemberForm({
  mode,
  member,
  onSaved,
  onCancel,
  onUnauthorized,
}: MemberFormProps) {
  const [nama, setNama] = useState(member?.nama ?? "");
  const [noHp, setNoHp] = useState(member?.noHp ?? "");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = mode === "edit";

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const namaTrim = nama.trim();
    const noHpTrim = noHp.trim();

    // Validasi client dulu — instan, tanpa tunggu server (server tetap
    // validasi ulang via Zod sebagai lapisan kedua).
    if (!namaTrim) return setError("Nama wajib diisi.");
    if (!noHpTrim) return setError("No HP wajib diisi.");
    if (!isEdit && !PIN_REGEX.test(pin)) {
      return setError("PIN harus 4-6 digit angka.");
    }
    if (isEdit && pin !== "" && !PIN_REGEX.test(pin)) {
      return setError("PIN baru harus 4-6 digit angka.");
    }

    setLoading(true);
    try {
      let res: Response;
      if (isEdit) {
        // Hanya kirim field yang benar-benar berubah (body kosong → 400).
        const body: UpdateMemberRequest = {};
        if (namaTrim !== member?.nama) body.nama = namaTrim;
        if (noHpTrim !== member?.noHp) body.noHp = noHpTrim;
        if (pin !== "") body.pin = pin;
        if (Object.keys(body).length === 0) {
          setLoading(false);
          return setError("Tidak ada perubahan untuk disimpan.");
        }
        res = await fetch(`/api/members/${member!.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        const body: CreateMemberRequest = { nama: namaTrim, noHp: noHpTrim, pin };
        res = await fetch("/api/members", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }

      if (res.status === 401) {
        onUnauthorized();
        return;
      }

      if (res.ok) {
        const dto = (await res.json()) as MemberDTO;
        onSaved(dto, mode);
        return;
      }

      const data = (await res.json()) as MemberErrorResponse;
      if (res.status === 409 || data.error === "PHONE_ALREADY_REGISTERED") {
        setError("No HP sudah terdaftar. Gunakan nomor lain.");
      } else {
        setError(data.message || "Periksa kembali isian form.");
      }
    } catch {
      setError("Tidak bisa terhubung ke server. Periksa koneksi, lalu coba lagi.");
    } finally {
      setLoading(false);
    }
  }

  // Neo-Brutalism V2.2 — input resep 5.6, label uppercase font-black
  const inputClass =
    "w-full rounded-xl border-2 border-black bg-white px-3 py-2.5 text-sm font-bold text-black shadow-neo-sm " +
    "placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-neo-yellow disabled:bg-neo-gray";
  const labelClass = "text-[10px] font-extrabold uppercase tracking-wider text-black";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
      <div className="flex flex-col gap-1">
        <label htmlFor={isEdit ? `nama-${member?.id}` : "nama-baru"} className={labelClass}>
          Nama
        </label>
        <input
          id={isEdit ? `nama-${member?.id}` : "nama-baru"}
          name="nama"
          type="text"
          autoComplete="name"
          required
          value={nama}
          onChange={(e) => setNama(e.target.value)}
          placeholder="Nama lengkap anggota"
          disabled={loading}
          data-testid="anggota-input-nama"
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={isEdit ? `noHp-${member?.id}` : "noHp-baru"} className={labelClass}>
          Nomor HP
        </label>
        <input
          id={isEdit ? `noHp-${member?.id}` : "noHp-baru"}
          name="noHp"
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          required
          value={noHp}
          onChange={(e) => setNoHp(e.target.value)}
          placeholder="Contoh: 081234567890"
          disabled={loading}
          data-testid="anggota-input-nohp"
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={isEdit ? `pin-${member?.id}` : "pin-baru"} className={labelClass}>
          {isEdit ? "PIN Baru (opsional)" : "PIN"}
        </label>
        <input
          id={isEdit ? `pin-${member?.id}` : "pin-baru"}
          name="pin"
          type="password"
          inputMode="numeric"
          autoComplete="new-password"
          maxLength={6}
          {...(isEdit ? {} : { required: true })}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
          placeholder={isEdit ? "Kosongkan jika tidak diubah" : "4-6 digit angka"}
          disabled={loading}
          data-testid="anggota-input-pin"
          className={inputClass}
        />
        {isEdit && (
          <p className="text-[10px] font-bold text-slate-600">
            Isi hanya jika ingin mereset PIN anggota ini.
          </p>
        )}
      </div>

      {error && (
        <p
          role="alert"
          aria-live="assertive"
          data-testid="anggota-form-error"
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
          onClick={onCancel}
          disabled={loading}
          data-testid="anggota-form-cancel"
        >
          Batal
        </NeoButton>
        <NeoButton
          type="submit"
          variant="green"
          size="md"
          fullWidth
          disabled={loading}
          data-testid="anggota-form-submit"
        >
          {loading ? "Menyimpan..." : isEdit ? "Simpan Perubahan" : "Tambah Anggota"}
        </NeoButton>
      </div>
    </form>
  );
}
