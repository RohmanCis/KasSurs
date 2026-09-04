# KasSurs

Aplikasi web mobile-first untuk mengelola kas bulanan organisasi kecil — mengganti pencatatan manual (kertas) dengan sistem digital: transparansi status pembayaran, laporan PDF/Excel < 1 menit, dan keamanan dasar (PIN hash + rate-limiting).

**Live:** https://kas-surs.vercel.app

## Fitur

- **Auth No HP + PIN** — bcrypt hash, JWT cookie httpOnly 30 hari (sliding session), lockout 5x salah PIN
- **Speed-Tap roster** — catat iuran 1 tap + undo 5 detik, long-press untuk rapel/nominal kustom
- **Manajemen anggota** — CRUD, soft-delete (nonaktif), pengingat WhatsApp deep-link
- **Pengeluaran** — voucher kas keluar dengan kategori
- **Dashboard bendahara** — saldo, iuran terkumpul, kas masuk/keluar
- **Laporan** — PDF (jsPDF) & Excel (SheetJS) dengan snapshot beku per periode
- **Buku kas digital** — self-service anggota cek status bayar + saldo umum

## Tech Stack

Next.js 14 (App Router) · TypeScript · Tailwind CSS · Prisma + PostgreSQL (Supabase) · Vitest · Playwright

## Setup Lokal

```bash
git clone https://github.com/RohmanCis/KasSurs.git
cd KasSurs
npm install

# Environment
cp .env.example .env.local
cp .env.local .env        # Prisma CLI 5 baca .env, bukan .env.local
# isi: DATABASE_URL, DIRECT_URL, JWT_SECRET, SEED_ADMIN_PHONE, SEED_ADMIN_PIN

# Database
npx prisma migrate dev
npx prisma db seed        # kategori default + admin awal (idempotent)

npm run dev               # http://localhost:3000
```

## Testing

```bash
# DB test terisolasi (Docker, port 5433)
docker start kassurs-test-db

npm run test              # Vitest — unit + integration
npm run test:e2e          # Playwright — smoke test alur kritikal
```

## Lisensi

[MIT](LICENSE)
