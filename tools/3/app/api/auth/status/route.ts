import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  GOOGLE_ACCESS_COOKIE,
  GOOGLE_EXPIRY_COOKIE,
  isGoogleOAuthConfigured,
} from "@/lib/auth";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(GOOGLE_ACCESS_COOKIE)?.value;
  const expiryRaw = cookieStore.get(GOOGLE_EXPIRY_COOKIE)?.value;
  const expiry = expiryRaw ? Number(expiryRaw) : 0;
  const googleConnected = Boolean(token && Number.isFinite(expiry) && Date.now() < expiry);

  return NextResponse.json({
    google: {
      configured: isGoogleOAuthConfigured(),
      connected: googleConnected,
    },
  });
}

