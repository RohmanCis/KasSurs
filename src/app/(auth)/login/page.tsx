// =====================================================================
// KasSurs — T-13: Halaman Login (publik, dikecualikan dari middleware
// matcher → tidak kena redirect loop). Form dipisah ke Client Component.
// =====================================================================

import type { Metadata } from "next";
import LoginForm from "@/components/forms/LoginForm";

export const metadata: Metadata = {
  title: "Masuk — KasSurs",
};

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col justify-center p-4">
      {/* Brand header — mockup subscreen-login (baris 349-356) */}
      <div className="mb-8 text-center">
        {/* Brand mark — SVG sudah bawa frame hijau rounded sendiri; wrapper cukup shadow */}
        <img
          src="/icon.svg"
          alt=""
          aria-hidden="true"
          width={64}
          height={64}
          className="mb-2 inline-block h-16 w-16 rounded-2xl shadow-neo"
        />
        <h1 className="text-2xl font-extrabold tracking-tight text-black">KasSurs.</h1>
        <p className="mt-0.5 text-xs font-bold text-slate-700">
          Sistem Kas Grup D TFI - Login Pakai No HP dan PIN ya Dogs...
        </p>
      </div>
      <LoginForm />
    </main>
  );
}
