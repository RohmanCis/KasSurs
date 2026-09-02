"use client";

// =====================================================================
// KasSurs — T-13: Form Login (restyle Neo-Brutalism V2.2)
// Perilaku auth TIDAK berubah: POST /api/auth/login → redirect "/"
// (root redirect by-role di page.tsx). Error dari LoginErrorResponse:
//   401 INVALID_CREDENTIALS → "Nomor HP atau PIN salah"
//   429 ACCOUNT_LOCKED      → banner coral + sisa waktu dari lockedUntil
//   400 INVALID_INPUT       → pesan server
// PIN: 6-box grid-cols-6 (resep 5.6 + mockup baris 384-392) — input per
// digit, auto-advance, backspace mundur, paste terdistribusi. PIN valid
// 4-6 digit (kontrak) → submit aktif mulai 4 digit terisi.
// =====================================================================

import { useRouter } from "next/navigation";
import { useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from "react";
import { ArrowRight, ShieldAlert } from "lucide-react";
import NeoButton from "@/components/ui/NeoButton";
import { cn } from "@/lib/utils";
import type { LoginErrorResponse } from "@/lib/types";

const PIN_LEN = 6;

type FormState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; pesan: string; lockout: boolean };

function pesanLockout(lockedUntil?: string): string {
  if (!lockedUntil) {
    return "Akun terkunci sementara karena terlalu banyak salah PIN. Coba lagi nanti.";
  }
  const sisaMs = new Date(lockedUntil).getTime() - Date.now();
  const sisaMenit = Math.max(1, Math.ceil(sisaMs / 60000));
  return `Terlalu banyak salah PIN. Akun terkunci sementara — coba lagi dalam ${sisaMenit} menit.`;
}

