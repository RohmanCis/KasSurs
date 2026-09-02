// =====================================================================
// KasSurs — T-13: Halaman Login (publik, dikecualikan dari middleware
// matcher → tidak kena redirect loop). Form dipisah ke Client Component.
// =====================================================================

import type { Metadata } from "next";
import { Coins } from "lucide-react";
import LoginForm from "@/components/forms/LoginForm";

export const metadata: Metadata = {
  title: "Masuk — KasSurs",
};

export default function LoginPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[430px] flex-col justify-center p-4">
      {/* Brand header — mockup subscreen-login (baris 349-356) */}
      <div className="mb-8 text-center">
        <div className="mb-2 inline-flex rounded-2xl border-[2.5px] border-black bg-neo-green p-3 shadow-neo">
          <Coins className="h-7 w-7 stroke-[2.5] text-black" aria-hidden="true" />
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight text-black">KasSurs.</h1>
        <p className="mt-0.5 text-xs font-semibold text-slate-700">
          Sistem Kas Organisasi — masuk dengan nomor HP dan PIN kamu.
        </p>
      </div>
      <LoginForm />
    </main>
  );
}
