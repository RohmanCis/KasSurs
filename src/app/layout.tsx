import type { Metadata } from "next";
import { Bricolage_Grotesque, JetBrains_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

// Neo-Brutalism V2.2 — font tunggal utama (3-DESIGN.md Bagian 3)
const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-bricolage",
  display: "swap",
});

// Font kedua khusus nominal/angka (PIN, Rupiah besar, meta teknis)
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "KasSurs",
  description: "Aplikasi kas bulanan organisasi",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className={`${bricolage.variable} ${jetbrainsMono.variable}`}>
      <body className="min-h-dvh bg-neo-bg font-sans text-black">
        {children}
        <Toaster
          position="top-center"
          toastOptions={{
            unstyled: true,
            className:
              "border-[3px] border-black text-black font-extrabold rounded-xl shadow-neo-lg px-3.5 py-2.5 text-xs flex items-center gap-2",
            // Warna per status (3-DESIGN Bagian 6): sukses/default kuning,
            // error coral — bg TIDAK di className global agar tidak tabrakan.
            classNames: {
              default: "bg-neo-yellow",
              success: "bg-neo-yellow",
              error: "bg-neo-coral",
            },
          }}
        />
      </body>
    </html>
  );
}
