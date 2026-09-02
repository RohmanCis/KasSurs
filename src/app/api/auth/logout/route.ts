// T-11: POST /api/auth/logout — hapus session cookie.
import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth";

export async function POST() {
  clearSessionCookie();
  return NextResponse.json({ success: true });
}
