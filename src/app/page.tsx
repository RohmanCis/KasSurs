// =====================================================================
// KasSurs — Root "/" redirect by-role (fix QA #1, 2026-09-01):
// ADMIN → /dashboard, ANGGOTA → /status. Tanpa sesi → /login
// (normalnya sudah dicegat middleware, ini jaring kedua).
// Dulunya stub statis — user selalu perlu navigasi manual pasca-login.
// =====================================================================

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE_NAME, verifySession } from "@/lib/auth";

export default async function Home() {
  const token = cookies().get(SESSION_COOKIE_NAME)?.value;
  const session = token ? await verifySession(token) : null;
  if (!session) redirect("/login");
  redirect(session.role === "ADMIN" ? "/dashboard" : "/status");
}
