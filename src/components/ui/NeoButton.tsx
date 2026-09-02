"use client";

import React from "react";
import { cn } from "@/lib/utils";

// NeoButton — resep 5.2 3-DESIGN.md V2.2 (Neo-Brutalism)
// Press-down WAJIB: active:translate 3.5px + shadow hilang — signature tactile.
// Variant "black" = inverted (state aktif/terpilih, 3-DESIGN.md Bagian 2).
export type NeoButtonVariant =
  | "green"
  | "coral"
  | "yellow"
  | "sky"
  | "purple"
  | "white"
  | "black";

export interface NeoButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: NeoButtonVariant; // default "white"
  size?: "sm" | "md" | "lg"; // lg = tap target ≥44px (py-3.5)
  fullWidth?: boolean;
}

const variantClass: Record<NeoButtonVariant, string> = {
  green: "bg-neo-green text-black",
  coral: "bg-neo-coral text-black",
  yellow: "bg-neo-yellow text-black",
  sky: "bg-neo-sky text-black",
  purple: "bg-neo-purple text-black",
  white: "bg-neo-surface text-black",
  black: "bg-black text-neo-yellow",
};

const sizeClass: Record<NonNullable<NeoButtonProps["size"]>, string> = {
  sm: "text-xs px-2 py-1",
  md: "text-sm px-3.5 py-2.5",
  lg: "text-base px-3.5 py-3.5",
};

// Disabled menggantikan shadow & press-down (keputusan final: tanpa opacity,
// gaya "sudah tertekan" + abu) — didefinisikan setelah variant agar
// tailwind-merge menimpa bg-* variant saat disabled.
const disabledClass =
  "disabled:shadow-none disabled:translate-x-[3.5px] disabled:translate-y-[3.5px] disabled:bg-neo-gray disabled:text-slate-500 disabled:cursor-not-allowed disabled:pointer-events-none";

const NeoButton = React.forwardRef<HTMLButtonElement, NeoButtonProps>(
  (
    {
      variant = "white",
      size = "md",
      fullWidth = false,
      disabled = false,
      className,
      onClick,
      type = "button",
      ...props
    },
    ref
  ) => {
    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      // Guard defensif: disabled tidak boleh memicu aksi apa pun
      if (disabled) return;
      onClick?.(e);
    };

    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled}
        onClick={handleClick}
        className={cn(
          "border-[2.5px] border-black rounded-xl font-bold shadow-neo transition-all duration-100 select-none",
          "active:translate-x-[3.5px] active:translate-y-[3.5px] active:shadow-none",
          "hover:-translate-x-px hover:-translate-y-px",
          variantClass[variant],
          sizeClass[size],
          fullWidth && "w-full",
          disabledClass,
          className
        )}
        {...props}
      />
    );
  }
);

NeoButton.displayName = "NeoButton";

export default NeoButton;
