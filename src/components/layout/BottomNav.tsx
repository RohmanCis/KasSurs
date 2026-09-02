"use client";

// =====================================================================
// KasSurs — Bottom navigation admin (Neo-Brutalism V2.2, resep 3-DESIGN
// 4.1/5.7). 5 tab, href/label/perilaku TIDAK berubah — murni restyle:
// border-t-[2.5px] hitam, tab aktif = pill kuning + shadow-neo-sm +
// font-black (mockup baris 510-527), fixed bottom + safe-area inset.
// Ikon: lucide-react (5.9 — ikon fungsional selalu lucide, bukan SVG manual).
// =====================================================================

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  ArrowDownToLine,
  FileText,
  Home,
  Users,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Tab {
  href: string;
  label: string;
  icon: ReactNode;
}

// Ikon lucide strokeWidth 2.5 — standar 5.9 (mengimbangi border 2.5px).
const iconProps = {
  className: "h-5 w-5",
  strokeWidth: 2.5,
  "aria-hidden": true as const,
};

const TABS: Tab[] = [
  { href: "/dashboard", label: "Beranda", icon: <Home {...iconProps} /> },
  { href: "/anggota", label: "Anggota", icon: <Users {...iconProps} /> },
  { href: "/pembayaran", label: "Pembayaran", icon: <Wallet {...iconProps} /> },
  { href: "/pengeluaran", label: "Pengeluaran", icon: <ArrowDownToLine {...iconProps} /> },
  { href: "/laporan", label: "Laporan", icon: <FileText {...iconProps} /> },
];

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navigasi utama"
      data-testid="bottom-nav"
      className="fixed inset-x-0 bottom-0 z-40 border-t-3 border-black bg-neo-surface pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto flex h-16 w-full max-w-[430px] items-center justify-around px-2 md:max-w-2xl">
        {TABS.map((tab) => {
          const aktif = pathname.startsWith(tab.href);
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={aktif ? "page" : undefined}
                data-testid={`nav-${tab.href.slice(1)}`}
                className={cn(
                  // Press-down wajib di semua elemen interaktif (5.2) —
                  // skala kecil (2px) karena tab nav bukan aksi utama.
                  "mx-0.5 flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 text-[10px] transition-[transform,box-shadow,background-color,color] duration-100 select-none active:translate-x-[2px] active:translate-y-[2px] active:shadow-none focus:outline-none focus:ring-2 focus:ring-inset focus:ring-black",
                  aktif
                    ? "border-2 border-black bg-neo-yellow font-extrabold text-black shadow-neo-sm"
                    : "font-bold text-slate-600 [@media(hover:hover)]:hover:text-black"
                )}
              >
                {tab.icon}
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
