"use client";

// =====================================================================
// KasSurs — Tombol Keluar (logout) reusable untuk halaman admin.
// Perilaku TIDAK berubah: POST /api/auth/logout → router.replace("/login").
// Restyle Neo-Brutalism V2.2: NeoButton kecil (size sm, variant white).
// =====================================================================

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LogOut } from "lucide-react";
import NeoButton from "@/components/ui/NeoButton";

export interface LogoutButtonProps {
  // Hook E2E/unit — default "logout-button"; halaman boleh override
  // (mis. status member memakai "status-logout", FASE 3).
  testId?: string;
}

export default function LogoutButton({ testId = "logout-button" }: LogoutButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      router.replace("/login");
    }
  }

  return (
    <NeoButton
      variant="white"
      size="sm"
      onClick={handleLogout}
      disabled={loading}
      data-testid={testId}
      // Tap target ≥44px (3-DESIGN §7) — override per-use; NeoButton size="sm"
      // global tidak diubah (masih dipakai konteks non-header).
      className="min-h-[44px] shrink-0 py-2"
    >
      <span className="flex items-center gap-1">
        <LogOut className="w-3.5 h-3.5 stroke-[2.5]" aria-hidden="true" />
        {loading ? "Keluar..." : "Keluar"}
      </span>
    </NeoButton>
  );
}
