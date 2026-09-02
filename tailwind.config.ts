import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // Neo-Brutalism V2.2 — 3-DESIGN.md Bagian 2/8 (penamaan mengikuti mockup
      // .agents/kassurs_ui_neobrutalism.html). Token OKLCH V1.0 (canvas/surface/
      // text/border/primary/danger/warning/success) dihapus saat FASE-3
      // Langkah 4 cleanup — seluruh UI kini neo-only.
      colors: {
        neo: {
          bg: "#FFFDF0",
          surface: "#FFFFFF",
          card: "#FFFFFF",
          black: "#000000",
          yellow: "#FEF08A",
          green: "#86EFAC",
          darkgreen: "#15803D",
          coral: "#FCA5A5",
          darkred: "#B91C1C",
          purple: "#DDD6FE",
          sky: "#BAE6FD",
          orange: "#FED7AA",
          pink: "#FBCFE8",
          gray: "#F3F4F6",
        },
      },
      // Neo-Brutalism hard shadows (tanpa blur)
      boxShadow: {
        "neo-sm": "2px 2px 0px 0px #000000",
        neo: "3.5px 3.5px 0px 0px #000000",
        "neo-lg": "6px 6px 0px 0px #000000",
        "neo-xl": "10px 10px 0px 0px #000000",
      },
      // Neo-Brutalism border widths (mockup memakai border-1.5 / 2.5 / 3)
      borderWidth: {
        "1.5": "1.5px",
        "2.5": "2.5px",
        "3": "3px",
      },
      // Typography — Bricolage Grotesque via next/font (3-DESIGN.md V2.2 Bagian 3)
      // JetBrains Mono dihapus 2026-09-03 (mobile perf: ~25KB untuk 1 badge) — mono fallback ke monospace generic.
      fontFamily: {
        sans: ["var(--font-bricolage)", "system-ui", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      // Skala ukuran sesuai 3-DESIGN.md: sm 14, base 16, lg 20, 2xl 28
      fontSize: {
        sm: ["0.875rem", { lineHeight: "1.25rem" }],
        base: ["1rem", { lineHeight: "1.5rem" }],
        lg: ["1.25rem", { lineHeight: "1.75rem" }],
        "2xl": ["1.75rem", { lineHeight: "2.25rem" }],
      },
    },
  },
  plugins: [],
};

export default config;
