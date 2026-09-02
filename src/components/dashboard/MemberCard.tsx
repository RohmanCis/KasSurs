"use client";

import React, { useRef } from "react";
import { Check, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MemberDTO } from "@/lib/types";

// MemberCard — Speed-Tap Roster card (resep 5.4 + collision protocol 5.10).
// Acuan DOM: mockup kassurs_ui_neobrutalism_final.html baris 1062-1089,
// badge BARU inline per 3-DESIGN.md 5.10(b) (FINAL 2026-09-02, bukan absolute).
//
// Gesture engine pakai pointer events (BUKAN onClick — click fire setelah
// long-press selesai → double-aksi). Long-press 450ms = rapel drawer,
// tap cepat = catat lunas. Scroll-safe: geser >10px membatalkan timer.
export interface MemberCardProps {
  member: MemberDTO;
  isNew?: boolean; // badge BARU — parent hitung usia payment <10 menit
  isPending?: boolean; // in-flight guard: kartu mati total + pill MENYIMPAN…
  tanggalLunas?: string; // mis. "01 Sep" — parent yang format
  jumlahTampil?: string; // default "Rp 30k"
  onTap?: (memberId: string) => void;
  onLongPress?: (memberId: string) => void; // parent boleh omit utk kartu LUNAS
  className?: string;
  "data-testid"?: string; // hook E2E Playwright (FASE-3 Langkah 3)
}

const LONG_PRESS_MS = 450;
const MOVE_TOLERANCE_PX = 10;

function MemberCard({
  member,
  isNew = false,
  isPending = false,
  tanggalLunas,
  jumlahTampil = "Rp 30k",
  onTap,
  onLongPress,
  className,
  "data-testid": testId,
}: MemberCardProps) {
  const lunas = member.statusBayarBulanIni === "LUNAS";

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);
  const longPressFiredRef = useRef(false);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    startPosRef.current = null;
  };

  const vibrate = (pattern: number | number[]) => {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(pattern);
    }
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isPending) return; // in-flight: kartu tidak menerima gesture
    // Long-press HANYA untuk kartu Belum Bayar (3-DESIGN 5.10 protocol) —
    // kartu LUNAS: tap biasa buka drawer, jangan start timer 450ms
    // (oracle #1 fix: timer di kartu LUNAS mem-block onTap + vibrate palsu).
    if (lunas) return;
    longPressFiredRef.current = false;
    startPosRef.current = { x: e.clientX, y: e.clientY };

    timerRef.current = setTimeout(() => {
      // Timer 450ms tercapai → long-press (rapel drawer)
      longPressFiredRef.current = true;
      vibrate(20);
      onLongPress?.(member.id);
      clearTimer();
    }, LONG_PRESS_MS);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isPending || !startPosRef.current) return;
    const dx = e.clientX - startPosRef.current.x;
    const dy = e.clientY - startPosRef.current.y;
    // Jarak Euclidean > 10px → user scroll, batalkan timer (scroll-safe)
    if (Math.hypot(dx, dy) > MOVE_TOLERANCE_PX) clearTimer();
  };

  const handlePointerUp = () => {
    if (isPending) return;
    const wasLongPress = longPressFiredRef.current;
    clearTimer();
    longPressFiredRef.current = false;
    // Anti double-aksi: long-press sudah fire → pointerup TIDAK fire onTap
    if (!wasLongPress) onTap?.(member.id);
  };

  const handlePointerCancel = () => {
    clearTimer();
    longPressFiredRef.current = false;
  };

  // Keyboard: Enter/Space = tap (setara tap cepat). Space wajib
  // preventDefault — default-nya scroll halaman. Modifier (Ctrl/Alt/Meta)
  // diabaikan agar shortcut browser tidak ikut memicu aksi.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (isPending || e.ctrlKey || e.altKey || e.metaKey) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onTap?.(member.id);
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={lunas}
      aria-disabled={isPending}
      data-testid={testId}
      aria-label={`${member.nama} — ${lunas ? "Lunas" : "Belum bayar"}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onPointerLeave={handlePointerCancel}
      onKeyDown={handleKeyDown}
      onContextMenu={(e) => e.preventDefault()}
      className={cn(
        "p-2.5 h-[72px] flex flex-col justify-between cursor-pointer border-[2.5px] border-black rounded-[14px] neo-press neo-press-md select-none [touch-action:manipulation] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-black",
        lunas
          ? "bg-neo-green text-black shadow-neo-sm"
          : "bg-white text-black shadow-neo [@media(hover:hover)]:hover:bg-neo-yellow",
        isPending && "opacity-70 pointer-events-none",
        className
      )}
    >
      {/* Baris atas: nama + badge BARU (opsional) + kotak ikon status */}
      <div className="flex items-center justify-between gap-1 w-full">
        <span className="text-xs font-bold text-black truncate flex-1 min-w-0">
          {member.nama}
        </span>
        {isNew && (
          <span className="pointer-events-none bg-neo-yellow border-1.5 border-black rounded px-1 text-[9px] font-extrabold uppercase shadow-neo-sm shrink-0">
            BARU
          </span>
        )}
        <span
          className={cn(
            "shrink-0 p-0.5 border border-black rounded",
            lunas ? "bg-white text-black" : "bg-neo-coral text-black"
          )}
        >
          {lunas ? (
            <Check className="w-3 h-3 stroke-[3]" />
          ) : (
            <Clock className="w-3 h-3 stroke-[3]" />
          )}
        </span>
      </div>

      {/* Baris bawah: nominal + pill status/aksi */}
      <div className="flex justify-between items-center text-[10px] font-extrabold">
        <span
          className={cn(
            "tabular-nums",
            lunas ? "text-black" : "text-slate-600"
          )}
        >
          {jumlahTampil}
        </span>
        <span
          className={cn(
            "px-1.5 py-0.5 border-1.5 border-black rounded text-[8px] uppercase",
            lunas ? "bg-white text-black" : "bg-neo-coral text-black"
          )}
        >
          {isPending
            ? "MENYIMPAN…"
            : lunas
              ? `LUNAS${tanggalLunas ? ` (${tanggalLunas})` : ""}`
              : "TAP LUNAS"}
        </span>
      </div>
    </div>
  );
}

// FASE 2 (memo): roster di /pembayaran re-render per keystroke search/filter
// — memo memblokir re-render kartu bila props-nya tak berubah (butuh handler
// konsumen stabil via useCallback, lihat pembayaran/page.tsx).
const MemoizedMemberCard = React.memo(MemberCard);

export default MemoizedMemberCard;