export default function LoginForm() {
  const router = useRouter();
  const [noHp, setNoHp] = useState("");
  const [digits, setDigits] = useState<string[]>(Array(PIN_LEN).fill(""));
  const [state, setState] = useState<FormState>({ status: "idle" });
  const boxRefs = useRef<Array<HTMLInputElement | null>>([]);

  const loading = state.status === "loading";
  const pin = digits.join("");

  function setDigit(i: number, v: string) {
    const d = v.replace(/\D/g, "").slice(-1);
    setDigits((cur) => {
      const next = [...cur];
      next[i] = d;
      return next;
    });
    if (d && i < PIN_LEN - 1) boxRefs.current[i + 1]?.focus();
  }

  function handleKeyDown(i: number, e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      boxRefs.current[i - 1]?.focus();
      setDigits((cur) => {
        const next = [...cur];
        next[i - 1] = "";
        return next;
      });
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, PIN_LEN);
    if (!pasted) return;
    setDigits((cur) => {
      const next = [...cur];
      for (let i = 0; i < pasted.length; i++) next[i] = pasted[i];
      return next;
    });
    boxRefs.current[Math.min(pasted.length, PIN_LEN - 1)]?.focus();
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState({ status: "loading" });

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noHp: noHp.trim(), pin }),
      });

      if (res.ok) {
        router.push("/");
        router.refresh();
        return;
      }

      const data = (await res.json()) as LoginErrorResponse;

      if (res.status === 429 || data.error === "ACCOUNT_LOCKED") {
        setState({ status: "error", pesan: pesanLockout(data.lockedUntil), lockout: true });
      } else if (res.status === 401 || data.error === "INVALID_CREDENTIALS") {
        setState({ status: "error", pesan: "Nomor HP atau PIN salah.", lockout: false });
      } else {
        setState({
          status: "error",
          pesan: data.message || "Periksa kembali nomor HP dan PIN kamu.",
          lockout: false,
        });
      }
    } catch {
      setState({
        status: "error",
        pesan: "Tidak bisa terhubung ke server. Periksa koneksi, lalu coba lagi.",
        lockout: false,
      });
    }
  }

  // No HP: wrapper + prefix "+62" (resep 5.6, mockup baris 372-375).
  // Prefix murni visual — value/submit tetap format "08...".
  const noHpWrapper =
    "flex border-[2.5px] border-black rounded-xl shadow-neo-sm overflow-hidden " +
    "focus-within:ring-2 focus-within:ring-neo-yellow " +
    (loading ? "bg-neo-gray" : "bg-white");

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {state.status === "error" && (
        <div
          role="alert"
          aria-live="assertive"
          data-testid={state.lockout ? "login-lockout-banner" : "login-error"}
          className={cn(
            // Shake halus saat error (3-DESIGN Bagian 6) — banner remount
            // tiap submit → animasi replay otomatis.
            "animate-shake p-3 border-[2.5px] border-black rounded-xl shadow-neo-sm text-black bg-neo-coral"
          )}
        >
          <div className="flex items-center gap-2 font-extrabold text-xs uppercase">
            <ShieldAlert className="w-4 h-4 stroke-[2.5] text-neo-darkred" aria-hidden="true" />
            {state.lockout ? "Peringatan Lockout (5x Salah)" : "Login Gagal"}
          </div>
          <p className="text-[11px] font-bold text-slate-900 mt-1">{state.pesan}</p>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="noHp"
          className="text-[11px] font-extrabold uppercase tracking-wider text-black"
        >
          Nomor Handphone
        </label>
        <div className={noHpWrapper}>
          <span
            aria-hidden="true"
            className="flex items-center border-r-[2.5px] border-black bg-neo-yellow px-3 text-xs font-extrabold text-black"
          >
            +62
          </span>
          <input
            id="noHp"
            name="noHp"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            required
            value={noHp}
            onChange={(e) => setNoHp(e.target.value)}
            placeholder="Contoh: 081234567890"
            disabled={loading}
            data-testid="login-nohp-input"
            className="w-full bg-transparent px-3 py-2.5 text-sm font-bold tracking-wide text-black outline-none placeholder:text-slate-400"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between items-center">
          <label
            htmlFor="pin-0"
            className="text-[11px] font-extrabold uppercase tracking-wider text-black"
          >
            PIN Keamanan (4-6 Digit)
          </label>
          <span className="text-[9px] bg-neo-pink px-1.5 py-0.5 border border-black rounded font-extrabold uppercase tabular-nums">
            Bcrypt Hash
          </span>
        </div>
        <div className="grid grid-cols-6 gap-1.5" role="group" aria-label="PIN 6 digit">
          {digits.map((d, i) => (
            <input
              key={i}
              ref={(el) => {
                boxRefs.current[i] = el;
              }}
              id={`pin-${i}`}
              type="password"
              inputMode="numeric"
              autoComplete={i === 0 ? "current-password" : "off"}
              maxLength={1}
              required={i === 0}
              value={d}
              onChange={(e) => setDigit(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              onPaste={handlePaste}
              disabled={loading}
              aria-label={`Digit PIN ${i + 1}`}
              data-testid={`login-pin-box-${i}`}
              className={cn(
                "h-11 w-full border-[2.5px] border-black bg-white rounded-lg text-center font-extrabold text-base shadow-neo-sm",
                "focus:outline-none focus:bg-neo-yellow focus:ring-2 focus:ring-black disabled:bg-neo-gray"
              )}
            />
          ))}
        </div>
      </div>

      <NeoButton
        type="submit"
        variant="green"
        size="lg"
        fullWidth
        disabled={loading || !noHp.trim() || pin.length < 4}
        data-testid="login-submit"
        className="mt-2 tracking-wide uppercase"
      >
        <span className="flex items-center justify-center gap-2">
          {loading ? "Memeriksa..." : "Masuk"}
          <ArrowRight className="w-4 h-4 stroke-[3]" aria-hidden="true" />
        </span>
      </NeoButton>
    </form>
  );
}
